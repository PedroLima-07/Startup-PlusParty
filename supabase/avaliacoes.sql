-- =====================================================================
-- +party — Avaliações verificadas dos bares
-- =====================================================================
-- Só avalia quem consumiu: quando o atendente confirma o pagamento de uma
-- comanda, o banco pede uma avaliação àquele cliente. O pedido fica guardado
-- aqui (não no navegador), então volta em qualquer aparelho até o cliente
-- responder ou tocar em "Não quero avaliar". Vale por 7 dias.
--
-- O que este script cria:
--   avaliacoes_pedidas   um pedido por comanda paga: pendente, respondida ou
--                        dispensada. O cliente só lê os seus.
--   avaliacoes           nota de 1 a 5, comentário opcional, resposta do
--                        gerente e denúncia. Ninguém escreve direto: só pelas
--                        funções abaixo.
--   estabelecimentos.nota_media / total_avaliacoes
--                        calculadas pelo banco a cada avaliação; o gerente
--                        não consegue alterar. (A coluna antiga `avaliacao`
--                        fica como está até as telas passarem a usar estas.)
--
-- Funções para o app:
--   avaliacao_pendente()                       cliente: a pendente mais recente
--   avaliar(comanda, nota, comentario)         cliente: responde
--   dispensar_avaliacao(comanda)               cliente: "Não quero avaliar"
--   avaliacoes_do_bar(bar, limite)             todos: lista pública, só o primeiro nome
--   responder_avaliacao(avaliacao, texto)      gerente do bar: resposta pública
--   denunciar_avaliacao(avaliacao, motivo)     gerente do bar: denuncia (não apaga)
--   avaliacoes_periodo(dias)                   gerente do bar: números do período
--
-- Ao responder ou dispensar a pendente mais recente, as mais antigas do
-- mesmo cliente são dispensadas junto: o app mostra uma pergunta por vez.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
create table if not exists avaliacoes_pedidas (
  comanda_id         uuid primary key references comandas(id) on delete cascade,
  usuario_id         uuid not null references perfis(id) on delete cascade,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  situacao           text not null default 'pendente'
                     check (situacao in ('pendente', 'respondida', 'dispensada')),
  criada_em          timestamptz not null default now()
);

create index if not exists avaliacoes_pedidas_cliente_idx
  on avaliacoes_pedidas (usuario_id, criada_em desc)
  where situacao = 'pendente';

create table if not exists avaliacoes (
  id                 uuid primary key default gen_random_uuid(),
  comanda_id         uuid not null unique references comandas(id) on delete cascade,
  usuario_id         uuid not null references perfis(id) on delete cascade,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  nota               smallint not null check (nota between 1 and 5),
  comentario         text check (char_length(comentario) <= 500),
  criada_em          timestamptz not null default now(),
  resposta           text check (char_length(resposta) <= 500),
  respondida_em      timestamptz,
  denunciada_em      timestamptz,
  denuncia_motivo    text check (char_length(denuncia_motivo) <= 300)
);

create index if not exists avaliacoes_bar_idx on avaliacoes (estabelecimento_id, criada_em desc);

alter table avaliacoes_pedidas enable row level security;
alter table avaliacoes enable row level security;

-- Leitura direta: o cliente vê as próprias; a equipe, as do bar. A lista
-- pública passa por avaliacoes_do_bar, que não expõe quem é o cliente.
-- Escrita direta: nenhuma (só pelas funções).
drop policy if exists "avaliacoes_pedidas: cliente vê as suas" on avaliacoes_pedidas;
create policy "avaliacoes_pedidas: cliente vê as suas"
  on avaliacoes_pedidas for select
  using (usuario_id = auth.uid());

drop policy if exists "avaliacoes: autor ou equipe do bar" on avaliacoes;
create policy "avaliacoes: autor ou equipe do bar"
  on avaliacoes for select
  using (
    usuario_id = auth.uid()
    or (public.sou_staff() and estabelecimento_id = public.meu_estabelecimento_id())
  );

-- ---------------------------------------------------------------------
-- 2. Nota do bar, calculada pelo banco
-- ---------------------------------------------------------------------
alter table estabelecimentos
  add column if not exists nota_media       numeric(2, 1),
  add column if not exists total_avaliacoes integer not null default 0;

-- O gerente edita o próprio bar, mas a nota não é dele: estas colunas só
-- mudam quando o recálculo abaixo avisa que é ele quem está gravando.
create or replace function public.proteger_nota_estabelecimento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('plusparty.nota_pelo_banco', true), '') <> 'sim' then
    new.nota_media := old.nota_media;
    new.total_avaliacoes := old.total_avaliacoes;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_nota_estabelecimento on estabelecimentos;
create trigger proteger_nota_estabelecimento
  before update on estabelecimentos
  for each row execute function public.proteger_nota_estabelecimento();

