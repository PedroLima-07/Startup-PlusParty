-- =====================================================================
-- +party — Situação da mesa e fila de espera
-- =====================================================================
-- O cliente digita a mesa. Antes de abrir a comanda, o app pergunta ao banco
-- como a mesa está:
--   livre      ninguém com comanda ativa nela → abre normal
--   em_uso     alguém com comanda aberta (ou esperando liberação) → o app
--              pergunta "Você está com esse grupo?"
--   liberando  só contas fechadas esperando pagamento → o app oferece a fila
--
-- Fila: quando a última conta da mesa sai (paga, não paga, recusada,
-- cancelada ou a comanda muda de mesa), o banco abre a comanda do primeiro
-- da fila ("aguardando_liberacao", marcada veio_da_fila) e manda o aviso
-- "Sua mesa liberou!". Se ele já tiver outra comanda ativa, passa para o
-- próximo. Quem abre uma comanda por conta própria sai da fila.
--
-- "Mesa 04" e "mesa 4" são a mesma mesa (espaços e zeros à esquerda não contam).
--
-- Funções para o app:
--   situacao_mesa(bar, mesa)           'livre' | 'em_uso' | 'liberando'
--   entrar_na_fila_da_mesa(bar, mesa)  devolve a posição (1 = o próximo)
--   sair_da_fila_da_mesa()
--   minha_fila()                       a espera do cliente, com a posição
--
-- Também: notificacoes aceita o tipo 'mesa_liberada'. Se outra frente
-- acrescentar tipos de notificação, junte a lista de lá com a daqui.
--
-- Como aplicar (depois de comanda_regras.sql): SQL Editor → colar → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mesa normalizada e situação
-- ---------------------------------------------------------------------
create or replace function public.normalizar_mesa(p_mesa text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p_mesa, ''))), '^0+(?=[0-9])', ''), '');
$$;

-- O cliente não enxerga as comandas dos outros: a situação vem daqui,
-- sem dizer quem está na mesa.
create or replace function public.situacao_mesa(p_estabelecimento uuid, p_mesa text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when bool_or(c.status in ('aberta', 'aguardando_liberacao')) then 'em_uso'
    when bool_or(c.status = 'aguardando_pagamento') then 'liberando'
    else 'livre'
  end
  from (select 1) _
  left join comandas c
    on c.estabelecimento_id = p_estabelecimento
   and public.normalizar_mesa(c.mesa) = public.normalizar_mesa(p_mesa)
   and c.status in ('aberta', 'aguardando_liberacao', 'aguardando_pagamento');
$$;

-- ---------------------------------------------------------------------
-- 2. Comanda que veio da fila
-- ---------------------------------------------------------------------
alter table comandas
  add column if not exists veio_da_fila boolean not null default false;

-- Só o banco marca: quem abre pelo app nunca "vem da fila".
create or replace function public.proteger_veio_da_fila()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('plusparty.chamando_fila', true), '') <> 'sim' then
    new.veio_da_fila := case when tg_op = 'INSERT' then false else old.veio_da_fila end;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_veio_da_fila on comandas;
create trigger proteger_veio_da_fila
  before insert or update on comandas
  for each row execute function public.proteger_veio_da_fila();

-- ---------------------------------------------------------------------
-- 3. Fila
-- ---------------------------------------------------------------------
create table if not exists fila_mesa (
  id                 uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  mesa               text not null,
  usuario_id         uuid not null references perfis(id) on delete cascade,
  situacao           text not null default 'esperando'
                     check (situacao in ('esperando', 'chamado', 'saiu', 'cancelada')),
  comanda_id         uuid references comandas(id) on delete set null,
  criada_em          timestamptz not null default now()
);

-- Cada cliente espera em uma fila por vez.
create unique index if not exists fila_mesa_uma_por_cliente
  on fila_mesa (usuario_id) where situacao = 'esperando';

create index if not exists fila_mesa_ordem_idx
  on fila_mesa (estabelecimento_id, mesa, criada_em) where situacao = 'esperando';

