-- =====================================================================
-- +party — Feed de promoções e notificações do cliente
-- =====================================================================
-- Duas partes:
--
-- 1. FEED. A tabela postagens (que já existia, só com texto e foto)
--    ganha tipo (bebida, comida, evento, novidade), título, preço da
--    promoção, preço normal e validade. Postagem vencida sai do Feed.
--    O gerente publica pelo app; a foto vai para o bucket "postagens",
--    na pasta do próprio bar. Já entra com promoções de exemplo nos 4
--    bares, para o Feed não começar vazio.
--
-- 2. NOTIFICAÇÕES. Tabela notificacoes, preenchida só pelo banco
--    (triggers), nunca pelo app:
--      - comanda liberada, comanda recusada, pagamento confirmado;
--      - pedido pronto (um aviso por pedido e setor: bar ou cozinha);
--      - postagem nova de um bar onde o cliente já abriu comanda.
--    Cada um só vê, marca como lida e apaga as próprias notificações.
--    O app recebe as novas na hora (Realtime).
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Feed
-- ---------------------------------------------------------------------
alter table postagens
  add column if not exists tipo         text not null default 'novidade',
  add column if not exists titulo       text,
  add column if not exists preco        numeric(10, 2),
  add column if not exists preco_antigo numeric(10, 2),
  add column if not exists valida_ate   timestamptz;

alter table postagens drop constraint if exists postagens_tipo_check;
alter table postagens add constraint postagens_tipo_check
  check (tipo in ('bebida', 'comida', 'evento', 'novidade'));

alter table postagens drop constraint if exists postagens_tamanho_check;
alter table postagens add constraint postagens_tamanho_check
  check (char_length(coalesce(titulo, '')) <= 80 and char_length(coalesce(texto, '')) <= 500);

-- Preço normal só faz sentido acima do preço da promoção.
alter table postagens drop constraint if exists postagens_precos_check;
alter table postagens add constraint postagens_precos_check
  check (
    (preco is null or preco >= 0)
    and (preco_antigo is null or (preco is not null and preco_antigo > preco))
  );

create index if not exists postagens_feed_idx on postagens (criada_em desc);

-- A data de publicação é a do banco: o app não consegue antedatar uma
-- postagem para ela aparecer em outro lugar do Feed.
create or replace function public.preparar_postagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.criada_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists preparar_postagem on postagens;
create trigger preparar_postagem
  before insert on postagens
  for each row execute function public.preparar_postagem();

-- Fotos das postagens: até 5 MB, só imagem, leitura pública (o Feed é
-- aberto). Só o gerente envia, troca e apaga, e só na pasta do seu bar
-- (<id do bar>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('postagens', 'postagens', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "postagens: gerente envia na pasta do bar" on storage.objects;
drop policy if exists "postagens: gerente troca a do bar"        on storage.objects;
drop policy if exists "postagens: gerente apaga a do bar"        on storage.objects;

create policy "postagens: gerente envia na pasta do bar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'postagens'
    and public.meu_tipo() = 'gerente'
    and (storage.foldername(name))[1] = public.meu_estabelecimento_id()::text
  );

create policy "postagens: gerente troca a do bar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'postagens'
    and public.meu_tipo() = 'gerente'
    and (storage.foldername(name))[1] = public.meu_estabelecimento_id()::text
  );

create policy "postagens: gerente apaga a do bar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'postagens'
    and public.meu_tipo() = 'gerente'
    and (storage.foldername(name))[1] = public.meu_estabelecimento_id()::text
  );