create or replace function public.recalcular_nota_estabelecimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bar uuid := coalesce(new.estabelecimento_id, old.estabelecimento_id);
begin
  perform set_config('plusparty.nota_pelo_banco', 'sim', true);
  update estabelecimentos e
  set nota_media = (select round(avg(a.nota)::numeric, 1) from avaliacoes a where a.estabelecimento_id = bar),
      total_avaliacoes = (select count(*) from avaliacoes a where a.estabelecimento_id = bar)
  where e.id = bar;
  perform set_config('plusparty.nota_pelo_banco', '', true);
  return null;
end;
$$;

drop trigger if exists recalcular_nota_estabelecimento on avaliacoes;
create trigger recalcular_nota_estabelecimento
  after insert or delete on avaliacoes
  for each row execute function public.recalcular_nota_estabelecimento();

-- ---------------------------------------------------------------------
-- 3. Conta paga → pede avaliação
-- ---------------------------------------------------------------------
create or replace function public.pedir_avaliacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into avaliacoes_pedidas (comanda_id, usuario_id, estabelecimento_id)
  values (new.id, new.usuario_id, new.estabelecimento_id)
  on conflict (comanda_id) do nothing;
  return null;
end;
$$;

drop trigger if exists pedir_avaliacao on comandas;
create trigger pedir_avaliacao
  after update of status on comandas
  for each row
  when (new.status = 'paga' and old.status is distinct from 'paga')
  execute function public.pedir_avaliacao();

