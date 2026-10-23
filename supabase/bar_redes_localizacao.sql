-- =====================================================================
-- +party — Redes sociais e localização do bar; edição de postagens
-- =====================================================================
-- 1. estabelecimentos ganha:
--      instagram   usuário do Instagram, sem @ (ex: 'bardoze')
--      tiktok      usuário do TikTok, sem @ (ex: 'bardoze')
--      whatsapp    número só com dígitos, com 55 e DDD (ex: '5511987654321')
--      latitude    ponto do bar no mapa (graus decimais)
--      longitude
--    O app pode mandar do jeito que o gerente digitar: "@bardoze",
--    "instagram.com/bardoze", "(11) 98765-4321"... O banco limpa antes de
--    gravar e recusa o que continuar inválido. O app monta os links:
--      https://instagram.com/<instagram>
--      https://www.tiktok.com/@<tiktok>
--      https://wa.me/<whatsapp>
--      https://www.google.com/maps/dir/?api=1&destination=<latitude>,<longitude>
--    Quem edita: só o gerente do próprio bar (regra que já existe em
--    rls_policies.sql). Leitura: pública, como o resto do bar.
--
-- 2. postagens: o gerente já podia editar as postagens do seu bar. Agora a
--    edição não consegue mudar a data de publicação nem o bar da postagem,
--    e registra quando foi editada (editada_em).
--
-- Erros que o app pode receber ao salvar (código 23514, nome da regra):
--   estabelecimentos_instagram_check, estabelecimentos_tiktok_check,
--   estabelecimentos_whatsapp_check, estabelecimentos_localizacao_check
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Redes sociais e localização
-- ---------------------------------------------------------------------
alter table estabelecimentos
  add column if not exists instagram text,
  add column if not exists tiktok    text,
  add column if not exists whatsapp  text,
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

-- Limpa o que o gerente digitou: tira espaços, @, endereço do site e
-- pontuação do telefone. Campo vazio vira "sem rede".
create or replace function public.preparar_estabelecimento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.instagram := nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(new.instagram, ''))),
                     '^(https?://)?(www\.)?instagram\.com/', ''),
      '^@|[/?].*$', '', 'g'),
    '');

  new.tiktok := nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(new.tiktok, ''))),
                     '^(https?://)?(www\.)?tiktok\.com/', ''),
      '^@|[/?].*$', '', 'g'),
    '');

  new.whatsapp := nullif(regexp_replace(coalesce(new.whatsapp, ''), '\D', '', 'g'), '');
  -- Número brasileiro digitado sem o 55 (DDD + 8 ou 9 dígitos).
  if new.whatsapp is not null and char_length(new.whatsapp) in (10, 11) then
    new.whatsapp := '55' || new.whatsapp;
  end if;

  return new;
end;
$$;

drop trigger if exists preparar_estabelecimento on estabelecimentos;
create trigger preparar_estabelecimento
  before insert or update on estabelecimentos
  for each row execute function public.preparar_estabelecimento();

alter table estabelecimentos drop constraint if exists estabelecimentos_instagram_check;
alter table estabelecimentos add constraint estabelecimentos_instagram_check
  check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$');

alter table estabelecimentos drop constraint if exists estabelecimentos_tiktok_check;
alter table estabelecimentos add constraint estabelecimentos_tiktok_check
  check (tiktok is null or tiktok ~ '^[a-z0-9._]{2,24}$');

-- 55 + DDD + 8 ou 9 dígitos.
alter table estabelecimentos drop constraint if exists estabelecimentos_whatsapp_check;
alter table estabelecimentos add constraint estabelecimentos_whatsapp_check
  check (whatsapp is null or whatsapp ~ '^55[1-9][0-9]{9,10}$');

-- Os dois juntos ou nenhum, e dentro do globo.
alter table estabelecimentos drop constraint if exists estabelecimentos_localizacao_check;
alter table estabelecimentos add constraint estabelecimentos_localizacao_check
  check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null
        and latitude between -90 and 90 and longitude between -180 and 180)
  );

-- ---------------------------------------------------------------------
-- 2. Edição de postagens
-- ---------------------------------------------------------------------
alter table postagens
  add column if not exists editada_em timestamptz;

-- Na edição, a data de publicação e o bar continuam os originais (o Feed
-- ordena por criada_em: mudar a data faria uma postagem velha "subir").
create or replace function public.proteger_postagem_editada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.criada_em          := old.criada_em;
    new.estabelecimento_id := old.estabelecimento_id;
    new.editada_em         := now();
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_postagem_editada on postagens;
create trigger proteger_postagem_editada
  before update on postagens
  for each row execute function public.proteger_postagem_editada();

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: tudo deve vir com o número indicado
-- ---------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'estabelecimentos'
      and column_name in ('instagram', 'tiktok', 'whatsapp', 'latitude', 'longitude')) as colunas_novas_5,
  (select count(*) from pg_constraint
    where conname in ('estabelecimentos_instagram_check', 'estabelecimentos_tiktok_check',
                      'estabelecimentos_whatsapp_check', 'estabelecimentos_localizacao_check')) as regras_4,
  (select count(*) from pg_trigger
    where tgname in ('preparar_estabelecimento', 'proteger_postagem_editada')
      and not tgisinternal) as gatilhos_2,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'postagens'
      and column_name = 'editada_em') as editada_em_1;
