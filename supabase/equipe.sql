-- =====================================================================
-- +party — Equipe: o atendente pede para entrar, o gerente decide
-- =====================================================================
-- Antes, transformar alguém em atendente exigia a equipe do +party rodar
-- SQL no painel. Como atendente entra e sai o tempo todo, isso passa a
-- ser resolvido entre o atendente e o gerente do bar, pelo app:
--
--   1. a pessoa se cadastra (nasce cliente, como todo mundo) e cria uma
--      solicitação escolhendo o bar;
--   2. o gerente daquele bar vê a solicitação na aba Equipe e aprova ou
--      recusa;
--   3. aprovada, o perfil vira funcionário do bar. O gerente também pode
--      remover um funcionário, que volta a ser cliente.
--
-- Decisões de segurança:
--   - Ninguém vira funcionário sozinho. A solicitação não muda o perfil;
--     quem muda são as funções abaixo, e só para o gerente do bar em
--     questão. Não existe policy de UPDATE em solicitacoes_equipe: o
--     candidato não consegue se aprovar pela API.
--   - As funções são SECURITY DEFINER porque o gerente não tem (nem deve
--     ter) permissão de alterar o perfil de outra pessoa pelo RLS. Elas
--     conferem quem está chamando antes de qualquer alteração.
--   - O trigger proteger_perfil (supabase/protecoes.sql) continua sendo a
--     última barreira: ele só aceita a mudança de tipo se for o gerente
--     contratando alguém com solicitação aprovada no bar dele, ou
--     desligando um funcionário do bar dele.
--   - O gerente continua sendo criado pela equipe do +party, pelo painel
--     (ver supabase/seed_novo_bar.sql).
--
-- Como aplicar (as duas partes são necessárias):
--   1. SQL Editor → colar supabase/protecoes.sql inteiro → Run
--      (o trigger proteger_perfil ganhou as regras do gerente);
--   2. SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------
create table if not exists solicitacoes_equipe (
  id                 uuid primary key default gen_random_uuid(),
  usuario_id         uuid not null references perfis(id) on delete cascade,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  telefone           text not null check (char_length(btrim(telefone)) between 8 and 20),
  status             text not null default 'pendente'
                     check (status in ('pendente', 'aprovada', 'recusada')),
  criada_em          timestamptz not null default now(),
  respondida_em      timestamptz
);

-- Uma solicitação em aberto por pessoa: enquanto houver uma pendente ou uma
-- recusada que ela ainda não dispensou, não dá para criar outra.
create unique index if not exists solicitacoes_equipe_uma_em_aberto
  on solicitacoes_equipe (usuario_id)
  where status <> 'aprovada';

-- A aba Equipe lista as pendentes do bar do gerente.
create index if not exists solicitacoes_equipe_pendentes_do_bar
  on solicitacoes_equipe (estabelecimento_id)
  where status = 'pendente';

-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
alter table solicitacoes_equipe enable row level security;

drop policy if exists "solicitacoes_equipe: candidato vê a própria"   on solicitacoes_equipe;
drop policy if exists "solicitacoes_equipe: gerente vê as do seu bar" on solicitacoes_equipe;
drop policy if exists "solicitacoes_equipe: cliente pede"             on solicitacoes_equipe;
drop policy if exists "solicitacoes_equipe: candidato desiste"        on solicitacoes_equipe;

create policy "solicitacoes_equipe: candidato vê a própria"
  on solicitacoes_equipe for select
  using (usuario_id = auth.uid());

create policy "solicitacoes_equipe: gerente vê as do seu bar"
  on solicitacoes_equipe for select
  using (
    public.meu_tipo() = 'gerente'
    and estabelecimento_id = public.meu_estabelecimento_id()
  );

-- Só cliente pede (quem já é funcionário ou gerente não), sempre para si e
-- sempre como pendente.
create policy "solicitacoes_equipe: cliente pede"
  on solicitacoes_equipe for insert
  with check (
    usuario_id = auth.uid()
    and status = 'pendente'
    and respondida_em is null
    and public.meu_tipo() = 'cliente'
  );

-- Desistir de uma pendente ou dispensar uma recusada. A aprovada fica como
-- registro de quem o gerente contratou.
create policy "solicitacoes_equipe: candidato desiste"
  on solicitacoes_equipe for delete
  using (usuario_id = auth.uid() and status <> 'aprovada');

