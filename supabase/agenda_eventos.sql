-- =====================================================================
-- +party — Agenda de eventos do bar
-- =====================================================================
-- O gerente cadastra os eventos do bar (roda de samba, show, jogo no
-- telão...). Um evento pode se repetir toda semana no mesmo dia e horário
-- ("toda sexta, 20h"). O cliente marca "Tenho interesse" e recebe:
--   - um lembrete 2 horas antes de cada vez que o evento acontece;
--   - um aviso se o gerente cancelar.
--
-- Tabelas:
--   eventos              só o gerente do bar cria, edita, cancela ou apaga;
--                        todo mundo lê (a agenda é pública)
--   eventos_interesses   quem marcou interesse; cada um vê só os seus
--
-- Cancelar = preencher cancelado_em (o app mostra riscado). Apagar some
-- sem avisar ninguém; prefira cancelar. Cancelar um evento semanal cancela
-- a série inteira.
--
-- Funções para o app:
--   agenda_do_bar(bar, dias)        as próximas datas de cada evento, já com
--                                   as repetições, o número de interessados
--                                   e se eu marquei interesse
--   marcar_interesse(evento) / desmarcar_interesse(evento)
--   bares_com_evento_hoje()         ids dos bares com evento hoje (o dia do
--                                   bar vira às 6h, como no app)
--
-- Lembretes: uma tarefa agendada (pg_cron) roda a cada 15 minutos e avisa
-- quem tem interesse num evento que começa nas próximas 2 horas. Se o
-- pg_cron não estiver ligado, o script avisa no fim e o resto funciona;
-- veja o passo a passo no PR.
--
-- Capa do evento: o app pode usar o mesmo bucket das postagens
-- ("postagens", pasta do bar) e gravar o caminho em capa_url.
--
-- Como aplicar (depois de mesa_fila.sql): SQL Editor → colar → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
create table if not exists eventos (
  id                 uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  titulo             text not null check (char_length(btrim(titulo)) between 1 and 80),
  descricao          text check (char_length(descricao) <= 500),
  inicio             timestamptz not null,
  fim                timestamptz,
  capa_url           text,
  -- Valor da entrada; null ou 0 = grátis.
  entrada            numeric(10, 2) check (entrada is null or entrada >= 0),
  repete_semanal     boolean not null default false,
  -- Última data em que o evento semanal acontece; null = sem fim.
  repetir_ate        date,
  cancelado_em       timestamptz,
  criado_em          timestamptz not null default now(),
  check (fim is null or fim > inicio)
);

create index if not exists eventos_bar_idx on eventos (estabelecimento_id, inicio);

