-- =====================================================================
-- +party — Equipe por convite, foto de perfil e desempenho do atendente
-- =====================================================================
-- Depende de supabase/equipe.sql (tabela solicitacoes_equipe e funções
-- de aprovar e remover). Três partes:
--
-- 1. CONVITES. Antes, qualquer pessoa podia pedir para trabalhar em
--    qualquer bar pela tela de login. Agora só quem recebe um link de
--    convite do gerente consegue pedir. O convite:
--      - vale 48 horas;
--      - serve para uma pessoa só;
--      - não dá acesso sozinho: o gerente ainda aprova o pedido.
--    O pedido direto (sem convite) deixa de existir: a policy de INSERT
--    em solicitacoes_equipe é removida, e o único caminho é a função
--    aceitar_convite, que confere o convite antes de criar o pedido.
--
-- 2. FOTO DE PERFIL. Coluna foto_url em perfis e o bucket fotos-perfil
--    no Storage. Cada pessoa só envia e troca arquivos da própria pasta
--    (<id do usuário>/...). Leitura pública: quem tem o endereço da foto
--    consegue abri-la, como numa foto de perfil de rede social.
--
-- 3. QUEM FEZ O QUÊ. Para o gerente ver o desempenho de cada atendente, o
--    banco passa a registrar quem marcou cada item como pronto e quem
--    liberou e confirmou o pagamento de cada comanda, e quando. Quem
--    registra é o próprio banco (trigger), com o usuário logado: o app
--    não consegue informar outra pessoa nem outro horário.
--    Vale daqui para a frente: o que foi feito antes fica sem autor.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Convites
-- ---------------------------------------------------------------------
create table if not exists convites_equipe (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null unique,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  criado_por         uuid references perfis(id) on delete set null,
  criado_em          timestamptz not null default now(),
  expira_em          timestamptz not null default now() + interval '48 hours',
  usado_em           timestamptz,
  usado_por          uuid references perfis(id) on delete set null
);

alter table convites_equipe enable row level security;

-- O gerente vê e cancela os convites do próprio bar. Não há policy de
-- INSERT nem de UPDATE: criar e usar convite só pelas funções abaixo.
drop policy if exists "convites_equipe: gerente vê os do seu bar"      on convites_equipe;
drop policy if exists "convites_equipe: gerente cancela os não usados" on convites_equipe;

create policy "convites_equipe: gerente vê os do seu bar"
  on convites_equipe for select
  using (
    public.meu_tipo() = 'gerente'
    and estabelecimento_id = public.meu_estabelecimento_id()
  );

create policy "convites_equipe: gerente cancela os não usados"
  on convites_equipe for delete
  using (
    public.meu_tipo() = 'gerente'
    and estabelecimento_id = public.meu_estabelecimento_id()
    and usado_em is null
  );

-- O pedido guarda o convite que o originou (a aba Equipe mostra isso).
alter table solicitacoes_equipe
  add column if not exists convite_id uuid references convites_equipe(id) on delete set null;

-- Fim do pedido direto: sem convite, não há como pedir.
drop policy if exists "solicitacoes_equipe: cliente pede" on solicitacoes_equipe;

-- Gerente gera um convite novo para o próprio bar.
-- O código vem de gen_random_uuid() (aleatório de verdade), em 3 blocos
-- de 4 caracteres: ex. A3F9-C17B-2D40.
create or replace function public.criar_convite()
returns convites_equipe
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bruto  text;
  v_convite convites_equipe;
begin
  if public.meu_tipo() is distinct from 'gerente' then
    raise exception 'Só o gerente pode convidar atendentes.';
  end if;

  v_bruto := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into convites_equipe (codigo, estabelecimento_id, criado_por)
  values (
    substr(v_bruto, 1, 4) || '-' || substr(v_bruto, 5, 4) || '-' || substr(v_bruto, 9, 4),
    public.meu_estabelecimento_id(),
    auth.uid()
  )
  returning * into v_convite;

  return v_convite;
end;
$$;

-- A página do convite mostra o nome do bar antes de a pessoa entrar ou
-- criar conta, então esta função também é liberada para quem não está
-- logado. Devolve só o nome do bar e a situação; nenhuma linha quer
-- dizer que o código não existe.
create or replace function public.ver_convite(p_codigo text)
returns table (estabelecimento_nome text, situacao text)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.nome,
    case
      when c.usado_em is not null then 'usado'
      when c.expira_em <= now() then 'expirado'
      else 'valido'
    end
  from convites_equipe c
  join estabelecimentos e on e.id = c.estabelecimento_id
  where c.codigo = upper(trim(p_codigo))
$$;