alter table fila_mesa enable row level security;

drop policy if exists "fila_mesa: cliente vê a sua" on fila_mesa;
create policy "fila_mesa: cliente vê a sua"
  on fila_mesa for select
  using (usuario_id = auth.uid());

create or replace function public.entrar_na_fila_da_mesa(p_estabelecimento uuid, p_mesa text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  mesa_limpa text := public.normalizar_mesa(p_mesa);
  minha      fila_mesa%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para entrar na fila.';
  end if;
  if mesa_limpa is null then
    raise exception 'Informe a mesa.';
  end if;
  if exists (select 1 from comandas
             where usuario_id = auth.uid()
               and status in ('aguardando_liberacao', 'aberta', 'aguardando_pagamento')) then
    raise exception 'Você já tem uma comanda ativa.';
  end if;

  select * into minha from fila_mesa where usuario_id = auth.uid() and situacao = 'esperando';

  -- Já esperava em outra mesa: troca de fila.
  if minha.id is not null and (minha.estabelecimento_id <> p_estabelecimento or minha.mesa <> mesa_limpa) then
    update fila_mesa set situacao = 'saiu' where id = minha.id;
    minha := null;
  end if;

  if minha.id is null then
    if public.situacao_mesa(p_estabelecimento, mesa_limpa) <> 'liberando' then
      raise exception 'Esta mesa não está sendo liberada.';
    end if;
    insert into fila_mesa (estabelecimento_id, mesa, usuario_id)
    values (p_estabelecimento, mesa_limpa, auth.uid())
    returning * into minha;
  end if;

  return (select count(*) from fila_mesa
          where estabelecimento_id = minha.estabelecimento_id
            and mesa = minha.mesa
            and situacao = 'esperando'
            and criada_em <= minha.criada_em);
end;
$$;

create or replace function public.sair_da_fila_da_mesa()
returns void
language sql
security definer
set search_path = public
as $$
  update fila_mesa set situacao = 'saiu'
  where usuario_id = auth.uid() and situacao = 'esperando';
$$;

create or replace function public.minha_fila()
returns table (id uuid, estabelecimento_id uuid, estabelecimento text, mesa text, posicao int, criada_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.estabelecimento_id, e.nome, f.mesa,
         (select count(*)::int from fila_mesa o
          where o.estabelecimento_id = f.estabelecimento_id and o.mesa = f.mesa
            and o.situacao = 'esperando' and o.criada_em <= f.criada_em),
         f.criada_em
  from fila_mesa f
  join estabelecimentos e on e.id = f.estabelecimento_id
  where f.usuario_id = auth.uid() and f.situacao = 'esperando';
$$;

-- ---------------------------------------------------------------------
-- 4. A mesa liberou: chama o primeiro da fila
-- ---------------------------------------------------------------------
alter table notificacoes drop constraint if exists notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'comanda_liberada', 'comanda_recusada', 'pedido_pronto',
    'pagamento_confirmado', 'postagem', 'mesa_liberada'
  ));