-- ---------------------------------------------------------------------
-- 4. Funções do cliente
-- ---------------------------------------------------------------------
create or replace function public.avaliacao_pendente()
returns table (comanda_id uuid, estabelecimento_id uuid, estabelecimento text, pedida_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.comanda_id, p.estabelecimento_id, e.nome, p.criada_em
  from avaliacoes_pedidas p
  join estabelecimentos e on e.id = p.estabelecimento_id
  where p.usuario_id = auth.uid()
    and p.situacao = 'pendente'
    and p.criada_em > now() - interval '7 days'
  order by p.criada_em desc
  limit 1;
$$;

-- Fecha a pendente da comanda e as mais antigas do mesmo cliente.
create or replace function public.encerrar_pedidos_de_avaliacao(p_comanda uuid, p_situacao text)
returns void
language sql
security definer
set search_path = public
as $$
  update avaliacoes_pedidas p
  set situacao = case when p.comanda_id = p_comanda then p_situacao else 'dispensada' end
  where p.usuario_id = auth.uid()
    and p.situacao = 'pendente'
    and p.criada_em <= (select criada_em from avaliacoes_pedidas where comanda_id = p_comanda);
$$;

revoke all on function public.encerrar_pedidos_de_avaliacao(uuid, text) from public, anon, authenticated;

create or replace function public.avaliar(p_comanda uuid, p_nota int, p_comentario text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pedido avaliacoes_pedidas%rowtype;
  nova uuid;
begin
  select * into pedido
  from avaliacoes_pedidas
  where comanda_id = p_comanda
    and usuario_id = auth.uid()
    and situacao = 'pendente'
    and criada_em > now() - interval '7 days';

  if not found then
    raise exception 'Não há avaliação pendente para esta comanda.';
  end if;

  if p_nota is null or p_nota not between 1 and 5 then
    raise exception 'A nota vai de 1 a 5 estrelas.';
  end if;

  insert into avaliacoes (comanda_id, usuario_id, estabelecimento_id, nota, comentario)
  values (p_comanda, pedido.usuario_id, pedido.estabelecimento_id, p_nota,
          nullif(btrim(coalesce(p_comentario, '')), ''))
  returning id into nova;

  perform public.encerrar_pedidos_de_avaliacao(p_comanda, 'respondida');
  return nova;
end;
$$;

create or replace function public.dispensar_avaliacao(p_comanda uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from avaliacoes_pedidas
    where comanda_id = p_comanda and usuario_id = auth.uid() and situacao = 'pendente'
  ) then
    return;
  end if;
  perform public.encerrar_pedidos_de_avaliacao(p_comanda, 'dispensada');
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Lista pública (só o primeiro nome de quem avaliou)
-- ---------------------------------------------------------------------
create or replace function public.avaliacoes_do_bar(p_estabelecimento uuid, p_limite int default 20)
returns table (
  id uuid, autor text, nota smallint, comentario text, criada_em timestamptz,
  resposta text, respondida_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id,
         coalesce(nullif(split_part(btrim(p.nome), ' ', 1), ''), 'Cliente'),
         a.nota, a.comentario, a.criada_em, a.resposta, a.respondida_em
  from avaliacoes a
  left join perfis p on p.id = a.usuario_id
  where a.estabelecimento_id = p_estabelecimento
  order by a.criada_em desc
  limit least(greatest(coalesce(p_limite, 20), 1), 100);
$$;

-- ---------------------------------------------------------------------
-- 6. Funções do gerente
-- ---------------------------------------------------------------------
create or replace function public.responder_avaliacao(p_avaliacao uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  if texto is null then
    raise exception 'Escreva a resposta.';
  end if;

  update avaliacoes
  set resposta = texto, respondida_em = now()
  where id = p_avaliacao
    and public.meu_tipo() = 'gerente'
    and estabelecimento_id = public.meu_estabelecimento_id();

  if not found then
    raise exception 'Só o gerente do bar pode responder esta avaliação.';
  end if;
end;
$$;

create or replace function public.denunciar_avaliacao(p_avaliacao uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update avaliacoes
  set denunciada_em = now(),
      denuncia_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = p_avaliacao
    and public.meu_tipo() = 'gerente'
    and estabelecimento_id = public.meu_estabelecimento_id();

  if not found then
    raise exception 'Só o gerente do bar pode denunciar esta avaliação.';
  end if;
end;
$$;

-- Números das avaliações nos últimos p_dias, com o período anterior de
-- mesmo tamanho para comparar. O dia do bar vira às 6h (como no app).
create or replace function public.avaliacoes_periodo(p_dias int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bar   uuid := public.meu_estabelecimento_id();
  dias  int := least(greatest(coalesce(p_dias, 7), 1), 90);
  desde timestamptz := now() - make_interval(days => dias);
  antes timestamptz := now() - make_interval(days => dias * 2);
begin
  if public.meu_tipo() is distinct from 'gerente' or bar is null then
    raise exception 'Só o gerente do bar vê os números das avaliações.';
  end if;

  return (
    with periodo as (
      select * from avaliacoes where estabelecimento_id = bar and criada_em >= desde
    ),
    anterior as (
      select * from avaliacoes
      where estabelecimento_id = bar and criada_em >= antes and criada_em < desde
    )
    select jsonb_build_object(
      'dias', dias,
      'total', (select count(*) from periodo),
      'media', (select round(avg(nota)::numeric, 1) from periodo),
      'sem_resposta', (select count(*) from periodo where resposta is null),
      'distribuicao', jsonb_build_object(
        '1', (select count(*) from periodo where nota = 1),
        '2', (select count(*) from periodo where nota = 2),
        '3', (select count(*) from periodo where nota = 3),
        '4', (select count(*) from periodo where nota = 4),
        '5', (select count(*) from periodo where nota = 5)),
      'por_dia', coalesce((
        select jsonb_agg(jsonb_build_object('dia', dia, 'media', media, 'total', total) order by dia)
        from (
          select ((criada_em at time zone 'America/Sao_Paulo') - interval '6 hours')::date as dia,
                 round(avg(nota)::numeric, 1) as media,
                 count(*) as total
          from periodo
          group by 1
        ) d
      ), '[]'::jsonb),
      'anterior', jsonb_build_object(
        'total', (select count(*) from anterior),
        'media', (select round(avg(nota)::numeric, 1) from anterior))
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Quem pode chamar o quê
-- ---------------------------------------------------------------------
revoke all on function public.avaliacao_pendente() from public, anon;
revoke all on function public.avaliar(uuid, int, text) from public, anon;
revoke all on function public.dispensar_avaliacao(uuid) from public, anon;
revoke all on function public.responder_avaliacao(uuid, text) from public, anon;
revoke all on function public.denunciar_avaliacao(uuid, text) from public, anon;
revoke all on function public.avaliacoes_periodo(int) from public, anon;
grant execute on function public.avaliacao_pendente() to authenticated;
grant execute on function public.avaliar(uuid, int, text) to authenticated;
grant execute on function public.dispensar_avaliacao(uuid) to authenticated;
grant execute on function public.responder_avaliacao(uuid, text) to authenticated;
grant execute on function public.denunciar_avaliacao(uuid, text) to authenticated;
grant execute on function public.avaliacoes_periodo(int) to authenticated;
grant execute on function public.avaliacoes_do_bar(uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar 2 | 2 | 8 | 3
-- ---------------------------------------------------------------------
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('avaliacoes', 'avaliacoes_pedidas')) as tabelas_2,
  (select count(*) from information_schema.columns
    where table_name = 'estabelecimentos' and column_name in ('nota_media', 'total_avaliacoes')) as colunas_2,
  (select count(distinct proname) from pg_proc
    where proname in ('avaliacao_pendente', 'avaliar', 'dispensar_avaliacao', 'avaliacoes_do_bar',
                      'responder_avaliacao', 'denunciar_avaliacao', 'avaliacoes_periodo',
                      'encerrar_pedidos_de_avaliacao')) as funcoes_8,
  (select count(*) from pg_trigger
    where not tgisinternal
      and tgname in ('pedir_avaliacao', 'recalcular_nota_estabelecimento', 'proteger_nota_estabelecimento')) as gatilhos_3;