create table if not exists eventos_interesses (
  evento_id  uuid not null references eventos(id) on delete cascade,
  usuario_id uuid not null references perfis(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (evento_id, usuario_id)
);

alter table eventos enable row level security;
alter table eventos_interesses enable row level security;

drop policy if exists "eventos: leitura pública" on eventos;
drop policy if exists "eventos: gerente do bar cria" on eventos;
drop policy if exists "eventos: gerente do bar edita" on eventos;
drop policy if exists "eventos: gerente do bar apaga" on eventos;

create policy "eventos: leitura pública"
  on eventos for select
  using (true);

create policy "eventos: gerente do bar cria"
  on eventos for insert
  with check (public.meu_tipo() = 'gerente' and estabelecimento_id = public.meu_estabelecimento_id());

create policy "eventos: gerente do bar edita"
  on eventos for update
  using (public.meu_tipo() = 'gerente' and estabelecimento_id = public.meu_estabelecimento_id())
  with check (public.meu_tipo() = 'gerente' and estabelecimento_id = public.meu_estabelecimento_id());

create policy "eventos: gerente do bar apaga"
  on eventos for delete
  using (public.meu_tipo() = 'gerente' and estabelecimento_id = public.meu_estabelecimento_id());

drop policy if exists "eventos_interesses: cada um vê os seus" on eventos_interesses;
create policy "eventos_interesses: cada um vê os seus"
  on eventos_interesses for select
  using (usuario_id = auth.uid());

-- A data de criação e o cancelamento têm hora do banco.
create or replace function public.preparar_evento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.cancelado_em := null;
  else
    new.criado_em := old.criado_em;
    if new.cancelado_em is not null and old.cancelado_em is null then
      new.cancelado_em := now();
    end if;
  end if;
  new.titulo := btrim(new.titulo);
  return new;
end;
$$;

drop trigger if exists preparar_evento on eventos;
create trigger preparar_evento
  before insert or update on eventos
  for each row execute function public.preparar_evento();

-- ---------------------------------------------------------------------
-- 2. Notificações de evento
-- ---------------------------------------------------------------------
-- Inclui os tipos de mesa_fila.sql (mesa_liberada).
alter table notificacoes drop constraint if exists notificacoes_tipo_check;
alter table notificacoes add constraint notificacoes_tipo_check
  check (tipo in (
    'comanda_liberada', 'comanda_recusada', 'pedido_pronto',
    'pagamento_confirmado', 'postagem', 'mesa_liberada',
    'evento_lembrete', 'evento_cancelado'
  ));

create or replace function public.avisar_evento_cancelado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bar text;
begin
  select nome into bar from estabelecimentos where id = new.estabelecimento_id;

  perform public.notificar(
    i.usuario_id, 'evento_cancelado', 'Evento cancelado',
    new.titulo || ' no ' || bar || ' foi cancelado.',
    '/cliente/estabelecimento/' || new.estabelecimento_id,
    'evento-cancelado:' || new.id)
  from eventos_interesses i
  where i.evento_id = new.id;

  return null;
end;
$$;

drop trigger if exists avisar_evento_cancelado on eventos;
create trigger avisar_evento_cancelado
  after update of cancelado_em on eventos
  for each row
  when (old.cancelado_em is null and new.cancelado_em is not null)
  execute function public.avisar_evento_cancelado();

-- ---------------------------------------------------------------------
-- 3. As próximas datas de cada evento (com as repetições semanais)
-- ---------------------------------------------------------------------
-- Cada linha é uma vez em que o evento acontece entre `de` e `ate`.
create or replace function public.ocorrencias_de_eventos(p_de timestamptz, p_ate timestamptz)
returns table (evento_id uuid, estabelecimento_id uuid, inicio timestamptz, fim timestamptz)
language sql
stable
set search_path = public
as $$
  select e.id, e.estabelecimento_id,
         e.inicio + make_interval(weeks => semana),
         e.fim + make_interval(weeks => semana)
  from eventos e
  cross join lateral generate_series(
    -- Pula as semanas que já passaram antes de `de`.
    case when e.repete_semanal
         then greatest(0, floor(extract(epoch from (p_de - coalesce(e.fim, e.inicio))) / 604800)::int)
         else 0 end,
    case when e.repete_semanal
         then greatest(0, ceil(extract(epoch from (p_ate - e.inicio)) / 604800)::int)
         else 0 end
  ) as semana
  where coalesce(e.fim, e.inicio) + make_interval(weeks => semana) >= p_de
    and e.inicio + make_interval(weeks => semana) <= p_ate
    and (not e.repete_semanal or e.repetir_ate is null
         or (e.inicio + make_interval(weeks => semana))::date <= e.repetir_ate);
$$;

-- Só expande as datas dos eventos, que já são públicos (bares_com_evento_hoje usa).
revoke all on function public.ocorrencias_de_eventos(timestamptz, timestamptz) from public;
grant execute on function public.ocorrencias_de_eventos(timestamptz, timestamptz) to anon, authenticated;

create or replace function public.agenda_do_bar(p_estabelecimento uuid, p_dias int default 30)
returns table (
  evento_id uuid, titulo text, descricao text, inicio timestamptz, fim timestamptz,
  capa_url text, entrada numeric, repete_semanal boolean, cancelado boolean,
  interessados int, tenho_interesse boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.titulo, e.descricao, o.inicio, o.fim,
         e.capa_url, e.entrada, e.repete_semanal, e.cancelado_em is not null,
         (select count(*)::int from eventos_interesses i where i.evento_id = e.id),
         exists (select 1 from eventos_interesses i where i.evento_id = e.id and i.usuario_id = auth.uid())
  from public.ocorrencias_de_eventos(now(), now() + make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 120))) o
  join eventos e on e.id = o.evento_id
  where o.estabelecimento_id = p_estabelecimento
  order by o.inicio;
$$;

-- Só lê eventos, que são públicos: roda com a permissão de quem chama.
create or replace function public.bares_com_evento_hoje()
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  with dia as (
    -- O dia do bar vai das 6h de hoje às 6h de amanhã (horário de Brasília).
    select ((date_trunc('day', (now() at time zone 'America/Sao_Paulo') - interval '6 hours')
             + interval '6 hours') at time zone 'America/Sao_Paulo') as comeca
  )
  select distinct o.estabelecimento_id
  from dia, public.ocorrencias_de_eventos(dia.comeca, dia.comeca + interval '1 day' - interval '1 second') o
  join eventos e on e.id = o.evento_id
  where e.cancelado_em is null
    and o.inicio >= dia.comeca;
