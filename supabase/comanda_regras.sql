-- =====================================================================
-- +party — Regras da comanda: uma por vez, conta não paga e cancelamento
-- =====================================================================
-- O que este script faz:
--
--   1. comandas.status aceita mais dois finais:
--        'cancelada'  o cliente desistiu antes da liberação (antes a linha
--                     era apagada; agora fica registrada)
--        'nao_paga'   o gerente registrou que o cliente foi embora sem pagar
--
--   2. Uma comanda ativa por cliente, garantida pelo banco. Ativa =
--      aguardando_liberacao, aberta ou aguardando_pagamento. Isso trava:
--        - abrir outra comanda com a conta fechada e não paga (em qualquer bar);
--        - duas abas (ou dois celulares) abrindo comanda no mesmo instante;
--        - quem tenta criar direto pela API.
--      A segunda tentativa recebe o erro 23505 (comandas_uma_ativa_por_cliente).
--      Quando o gerente marca 'nao_paga', a comanda deixa de ser ativa e o
--      cliente volta a poder abrir comandas.
--
--   3. Transições de status (trigger validar_comanda), versão completa:
--        aguardando_liberacao → aberta | recusada   equipe do bar
--        aguardando_liberacao → cancelada           o próprio cliente
--        aberta               → aguardando_pagamento   cliente ou equipe
--                               (o banco grava fechada_em com a hora certa)
--        aguardando_pagamento → paga                equipe do bar
--        aguardando_pagamento → nao_paga            gerente do bar
--      nao_paga_por / nao_paga_em: quem marcou e quando (só o banco escreve).
--
--   4. historico_nao_paga(cliente): para a equipe ver, ao liberar uma
--      comanda, se aquele cliente já saiu sem pagar alguma vez (em qualquer
--      bar). Devolve só bar, valor, data e quantas vezes.
--
-- Este script substitui as versões de validar_comanda de protecoes.sql e
-- recusar_comanda.sql, e a regra de apagar de cancelar_comanda.sql. Não
-- rode esses três de novo depois dele (se rodar, rode este de novo em seguida).
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Status novos e colunas de quem marcou "não paga"
-- ---------------------------------------------------------------------
-- Procura a regra de status pelo conteúdo (o nome depende de como a tabela
-- foi criada), como em recusar_comanda.sql.
do $$
declare
  regra record;
begin
  for regra in
    select conname
    from pg_constraint
    where conrelid = 'public.comandas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
      and pg_get_constraintdef(oid) ilike '%aguardando_liberacao%'
  loop
    execute format('alter table public.comandas drop constraint %I', regra.conname);
  end loop;
end $$;

alter table public.comandas add constraint comandas_status_check
  check (status in ('aguardando_liberacao', 'aberta', 'aguardando_pagamento',
                    'paga', 'recusada', 'cancelada', 'nao_paga'));

alter table public.comandas
  add column if not exists nao_paga_por uuid references perfis(id) on delete set null,
  add column if not exists nao_paga_em  timestamptz;

-- ---------------------------------------------------------------------
-- 2. Transições de status
-- ---------------------------------------------------------------------
create or replace function public.validar_comanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_do_local   boolean;
  gerente_do_local boolean;
begin
  -- Scripts do SQL Editor (sem usuário logado) passam direto.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status       := 'aguardando_liberacao';
    new.fechada_em   := null;
    new.nao_paga_por := null;
    new.nao_paga_em  := null;
    return new;
  end if;

  if new.usuario_id <> old.usuario_id or new.estabelecimento_id <> old.estabelecimento_id then
    raise exception 'Não é permitido mudar o dono ou o estabelecimento da comanda.';
  end if;

  -- Estas colunas só o banco escreve.
  new.fechada_em   := old.fechada_em;
  new.nao_paga_por := old.nao_paga_por;
  new.nao_paga_em  := old.nao_paga_em;

  if new.status = old.status then
    return new;
  end if;

  staff_do_local   := public.sou_staff() and old.estabelecimento_id = public.meu_estabelecimento_id();
  gerente_do_local := staff_do_local and public.meu_tipo() = 'gerente';

  if old.status = 'aguardando_liberacao' and new.status in ('aberta', 'recusada') and staff_do_local then
    return new;
  end if;

  if old.status = 'aguardando_liberacao' and new.status = 'cancelada' and old.usuario_id = auth.uid() then
    return new;
  end if;

  if old.status = 'aberta' and new.status = 'aguardando_pagamento' then
    new.fechada_em := now();
    return new;
  end if;

  if old.status = 'aguardando_pagamento' and new.status = 'paga' and staff_do_local then
    return new;
  end if;

  if old.status = 'aguardando_pagamento' and new.status = 'nao_paga' and gerente_do_local then
    new.nao_paga_por := auth.uid();
    new.nao_paga_em  := now();
    return new;
  end if;

  raise exception 'Mudança de status não permitida: % → %.', old.status, new.status;
end;
$$;

drop trigger if exists validar_comanda on comandas;
create trigger validar_comanda
  before insert or update on comandas
  for each row execute function public.validar_comanda();