-- Promoções de exemplo. Entram antes do trigger de aviso (mais abaixo),
-- então não geram notificação. Rodar de novo não duplica: cada uma só
-- entra se o bar ainda não tiver uma postagem com o mesmo título.
insert into postagens (estabelecimento_id, tipo, titulo, texto, preco, preco_antigo, imagem_url, valida_ate, criada_em)
select e.id, x.tipo, x.titulo, x.texto, x.preco, x.preco_antigo, x.imagem_url,
       now() + x.validade, now() - x.idade
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'bebida',
   'Happy hour: chope a R$ 9',
   'Chope Pilsen 350ml bem gelado de R$ 12 por R$ 9, todo dia até as 20h. Chegou cedo, bebeu mais barato.',
   9.00, 12.00, null, interval '30 days', interval '40 minutes'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'comida',
   'Combo batata com cheddar + 2 chopes',
   'Porção de batata frita com cheddar e dois chopes Pilsen 350ml. Perfeito para dividir com a galera.',
   49.00, 58.00, null, interval '30 days', interval '3 hours'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'evento',
   'Sexta tem roda de samba',
   'A partir das 20h, com o Grupo Raiz. Entrada gratuita. Chegue cedo para garantir sua mesa.',
   null, null, 'img/estabelecimentos/bar-dze.jpg', interval '14 days', interval '1 day'),
  ('28558e99-356b-4059-aee3-52c0846a3b20'::uuid, 'bebida',
   'Gin tônica do pôr do sol',
   'Das 17h às 19h, gin tônica com especiarias de R$ 34 por R$ 25. A vista fica por nossa conta.',
   25.00, 34.00, null, interval '30 days', interval '2 hours'),
  ('28558e99-356b-4059-aee3-52c0846a3b20'::uuid, 'evento',
   'Sunset com DJ no sábado',
   'Sábado, das 17h às 22h, DJ ao vivo no terraço. Reserve sua mesa com antecedência.',
   null, null, 'img/estabelecimentos/skyline-rooftop.jpg', interval '14 days', interval '5 hours'),
  ('c9bad552-0e41-4c06-bc6d-239dc665e083'::uuid, 'bebida',
   'Balde com 5 long necks',
   'Cinco long necks geladas no balde de R$ 60 por R$ 45. Ideal para o aniversário do seu grupo.',
   45.00, 60.00, null, interval '30 days', interval '6 hours'),
  ('c9bad552-0e41-4c06-bc6d-239dc665e083'::uuid, 'evento',
   'Noite do rock anos 80',
   'Quinta, a partir das 21h, só clássicos dos anos 80 e 90 na pista. Venha a caráter!',
   null, null, 'img/estabelecimentos/vinil-bar.webp', interval '14 days', interval '1 day 4 hours'),
  ('d34be4e4-778c-4b8f-9d53-19350ad9f1b9'::uuid, 'comida',
   'Porção de pastéis em dobro',
   'Peça uma porção de pastéis de carne ou queijo e ganhe a segunda. De R$ 52 por R$ 39.',
   39.00, 52.00, null, interval '30 days', interval '8 hours'),
  ('d34be4e4-778c-4b8f-9d53-19350ad9f1b9'::uuid, 'novidade',
   'Chegou o drink Neon Blue',
   'Vodka, curaçau blue, limão e água tônica, que brilha sob a luz negra. Já está no cardápio por R$ 28.',
   28.00, null, null, interval '30 days', interval '2 days')
) as x(estabelecimento_id, tipo, titulo, texto, preco, preco_antigo, imagem_url, validade, idade)
join estabelecimentos e on e.id = x.estabelecimento_id
where not exists (
  select 1 from postagens p
  where p.estabelecimento_id = x.estabelecimento_id and p.titulo = x.titulo
);

-- ---------------------------------------------------------------------
-- 2. Notificações
-- ---------------------------------------------------------------------
create table if not exists notificacoes (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfis(id) on delete cascade,
  tipo       text not null check (tipo in (
               'comanda_liberada', 'comanda_recusada', 'pedido_pronto',
               'pagamento_confirmado', 'postagem'
             )),
  titulo     text not null,
  texto      text,
  -- Tela do app que o aviso abre, ex.: /cliente/comanda/<id>.
  link       text,
  -- Evita aviso repetido do mesmo acontecimento (ex.: 'pronto:<pedido>:bar').
  chave      text,
  criada_em  timestamptz not null default now(),
  lida_em    timestamptz,
  unique (usuario_id, chave)
);

