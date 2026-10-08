-- =====================================================================
-- lotacao_estabelecimentos — quantas comandas abertas cada bar tem agora.
--
-- Por que existe:
--   A Home mostra o selo "Quente" nos bares movimentados. Antes, o app
--   contava as comandas de cada bar com uma consulta por bar, direto na
--   tabela "comandas". Dois problemas:
--     1. uma requisição por bar (4 bares = 4 requisições, e cresce);
--     2. o RLS só deixa o cliente ver as próprias comandas, então a
--        contagem dava 0 ou 1 e o selo nunca aparecia.
--
--   Esta função devolve a contagem de todos os bares numa consulta só.
--
-- Decisões de segurança:
--   security definer  — precisa contar as comandas de todo mundo, o que o
--                       RLS não deixa o cliente fazer. Por isso a função
--                       devolve só o número por bar: nada de quem é o
--                       cliente, mesa ou valores.
--   set search_path   — sem isso o Postgres procura em pg_temp antes de
--                       public, e uma tabela temporária chamada "comandas"
--                       seria lida no lugar da verdadeira.
--   grant para anon   — a Home abre sem login (visitante), então o papel
--                       anon também precisa chamar.
--
-- Bares sem comanda aberta não aparecem no resultado (o app trata como 0).
--
-- Como rodar: painel do Supabase -> SQL Editor -> New query -> colar -> Run.
-- Pode rodar de novo sem problema.
-- =====================================================================

create or replace function public.lotacao_estabelecimentos()
returns table (estabelecimento_id uuid, comandas_abertas bigint)
language sql
security definer
stable
set search_path = public
as $$
  select c.estabelecimento_id, count(*)
  from comandas c
  where c.status in ('aguardando_liberacao', 'aberta')
  group by c.estabelecimento_id
$$;

revoke execute on function public.lotacao_estabelecimentos() from public;
grant  execute on function public.lotacao_estabelecimentos() to anon, authenticated;

-- Conferência: uma linha por bar com comanda aberta.
select * from public.lotacao_estabelecimentos();
