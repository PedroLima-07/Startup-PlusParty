-- =====================================================================
-- criar_pedido — cria o pedido e seus itens numa transação só.
--
-- Por que existe:
--   Antes, o app fazia dois inserts separados (pedidos, depois pedido_itens).
--   Se o segundo falhasse, a linha em "pedidos" já estava gravada e ficava
--   órfã no banco. E o preco_unitario vinha do navegador, então o preço podia
--   ser forjado pelo DevTools antes de confirmar o pedido.
--
--   Esta função resolve os dois: tudo acontece numa transação (qualquer
--   exception desfaz o pedido inteiro) e o preço é lido da tabela "itens"
--   aqui no servidor, ignorando o que o cliente mandou.
--
-- Decisões de segurança:
--   security invoker  — o RLS continua valendo. As policies de "pedidos" e
--                       "pedido_itens" seguem sendo a guarda de quem pode criar.
--   set search_path   — sem isso o Postgres procura em pg_temp antes de public,
--                       e quem conseguisse criar uma tabela temporária chamada
--                       "itens" faria a função ler os preços dela.
--   revoke de public  — função nova nasce com EXECUTE para PUBLIC, o que inclui
--                       o papel anon. Revogamos e liberamos só para authenticated.
--
-- Como rodar: painel do Supabase -> SQL Editor -> New query -> colar -> Run.
-- =====================================================================

create or replace function public.criar_pedido(
  p_comanda_id uuid,
  p_itens jsonb   -- [{"item_id":"uuid","quantidade":2}, ...]
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pedido_id uuid;
  v_estabelecimento_id uuid;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens.';
  end if;

  -- a comanda precisa ser deste usuário e já estar liberada pelo atendente
  select c.estabelecimento_id into v_estabelecimento_id
  from comandas c
  where c.id = p_comanda_id
    and c.usuario_id = auth.uid()
    and c.status = 'aberta';

  if v_estabelecimento_id is null then
    raise exception 'Comanda não está aberta para este usuário.';
  end if;

  insert into pedidos (comanda_id)
  values (p_comanda_id)
  returning id into v_pedido_id;

  -- o preço vem de "itens", nunca do payload
  insert into pedido_itens (pedido_id, item_id, quantidade, preco_unitario, status)
  select v_pedido_id, i.id, (e->>'quantidade')::int, i.preco, 'novo'
  from jsonb_array_elements(p_itens) e
  join itens i on i.id = (e->>'item_id')::uuid
  where i.disponivel = true
    and i.estabelecimento_id = v_estabelecimento_id
    and (e->>'quantidade')::int between 1 and 99;

  -- item indisponível, de outro bar ou com quantidade fora da faixa derruba tudo
  if (select count(*) from pedido_itens where pedido_id = v_pedido_id)
     <> jsonb_array_length(p_itens) then
    raise exception 'Item indisponível, de outro estabelecimento ou com quantidade inválida.';
  end if;

  return v_pedido_id;
end;
$$;

revoke execute on function public.criar_pedido(uuid, jsonb) from public;
grant  execute on function public.criar_pedido(uuid, jsonb) to authenticated;