-- O gerente precisa ler nome, e-mail e telefone de quem pediu para entrar
-- e de quem já trabalha no bar dele. Sem isso só enxergaria o próprio perfil.
drop policy if exists "perfis: gerente vê equipe e candidatos" on perfis;

create policy "perfis: gerente vê equipe e candidatos"
  on perfis for select
  using (
    public.meu_tipo() = 'gerente'
    and (
      (tipo = 'funcionario' and estabelecimento_id = public.meu_estabelecimento_id())
      or exists (
        select 1 from solicitacoes_equipe s
        where s.usuario_id = perfis.id
          and s.estabelecimento_id = public.meu_estabelecimento_id()
      )
    )
  );

-- ---------------------------------------------------------------------
-- 3. Gerente responde a uma solicitação
-- ---------------------------------------------------------------------
create or replace function public.responder_solicitacao(
  p_solicitacao_id uuid,
  p_aprovar boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitacao solicitacoes_equipe%rowtype;
begin
  if public.meu_tipo() is distinct from 'gerente' then
    raise exception 'Só o gerente pode responder solicitações.';
  end if;

  -- FOR UPDATE: dois cliques seguidos não respondem a mesma solicitação duas vezes.
  select * into v_solicitacao
  from solicitacoes_equipe
  where id = p_solicitacao_id
    and estabelecimento_id = public.meu_estabelecimento_id()
    and status = 'pendente'
  for update;

  if not found then
    raise exception 'Solicitação não encontrada ou já respondida.';
  end if;

  -- A solicitação é marcada antes do perfil: proteger_perfil só aceita a
  -- contratação se encontrar a solicitação já aprovada.
  update solicitacoes_equipe
  set status = case when p_aprovar then 'aprovada' else 'recusada' end,
      respondida_em = now()
  where id = v_solicitacao.id;

  if p_aprovar then
    update perfis
    set tipo = 'funcionario',
        estabelecimento_id = v_solicitacao.estabelecimento_id,
        telefone = v_solicitacao.telefone
    where id = v_solicitacao.usuario_id
      and tipo = 'cliente';

    if not found then
      raise exception 'Esta pessoa já é funcionária ou gerente de um bar.';
    end if;
  end if;
end;
$$;

revoke execute on function public.responder_solicitacao(uuid, boolean) from public;
grant  execute on function public.responder_solicitacao(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Gerente remove um funcionário do bar dele
-- ---------------------------------------------------------------------
create or replace function public.remover_funcionario(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bar uuid := public.meu_estabelecimento_id();
begin
  if public.meu_tipo() is distinct from 'gerente' then
    raise exception 'Só o gerente pode remover funcionários.';
  end if;

  update perfis
  set tipo = 'cliente',
      estabelecimento_id = null
  where id = p_usuario_id
    and tipo = 'funcionario'
    and estabelecimento_id = v_bar;

  if not found then
    raise exception 'Funcionário não encontrado na sua equipe.';
  end if;

  -- Sem a aprovação antiga, voltar para a equipe exige um pedido novo.
  delete from solicitacoes_equipe
  where usuario_id = p_usuario_id
    and estabelecimento_id = v_bar
    and status = 'aprovada';
end;
$$;

revoke execute on function public.remover_funcionario(uuid) from public;
grant  execute on function public.remover_funcionario(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Tempo real: a aba Equipe e a tela de espera atualizam sozinhas
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'solicitacoes_equipe'
  ) then
    alter publication supabase_realtime add table public.solicitacoes_equipe;
  end if;
end $$;

-- Faz a API enxergar a tabela e as funções novas na hora.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar  politicas = 4 | tempo_real = true | protecao_atualizada = true
-- (protecao_atualizada = false quer dizer que faltou rodar supabase/protecoes.sql)
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'solicitacoes_equipe') as politicas,
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'solicitacoes_equipe'
  ) as tempo_real,
  coalesce((
    select prosrc like '%solicitacoes_equipe%' from pg_proc
    where proname = 'proteger_perfil' and pronamespace = 'public'::regnamespace
  ), false) as protecao_atualizada;