create or replace function public.chamar_proximo_da_fila(p_estabelecimento uuid, p_mesa text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mesa_limpa text := public.normalizar_mesa(p_mesa);
  vez        fila_mesa%rowtype;
  nova       uuid;
  bar        text;
begin
  if mesa_limpa is null or public.situacao_mesa(p_estabelecimento, mesa_limpa) <> 'livre' then
    return;
  end if;

  select nome into bar from estabelecimentos where id = p_estabelecimento;

  for vez in
    select * from fila_mesa
    where estabelecimento_id = p_estabelecimento and mesa = mesa_limpa and situacao = 'esperando'
    order by criada_em
    for update skip locked
  loop
    begin
      perform set_config('plusparty.chamando_fila', 'sim', true);
      insert into comandas (usuario_id, estabelecimento_id, mesa, status, veio_da_fila)
      values (vez.usuario_id, p_estabelecimento, mesa_limpa, 'aguardando_liberacao', true)
      returning id into nova;
      perform set_config('plusparty.chamando_fila', '', true);
    exception when unique_violation then
      -- Já tem outra comanda ativa: não precisa mais desta mesa.
      perform set_config('plusparty.chamando_fila', '', true);
      update fila_mesa set situacao = 'cancelada' where id = vez.id;
      continue;
    end;

    update fila_mesa set situacao = 'chamado', comanda_id = nova where id = vez.id;
    perform public.notificar(
      vez.usuario_id, 'mesa_liberada', 'Sua mesa liberou! 🎉',
      'A mesa ' || mesa_limpa || ' do ' || bar || ' está livre e sua comanda já foi aberta. Chame um atendente para confirmar.',
      '/cliente/comanda/' || nova, 'mesa:' || vez.id);
    return;
  end loop;
end;
$$;

revoke all on function public.chamar_proximo_da_fila(uuid, text) from public, anon, authenticated;

create or replace function public.mesa_pode_ter_liberado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ativos constant text[] := array['aguardando_liberacao', 'aberta', 'aguardando_pagamento'];
begin
  if old.mesa is not null
     and old.status = any (ativos)
     and (not (new.status = any (ativos))
          or public.normalizar_mesa(new.mesa) is distinct from public.normalizar_mesa(old.mesa)) then
    perform public.chamar_proximo_da_fila(old.estabelecimento_id, old.mesa);
  end if;
  return null;
end;
$$;

drop trigger if exists mesa_pode_ter_liberado on comandas;
create trigger mesa_pode_ter_liberado
  after update of status, mesa on comandas
  for each row execute function public.mesa_pode_ter_liberado();

-- Quem abre uma comanda por conta própria sai da fila em que estava.
create or replace function public.sair_da_fila_ao_abrir_comanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.veio_da_fila then
    update fila_mesa set situacao = 'cancelada'
    where usuario_id = new.usuario_id and situacao = 'esperando';
  end if;
  return null;
end;
$$;

drop trigger if exists sair_da_fila_ao_abrir_comanda on comandas;
create trigger sair_da_fila_ao_abrir_comanda
  after insert on comandas
  for each row execute function public.sair_da_fila_ao_abrir_comanda();

-- ---------------------------------------------------------------------
-- 5. Quem pode chamar o quê
-- ---------------------------------------------------------------------
revoke all on function public.situacao_mesa(uuid, text) from public, anon;
revoke all on function public.entrar_na_fila_da_mesa(uuid, text) from public, anon;
revoke all on function public.sair_da_fila_da_mesa() from public, anon;
revoke all on function public.minha_fila() from public, anon;
grant execute on function public.situacao_mesa(uuid, text) to authenticated;
grant execute on function public.entrar_na_fila_da_mesa(uuid, text) to authenticated;
grant execute on function public.sair_da_fila_da_mesa() to authenticated;
grant execute on function public.minha_fila() to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar 1 | 1 | 6 | 4
-- ---------------------------------------------------------------------
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'fila_mesa') as tabela_1,
  (select count(*) from information_schema.columns
    where table_name = 'comandas' and column_name = 'veio_da_fila') as coluna_1,
  (select count(distinct proname) from pg_proc
    where proname in ('normalizar_mesa', 'situacao_mesa', 'entrar_na_fila_da_mesa',
                      'sair_da_fila_da_mesa', 'minha_fila', 'chamar_proximo_da_fila')) as funcoes_6,
  (select count(*) from pg_trigger
    where not tgisinternal
      and tgname in ('proteger_veio_da_fila', 'mesa_pode_ter_liberado',
                     'sair_da_fila_ao_abrir_comanda', 'proteger_veio_da_fila')) +
  (select count(*) from pg_constraint
    where conname = 'notificacoes_tipo_check'
      and pg_get_constraintdef(oid) like '%mesa_liberada%') as gatilhos_e_aviso_4;