create index if not exists notificacoes_usuario_idx on notificacoes (usuario_id, criada_em desc);

alter table notificacoes enable row level security;

-- Sem policy de INSERT nem de UPDATE: quem cria é o banco, e marcar como
-- lida é pela função marcar_notificacoes_lidas.
drop policy if exists "notificacoes: cada um vê as próprias"   on notificacoes;
drop policy if exists "notificacoes: cada um apaga as próprias" on notificacoes;

create policy "notificacoes: cada um vê as próprias"
  on notificacoes for select
  using (usuario_id = auth.uid());

create policy "notificacoes: cada um apaga as próprias"
  on notificacoes for delete
  using (usuario_id = auth.uid());

-- Marca como lidas as notificações indicadas, ou todas (sem lista).
create or replace function public.marcar_notificacoes_lidas(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = public
as $$
  update notificacoes
  set lida_em = now()
  where usuario_id = auth.uid()
    and lida_em is null
    and (p_ids is null or id = any (p_ids));
$$;

revoke execute on function public.marcar_notificacoes_lidas(uuid[]) from public, anon;
grant  execute on function public.marcar_notificacoes_lidas(uuid[]) to authenticated;

-- Cria um aviso. Uso interno dos triggers: ninguém chama pelo app.
create or replace function public.notificar(
  p_usuario uuid,
  p_tipo    text,
  p_titulo  text,
  p_texto   text,
  p_link    text,
  p_chave   text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notificacoes (usuario_id, tipo, titulo, texto, link, chave)
  values (p_usuario, p_tipo, p_titulo, p_texto, p_link, p_chave)
  on conflict (usuario_id, chave) do nothing;
$$;

revoke execute on function public.notificar(uuid, text, text, text, text, text) from public, anon, authenticated;

-- Valor em reais, ex.: 'R$ 58,00'.
create or replace function public.em_reais(p_valor numeric)
returns text
language sql
stable
as $$
  select 'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999999990.00'), '.', ',')
$$;

-- Comanda liberada, recusada ou paga.
create or replace function public.notificar_comanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bar   text;
  v_total numeric;
  v_link  text := '/cliente/comanda/' || new.id;
begin
  select nome into v_bar from estabelecimentos where id = new.estabelecimento_id;

  if old.status = 'aguardando_liberacao' and new.status = 'aberta' then
    perform public.notificar(
      new.usuario_id, 'comanda_liberada', 'Comanda liberada! 🎉',
      'Sua comanda no ' || v_bar || ' está aberta. Já pode pedir pelo cardápio.',
      v_link, 'liberada:' || new.id);

  elsif new.status = 'recusada' then
    perform public.notificar(
      new.usuario_id, 'comanda_recusada', 'Comanda não liberada',
      'O atendente do ' || v_bar || ' não confirmou sua presença. Se você está no local, fale com a equipe.',
      v_link, 'recusada:' || new.id);

  elsif new.status = 'paga' then
    select sum(pi.quantidade * pi.preco_unitario) into v_total
    from pedido_itens pi
    join pedidos p on p.id = pi.pedido_id
    where p.comanda_id = new.id;

    perform public.notificar(
      new.usuario_id, 'pagamento_confirmado', 'Pagamento confirmado ✅',
      'Recebemos ' || public.em_reais(v_total) || ' no ' || v_bar || '. Obrigado pela visita!',
      v_link, 'paga:' || new.id);
  end if;

  return null;
end;
$$;

drop trigger if exists notificar_comanda on comandas;
create trigger notificar_comanda
  after update of status on comandas
  for each row
  when (old.status is distinct from new.status)
  execute function public.notificar_comanda();

-- Pedido pronto: um aviso quando o último item do pedido naquele setor
-- fica pronto. O atendente marca vários itens de uma vez; a chave do aviso
-- garante que eles viram uma notificação só.
create or replace function public.notificar_pedido_pronto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setor   text;
  v_itens   text;
  v_comanda uuid;
  v_usuario uuid;
  v_bar     text;