$$;

-- ---------------------------------------------------------------------
-- 4. Interesse
-- ---------------------------------------------------------------------
create or replace function public.marcar_interesse(p_evento uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para marcar interesse.';
  end if;
  if not exists (select 1 from eventos where id = p_evento and cancelado_em is null) then
    raise exception 'Este evento não está mais na agenda.';
  end if;
  insert into eventos_interesses (evento_id, usuario_id)
  values (p_evento, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.desmarcar_interesse(p_evento uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from eventos_interesses where evento_id = p_evento and usuario_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 5. Lembrete 2 horas antes
-- ---------------------------------------------------------------------
-- Avisa quem tem interesse em cada vez que o evento começa nas próximas 2
-- horas. A chave (evento + data) garante um lembrete por vez, mesmo que a
-- tarefa rode várias vezes nesse intervalo.
create or replace function public.enviar_lembretes_de_eventos()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  enviados int;
begin
  with proximos as (
    select o.evento_id, o.inicio, e.titulo, e.estabelecimento_id, b.nome as bar
    from public.ocorrencias_de_eventos(now(), now() + interval '2 hours') o
    join eventos e on e.id = o.evento_id
    join estabelecimentos b on b.id = e.estabelecimento_id
    where e.cancelado_em is null and o.inicio > now()
  ),
  novos as (
    insert into notificacoes (usuario_id, tipo, titulo, texto, link, chave)
    select i.usuario_id, 'evento_lembrete', 'Daqui a pouco: ' || p.titulo,
           'Começa às ' || to_char(p.inicio at time zone 'America/Sao_Paulo', 'HH24:MI') || ' no ' || p.bar || '.',
           '/cliente/estabelecimento/' || p.estabelecimento_id,
           'lembrete:' || p.evento_id || ':' || to_char(p.inicio, 'YYYY-MM-DD')
    from proximos p
    join eventos_interesses i on i.evento_id = p.evento_id
    on conflict (usuario_id, chave) do nothing
    returning 1
  )
  select count(*) into enviados from novos;
  return enviados;
end;
$$;

revoke all on function public.enviar_lembretes_de_eventos() from public, anon, authenticated;

-- Liga a tarefa a cada 15 minutos, se o pg_cron estiver disponível.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron não disponível: ative em Database → Extensions → pg_cron e rode este script de novo.';
    return;
  end;

  perform cron.unschedule(jobid) from cron.job where jobname = 'lembretes-de-eventos';
  perform cron.schedule('lembretes-de-eventos', '*/15 * * * *',
                        'select public.enviar_lembretes_de_eventos()');
end $$;

-- ---------------------------------------------------------------------
-- 6. Quem pode chamar o quê
-- ---------------------------------------------------------------------
revoke all on function public.marcar_interesse(uuid) from public, anon;
revoke all on function public.desmarcar_interesse(uuid) from public, anon;
grant execute on function public.marcar_interesse(uuid) to authenticated;
grant execute on function public.desmarcar_interesse(uuid) to authenticated;
grant execute on function public.agenda_do_bar(uuid, int) to anon, authenticated;
grant execute on function public.bares_com_evento_hoje() to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar 2 | 6 | 3 | sim
-- (lembretes_agendados = não: falta ligar o pg_cron, veja o PR)
-- ---------------------------------------------------------------------
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('eventos', 'eventos_interesses')) as tabelas_2,
  (select count(distinct proname) from pg_proc
    where proname in ('ocorrencias_de_eventos', 'agenda_do_bar', 'bares_com_evento_hoje',
                      'marcar_interesse', 'desmarcar_interesse', 'enviar_lembretes_de_eventos')) as funcoes_6,
  (select count(*) from pg_trigger
    where not tgisinternal and tgname in ('preparar_evento', 'avisar_evento_cancelado'))
  + (select count(*) from pg_constraint
      where conname = 'notificacoes_tipo_check' and pg_get_constraintdef(oid) like '%evento_lembrete%')
    as gatilhos_e_avisos_3,
  case when exists (select 1 from pg_extension where extname = 'pg_cron')
       then 'sim' else 'não' end as lembretes_agendados;