-- Quem recebeu o link pede para entrar na equipe daquele bar.
create or replace function public.aceitar_convite(p_codigo text, p_telefone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_convite convites_equipe%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para aceitar o convite.';
  end if;

  if public.meu_tipo() is distinct from 'cliente' then
    raise exception 'Esta conta já faz parte da equipe de um bar.';
  end if;

  -- FOR UPDATE: duas abas com o mesmo link não usam o convite duas vezes.
  select * into v_convite
  from convites_equipe
  where codigo = upper(trim(p_codigo))
  for update;

  if not found then
    raise exception 'Convite não encontrado. Confira o link com o gerente.';
  end if;
  if v_convite.usado_em is not null then
    raise exception 'Este convite já foi usado. Peça um novo ao gerente.';
  end if;
  if v_convite.expira_em <= now() then
    raise exception 'Este convite expirou. Peça um novo ao gerente.';
  end if;

  -- Uma solicitação em aberto por pessoa: um pedido pendente ou recusado
  -- anterior dá lugar a este.
  delete from solicitacoes_equipe
  where usuario_id = auth.uid()
    and status <> 'aprovada';

  insert into solicitacoes_equipe (usuario_id, estabelecimento_id, telefone, convite_id)
  values (auth.uid(), v_convite.estabelecimento_id, trim(p_telefone), v_convite.id);

  update convites_equipe
  set usado_em = now(),
      usado_por = auth.uid()
  where id = v_convite.id;
end;
$$;

-- No Supabase, função nova nasce executável também por anon: revogar só
-- de public não basta.
revoke execute on function public.criar_convite() from public, anon;
grant  execute on function public.criar_convite() to authenticated;

revoke execute on function public.aceitar_convite(text, text) from public, anon;
grant  execute on function public.aceitar_convite(text, text) to authenticated;

revoke execute on function public.ver_convite(text) from public;
grant  execute on function public.ver_convite(text) to anon, authenticated;

-- Mesma correção para as funções de supabase/equipe.sql.
revoke execute on function public.responder_solicitacao(uuid, boolean) from public, anon;
grant  execute on function public.responder_solicitacao(uuid, boolean) to authenticated;
revoke execute on function public.remover_funcionario(uuid) from public, anon;
grant  execute on function public.remover_funcionario(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Foto de perfil
-- ---------------------------------------------------------------------
alter table perfis add column if not exists foto_url text;

-- Até 2 MB e só imagem. O app já reduz a foto antes de enviar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-perfil', 'fotos-perfil', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos-perfil: cada um envia na própria pasta" on storage.objects;
drop policy if exists "fotos-perfil: cada um troca a própria"       on storage.objects;
drop policy if exists "fotos-perfil: cada um apaga a própria"       on storage.objects;

create policy "fotos-perfil: cada um envia na própria pasta"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "fotos-perfil: cada um troca a própria"
  on storage.objects for update to authenticated
  using (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "fotos-perfil: cada um apaga a própria"
  on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-perfil' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 3. Quem fez o quê
-- ---------------------------------------------------------------------
alter table pedido_itens
  add column if not exists pronto_por uuid references perfis(id) on delete set null,
  add column if not exists pronto_em  timestamptz;

alter table comandas
  add column if not exists liberada_por  uuid references perfis(id) on delete set null,
  add column if not exists liberada_em   timestamptz,
  add column if not exists pagamento_por uuid references perfis(id) on delete set null,
  add column if not exists pagamento_em  timestamptz;

-- As colunas só mudam aqui: o que o app mandar nelas é ignorado.
create or replace function public.registrar_item_pronto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.pronto_por := null;
    new.pronto_em := null;
    return new;
  end if;

  if new.status = 'pronto' and old.status is distinct from 'pronto' then
    new.pronto_por := auth.uid();
    new.pronto_em := now();
  else
    new.pronto_por := old.pronto_por;
    new.pronto_em := old.pronto_em;
  end if;

  return new;
end;
$$;

drop trigger if exists registrar_item_pronto on pedido_itens;
create trigger registrar_item_pronto
  before insert or update on pedido_itens
  for each row execute function public.registrar_item_pronto();

create or replace function public.registrar_responsaveis_comanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.liberada_por := null;
    new.liberada_em := null;
    new.pagamento_por := null;
    new.pagamento_em := null;
    return new;
  end if;

  if old.status = 'aguardando_liberacao' and new.status = 'aberta' then
    new.liberada_por := auth.uid();
    new.liberada_em := now();
  else
    new.liberada_por := old.liberada_por;
    new.liberada_em := old.liberada_em;
  end if;

  if old.status = 'aguardando_pagamento' and new.status = 'paga' then
    new.pagamento_por := auth.uid();
    new.pagamento_em := now();
  else
    new.pagamento_por := old.pagamento_por;
    new.pagamento_em := old.pagamento_em;
  end if;

  return new;
end;
$$;

drop trigger if exists registrar_responsaveis_comanda on comandas;
create trigger registrar_responsaveis_comanda
  before insert or update on comandas
  for each row execute function public.registrar_responsaveis_comanda();

-- Faz a API enxergar as colunas, a tabela e as funções novas na hora.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar
--   convites = 2 | pedido_direto_fechado = true | bucket = true |
--   fotos = 3 | registros = 2
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'convites_equipe') as convites,
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'solicitacoes_equipe' and cmd = 'INSERT'
  ) as pedido_direto_fechado,
  exists (select 1 from storage.buckets where id = 'fotos-perfil') as bucket,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'fotos-perfil:%') as fotos,
  (select count(*) from pg_trigger
    where tgname in ('registrar_item_pronto', 'registrar_responsaveis_comanda')) as registros;