begin
  select setor into v_setor from itens where id = new.item_id;

  if exists (
    select 1
    from pedido_itens pi
    join itens it on it.id = pi.item_id
    where pi.pedido_id = new.pedido_id
      and it.setor = v_setor
      and pi.status <> 'pronto'
  ) then
    return null;
  end if;

  select c.id, c.usuario_id, e.nome
  into v_comanda, v_usuario, v_bar
  from pedidos p
  join comandas c on c.id = p.comanda_id
  join estabelecimentos e on e.id = c.estabelecimento_id
  where p.id = new.pedido_id;

  select string_agg(pi.quantidade || 'x ' || it.nome, ', ' order by it.nome)
  into v_itens
  from pedido_itens pi
  join itens it on it.id = pi.item_id
  where pi.pedido_id = new.pedido_id
    and it.setor = v_setor;

  perform public.notificar(
    v_usuario, 'pedido_pronto',
    case v_setor when 'cozinha' then 'Sua comida está pronta! 🍟' else 'Sua bebida está pronta! 🍻' end,
    v_itens || ' · ' || v_bar,
    '/cliente/comanda/' || v_comanda,
    'pronto:' || new.pedido_id || ':' || v_setor);

  return null;
end;
$$;

drop trigger if exists notificar_pedido_pronto on pedido_itens;
create trigger notificar_pedido_pronto
  after update of status on pedido_itens
  for each row
  when (new.status = 'pronto' and old.status is distinct from 'pronto')
  execute function public.notificar_pedido_pronto();

-- Postagem nova: avisa os clientes que já abriram comanda no bar.
create or replace function public.notificar_postagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bar    text;
  v_titulo text;
begin
  select nome into v_bar from estabelecimentos where id = new.estabelecimento_id;

  v_titulo := case
    when new.tipo = 'evento' then 'Tem evento no ' || v_bar || ' 🎶'
    when new.preco_antigo is not null then 'Promoção no ' || v_bar || ' 🏷️'
    else 'Novidade no ' || v_bar || ' ✨'
  end;

  insert into notificacoes (usuario_id, tipo, titulo, texto, link, chave)
  select distinct c.usuario_id, 'postagem', v_titulo,
         coalesce(new.titulo, left(new.texto, 120)),
         '/cliente/feed', 'postagem:' || new.id
  from comandas c
  join perfis pf on pf.id = c.usuario_id and pf.tipo = 'cliente'
  where c.estabelecimento_id = new.estabelecimento_id
    and c.status <> 'recusada'
  on conflict (usuario_id, chave) do nothing;

  return null;
end;
$$;

drop trigger if exists notificar_postagem on postagens;
create trigger notificar_postagem
  after insert on postagens
  for each row execute function public.notificar_postagem();

-- Funções de trigger não são chamadas pela API.
revoke execute on function public.notificar_comanda()       from public, anon, authenticated;
revoke execute on function public.notificar_pedido_pronto() from public, anon, authenticated;
revoke execute on function public.notificar_postagem()      from public, anon, authenticated;
revoke execute on function public.preparar_postagem()       from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Tempo real: o app recebe notificações e postagens novas na hora
-- ---------------------------------------------------------------------
do $$
declare
  tabela text;
begin
  foreach tabela in array array['notificacoes', 'postagens'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabela);
    end if;
  end loop;
end $$;

-- Faz a API enxergar as colunas, a tabela e as funções novas na hora.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar
--   postagens_exemplo = 9 | bucket = true | fotos = 3 |
--   notificacoes = 2 | avisos = 3 | tempo_real = 2
-- ---------------------------------------------------------------------
select
  (select count(*) from postagens where titulo is not null) as postagens_exemplo,
  exists (select 1 from storage.buckets where id = 'postagens') as bucket,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'postagens:%') as fotos,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'notificacoes') as notificacoes,
  (select count(*) from pg_trigger
    where tgname in ('notificar_comanda', 'notificar_pedido_pronto', 'notificar_postagem')) as avisos,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('notificacoes', 'postagens')) as tempo_real;