-- Cancelar agora é mudar o status; apagar deixa de ser permitido.
drop policy if exists "comandas: cliente cancela antes da liberação" on comandas;

-- ---------------------------------------------------------------------
-- 3. Uma comanda ativa por cliente
-- ---------------------------------------------------------------------
-- Antes de criar a regra, resolve o que já existe no banco:
--   - pedidos de liberação sobrando viram 'cancelada' (nenhum tem pedido nem
--     dinheiro envolvido): se o cliente já tem uma comanda aberta ou
--     esperando pagamento, saem todos; senão, fica só o mais recente;
--   - se ainda sobrar cliente com mais de uma comanda ativa (aberta ou
--     esperando pagamento), o script para e mostra quantos são, sem mexer
--     em nada que envolva dinheiro.
with repetidas as (
  select id,
         row_number() over (
           partition by usuario_id
           order by (status = 'aguardando_liberacao'), criada_em desc
         ) as ordem,
         count(*) over (partition by usuario_id) as ativas
  from comandas
  where status in ('aguardando_liberacao', 'aberta', 'aguardando_pagamento')
)
update comandas c
set status = 'cancelada'
from repetidas r
where c.id = r.id
  and r.ativas > 1
  and r.ordem > 1
  and c.status = 'aguardando_liberacao';

do $$
declare
  clientes int;
begin
  select count(*) into clientes
  from (
    select usuario_id
    from comandas
    where status in ('aguardando_liberacao', 'aberta', 'aguardando_pagamento')
    group by usuario_id
    having count(*) > 1
  ) x;

  if clientes > 0 then
    raise exception
      '% cliente(s) têm mais de uma comanda ativa. Veja quais com a consulta "Comandas ativas repetidas" no fim de supabase/comanda_regras.sql, resolva (confirme o pagamento ou marque como não paga) e rode o script de novo.',
      clientes;
  end if;
end $$;

create unique index if not exists comandas_uma_ativa_por_cliente
  on comandas (usuario_id)
  where status in ('aguardando_liberacao', 'aberta', 'aguardando_pagamento');

-- ---------------------------------------------------------------------
-- 4. Histórico de contas não pagas (para a equipe, ao liberar)
-- ---------------------------------------------------------------------
-- A equipe só enxerga as comandas do próprio bar; por isso a consulta roda
-- como o banco (security definer) e devolve só o resumo da última vez.
create or replace function public.historico_nao_paga(p_usuario uuid)
returns table (estabelecimento text, valor numeric, quando timestamptz, vezes int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.sou_staff() then
    return;
  end if;

  return query
  with nao_pagas as (
    select c.id, e.nome, coalesce(c.nao_paga_em, c.fechada_em, c.criada_em) as quando
    from comandas c
    join estabelecimentos e on e.id = c.estabelecimento_id
    where c.usuario_id = p_usuario
      and c.status = 'nao_paga'
  )
  select n.nome,
         coalesce((select sum(pi.quantidade * pi.preco_unitario)
                   from pedidos p
                   join pedido_itens pi on pi.pedido_id = p.id
                   where p.comanda_id = n.id), 0)::numeric,
         n.quando,
         (select count(*) from nao_pagas)::int
  from nao_pagas n
  order by n.quando desc
  limit 1;
end;
$$;

revoke all on function public.historico_nao_paga(uuid) from public;
grant execute on function public.historico_nao_paga(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar 7 | 1 | 1 | 1 | 0
-- ---------------------------------------------------------------------
select
  (select array_length(regexp_split_to_array(
            substring(pg_get_constraintdef(oid) from 'ARRAY\[(.*)\]'), ','), 1)
     from pg_constraint
    where conrelid = 'public.comandas'::regclass and conname = 'comandas_status_check') as status_7,
  (select count(*) from pg_indexes
    where tablename = 'comandas' and indexname = 'comandas_uma_ativa_por_cliente') as trava_1,
  (select count(*) from pg_proc where proname = 'historico_nao_paga') as historico_1,
  (select count(*) from information_schema.columns
    where table_name = 'comandas' and column_name = 'nao_paga_em') as coluna_1,
  (select count(*) from pg_policies
    where tablename = 'comandas' and policyname = 'comandas: cliente cancela antes da liberação') as regra_de_apagar_0;

-- ---------------------------------------------------------------------
-- Comandas ativas repetidas (só se o script parar no passo 3)
-- ---------------------------------------------------------------------
-- select p.nome, c.id, c.status, c.criada_em, e.nome as bar
-- from comandas c
-- join perfis p on p.id = c.usuario_id
-- join estabelecimentos e on e.id = c.estabelecimento_id
-- where c.status in ('aberta', 'aguardando_pagamento', 'aguardando_liberacao')
--   and c.usuario_id in (
--     select usuario_id from comandas
--     where status in ('aguardando_liberacao', 'aberta', 'aguardando_pagamento')
--     group by usuario_id having count(*) > 1)
-- order by p.nome, c.criada_em;
