-- =====================================================================
-- +party — Atendente recusa a comanda que espera liberação
-- =====================================================================
-- A liberação existe para confirmar que o cliente está no bar. Quando ele
-- não está (ou pediu por engano), o atendente precisa de uma saída além de
-- "liberar". Marcar como 'paga' sujaria os resultados do gerente com
-- comandas pagas de valor zero, então a recusa ganha um status próprio.
--
-- O que este script faz:
--   1. a coluna status de comandas passa a aceitar 'recusada';
--   2. o trigger de transições (o mesmo de supabase/protecoes.sql) passa a
--      permitir aguardando_liberacao → recusada, só para a equipe do bar.
--
-- 'recusada' é um status final, como 'paga': a comanda não volta a abrir.
-- O cliente vê que foi recusado e abre outra quando quiser.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. status aceita 'recusada'
-- ---------------------------------------------------------------------
-- Procura a regra pelo conteúdo em vez de confiar no nome
-- (comandas_status_check), que depende de como a tabela foi criada.
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
  check (status in ('aguardando_liberacao', 'aberta', 'aguardando_pagamento', 'paga', 'recusada'));

-- ---------------------------------------------------------------------
-- 2. transições de status permitidas
-- ---------------------------------------------------------------------
-- Cópia da função de supabase/protecoes.sql com a recusa incluída. As duas
-- precisam ficar iguais: quem rodar protecoes.sql de novo recria a função.
--
--   aguardando_liberacao → aberta                 (staff: libera)
--   aguardando_liberacao → recusada               (staff: recusa)
--   aberta               → aguardando_pagamento   (dono ou staff: fecha a conta)
--   aguardando_pagamento → paga                   (staff: confirma o pagamento)

create or replace function public.validar_comanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_do_local boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'aguardando_liberacao';
    new.fechada_em := null;
    return new;
  end if;

  if new.usuario_id <> old.usuario_id or new.estabelecimento_id <> old.estabelecimento_id then
    raise exception 'Não é permitido mudar o dono ou o estabelecimento da comanda.';
  end if;

  if new.status = old.status then
    return new;
  end if;

  staff_do_local := public.sou_staff() and old.estabelecimento_id = public.meu_estabelecimento_id();

  if old.status = 'aguardando_liberacao' and new.status in ('aberta', 'recusada') and staff_do_local then
    return new;
  end if;

  if old.status = 'aberta' and new.status = 'aguardando_pagamento' then
    return new;
  end if;

  if old.status = 'aguardando_pagamento' and new.status = 'paga' and staff_do_local then
    return new;
  end if;

  raise exception 'Mudança de status não permitida: % → %.', old.status, new.status;
end;
$$;

drop trigger if exists validar_comanda on comandas;
create trigger validar_comanda
  before insert or update on comandas
  for each row execute function public.validar_comanda();

-- Conferência: a regra deve listar os cinco status.
select conname, pg_get_constraintdef(oid) as regra
from pg_constraint
where conrelid = 'public.comandas'::regclass and contype = 'c';
