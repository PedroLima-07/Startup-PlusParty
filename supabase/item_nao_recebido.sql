-- =====================================================================
-- +party — Fechar a conta sem cobrar o que o cliente não recebeu
-- =====================================================================
-- O cliente paga só o que recebeu. Ao fechar a conta:
--   - itens ainda não prontos saem da conta;
--   - itens prontos que ele marcar como não recebidos também saem;
--   - o motivo fica registrado, a equipe é avisada e o gerente vê o valor.
--
-- O item sai de pedido_itens e vai para itens_nao_recebidos. Assim, total da
-- conta, faturamento e mais vendidos deixam de contar o item sem mudar nada
-- nas outras telas, e o histórico fica guardado.
--
-- Precisa de comanda_regras.sql e realtime.sql aplicados.
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- A última consulta deve mostrar: tabela = true | funcoes = 2 | realtime = 1
-- =====================================================================

create table if not exists itens_nao_recebidos (
  id                   uuid primary key default gen_random_uuid(),
  comanda_id           uuid not null references comandas(id) on delete cascade,
  estabelecimento_id   uuid not null references estabelecimentos(id) on delete cascade,
  item_id              uuid references itens(id) on delete set null,
  nome                 text not null,
  setor                text,
  quantidade           integer not null,
  preco_unitario       numeric not null,
  status_no_fechamento text not null,
  motivo               text not null check (char_length(motivo) between 1 and 300),
  criado_em            timestamptz not null default now(),
  ciente_em            timestamptz,
  ciente_por           uuid references perfis(id) on delete set null
);

create index if not exists itens_nao_recebidos_comanda_idx on itens_nao_recebidos (comanda_id);
create index if not exists itens_nao_recebidos_bar_idx on itens_nao_recebidos (estabelecimento_id, criado_em desc);

alter table itens_nao_recebidos enable row level security;

drop policy if exists "itens_nao_recebidos: dono ou staff vê" on itens_nao_recebidos;
create policy "itens_nao_recebidos: dono ou staff vê"
  on itens_nao_recebidos for select
  to authenticated
  using (
    exists (select 1 from comandas c where c.id = comanda_id and c.usuario_id = auth.uid())
    or (public.sou_staff() and estabelecimento_id = public.meu_estabelecimento_id())
  );

-- Só as funções abaixo gravam nesta tabela.
revoke insert, update, delete on itens_nao_recebidos from anon, authenticated;

create or replace function public.fechar_conta_sem_itens(
  p_comanda_id uuid,
  p_itens_prontos_nao_recebidos uuid[],
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comanda record;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  select id, usuario_id, estabelecimento_id, status into v_comanda
  from comandas
  where id = p_comanda_id
  for update;

  if v_comanda.id is null or v_comanda.usuario_id is distinct from auth.uid() then
    raise exception 'Comanda não encontrada.';
  end if;
  if v_comanda.status <> 'aberta' then
    raise exception 'Esta comanda não está aberta.';
  end if;
  if v_motivo is null then
    raise exception 'Informe o motivo para fechar sem o item.';
  end if;

  with removidos as (
    delete from pedido_itens pi
    using pedidos p
    where p.id = pi.pedido_id
      and p.comanda_id = p_comanda_id
      and (pi.status <> 'pronto' or pi.id = any (coalesce(p_itens_prontos_nao_recebidos, '{}')))
    returning pi.item_id, pi.quantidade, pi.preco_unitario, pi.status
  )
  insert into itens_nao_recebidos (
    comanda_id, estabelecimento_id, item_id, nome, setor, quantidade,
    preco_unitario, status_no_fechamento, motivo
  )
  select p_comanda_id, v_comanda.estabelecimento_id, r.item_id, i.nome, i.setor,
         r.quantidade, r.preco_unitario, r.status, left(v_motivo, 300)
  from removidos r
  join itens i on i.id = r.item_id;

  -- O trigger validar_comanda continua conferindo a mudança de status.
  update comandas set status = 'aguardando_pagamento' where id = p_comanda_id;
end;
$$;

create or replace function public.marcar_item_nao_recebido_ciente(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_staff() then
    raise exception 'Apenas a equipe do bar pode fazer isso.';
  end if;

  update itens_nao_recebidos
  set ciente_em = now(), ciente_por = auth.uid()
  where id = p_id
    and ciente_em is null
    and estabelecimento_id = public.meu_estabelecimento_id();
end;
$$;

revoke execute on function public.fechar_conta_sem_itens(uuid, uuid[], text) from public, anon;
revoke execute on function public.marcar_item_nao_recebido_ciente(uuid) from public, anon;
grant execute on function public.fechar_conta_sem_itens(uuid, uuid[], text) to authenticated;
grant execute on function public.marcar_item_nao_recebido_ciente(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'itens_nao_recebidos'
  ) then
    alter publication supabase_realtime add table public.itens_nao_recebidos;
  end if;
end $$;

select
  to_regclass('public.itens_nao_recebidos') is not null as tabela,
  (select count(*) from pg_proc
    where proname in ('fechar_conta_sem_itens', 'marcar_item_nao_recebido_ciente')) as funcoes,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'itens_nao_recebidos') as realtime;
