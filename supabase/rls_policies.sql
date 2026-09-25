-- =====================================================================
-- +party — Políticas de Row Level Security (RLS)
-- =====================================================================
-- Como aplicar: Supabase → SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar mais de uma vez sem problema (usa DROP POLICY IF EXISTS
-- e CREATE OR REPLACE FUNCTION antes de recriar).
--
-- Regras de negócio cobertas (ver README/contexto do projeto):
--   - cliente só enxerga/mexe nas próprias comandas, pedidos e alertas
--   - funcionario/gerente enxergam tudo do próprio estabelecimento
--   - cardápio e lista de estabelecimentos são de leitura pública
--     (necessário para o cliente escolher o bar antes de fazer login)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Funções auxiliares (SECURITY DEFINER)
-- ---------------------------------------------------------------------
-- Sem isso, uma policy em "perfis" que consulta a própria "perfis"
-- entra em recursão infinita. Estas funções rodam com privilégio do
-- dono (bypassando RLS) só para responder "quem é o usuário logado".

create or replace function public.meu_tipo()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select tipo from perfis where id = auth.uid()
$$;

create or replace function public.meu_estabelecimento_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select estabelecimento_id from perfis where id = auth.uid()
$$;

create or replace function public.sou_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.meu_tipo() in ('gerente', 'funcionario'), false)
$$;

-- ---------------------------------------------------------------------
-- 2. Ativar RLS em todas as tabelas
-- ---------------------------------------------------------------------
alter table estabelecimentos enable row level security;
alter table perfis            enable row level security;
alter table itens             enable row level security;
alter table comandas          enable row level security;
alter table pedidos           enable row level security;
alter table pedido_itens      enable row level security;
alter table alertas           enable row level security;
alter table postagens         enable row level security;

-- ---------------------------------------------------------------------
-- 3. perfis — cada um só vê/edita o próprio perfil
-- ---------------------------------------------------------------------
drop policy if exists "perfis: ver o próprio"        on perfis;
drop policy if exists "perfis: criar o próprio"       on perfis;
drop policy if exists "perfis: atualizar o próprio"   on perfis;

create policy "perfis: ver o próprio"
  on perfis for select
  using (id = auth.uid());

create policy "perfis: criar o próprio"
  on perfis for insert
  with check (id = auth.uid());

create policy "perfis: atualizar o próprio"
  on perfis for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. estabelecimentos — leitura pública, escrita só do gerente do local
-- ---------------------------------------------------------------------
drop policy if exists "estabelecimentos: leitura pública"      on estabelecimentos;
drop policy if exists "estabelecimentos: gerente atualiza"      on estabelecimentos;

create policy "estabelecimentos: leitura pública"
  on estabelecimentos for select
  using (true);

create policy "estabelecimentos: gerente atualiza"
  on estabelecimentos for update
  using (public.meu_tipo() = 'gerente' and id = public.meu_estabelecimento_id())
  with check (public.meu_tipo() = 'gerente' and id = public.meu_estabelecimento_id());

-- ---------------------------------------------------------------------
-- 5. itens — cardápio é de leitura pública, escrita só de staff do local
-- ---------------------------------------------------------------------
drop policy if exists "itens: leitura pública"    on itens;
drop policy if exists "itens: staff gerencia"     on itens;

create policy "itens: leitura pública"
  on itens for select
  using (true);

create policy "itens: staff gerencia"
  on itens for all
  using (public.sou_staff() and estabelecimento_id = public.meu_estabelecimento_id())
  with check (public.sou_staff() and estabelecimento_id = public.meu_estabelecimento_id());

-- ---------------------------------------------------------------------
-- 6. comandas — dono da comanda ou staff do estabelecimento
-- ---------------------------------------------------------------------
drop policy if exists "comandas: dono ou staff vê"       on comandas;
drop policy if exists "comandas: cliente abre a própria" on comandas;
drop policy if exists "comandas: dono ou staff atualiza" on comandas;

create policy "comandas: dono ou staff vê"
  on comandas for select
  using (
    usuario_id = auth.uid()
    or (public.sou_staff() and estabelecimento_id = public.meu_estabelecimento_id())
  );

create policy "comandas: cliente abre a própria"
  on comandas for insert
  with check (usuario_id = auth.uid());

create policy "comandas: dono ou staff atualiza"
  on comandas for update
  using (
    usuario_id = auth.uid()
    or (public.sou_staff() and estabelecimento_id = public.meu_estabelecimento_id())
  )
  with check (
    usuario_id = auth.uid()
    or (public.sou_staff() and estabelecimento_id = public.meu_estabelecimento_id())
  );

-- ---------------------------------------------------------------------
-- 7. pedidos — segue o dono da comanda
-- ---------------------------------------------------------------------
drop policy if exists "pedidos: dono ou staff vê"    on pedidos;
drop policy if exists "pedidos: cliente cria"        on pedidos;

create policy "pedidos: dono ou staff vê"
  on pedidos for select
  using (
    exists (
      select 1 from comandas c
      where c.id = pedidos.comanda_id
        and (
          c.usuario_id = auth.uid()
          or (public.sou_staff() and c.estabelecimento_id = public.meu_estabelecimento_id())
        )
    )
  );

create policy "pedidos: cliente cria"
  on pedidos for insert
  with check (
    exists (
      select 1 from comandas c
      where c.id = pedidos.comanda_id
        and c.usuario_id = auth.uid()
        and c.status = 'aberta'
    )
  );

-- ---------------------------------------------------------------------
-- 8. pedido_itens — cliente cria, staff avança o status
-- ---------------------------------------------------------------------
drop policy if exists "pedido_itens: dono ou staff vê"     on pedido_itens;
drop policy if exists "pedido_itens: cliente cria"          on pedido_itens;
drop policy if exists "pedido_itens: staff atualiza status" on pedido_itens;

create policy "pedido_itens: dono ou staff vê"
  on pedido_itens for select
  using (
    exists (
      select 1 from pedidos p
      join comandas c on c.id = p.comanda_id
      where p.id = pedido_itens.pedido_id
        and (
          c.usuario_id = auth.uid()
          or (public.sou_staff() and c.estabelecimento_id = public.meu_estabelecimento_id())
        )
    )
  );

create policy "pedido_itens: cliente cria"
  on pedido_itens for insert
  with check (
    exists (
      select 1 from pedidos p
      join comandas c on c.id = p.comanda_id
      where p.id = pedido_itens.pedido_id
        and c.usuario_id = auth.uid()
    )
  );

create policy "pedido_itens: staff atualiza status"
  on pedido_itens for update
  using (
    exists (
      select 1 from pedidos p
      join comandas c on c.id = p.comanda_id
      where p.id = pedido_itens.pedido_id
        and public.sou_staff()
        and c.estabelecimento_id = public.meu_estabelecimento_id()
    )
  );

-- ---------------------------------------------------------------------
-- 9. alertas — cliente chama garçom, staff vê e resolve
-- ---------------------------------------------------------------------
drop policy if exists "alertas: dono ou staff vê"      on alertas;
drop policy if exists "alertas: cliente cria"          on alertas;
drop policy if exists "alertas: staff atualiza status" on alertas;

create policy "alertas: dono ou staff vê"
  on alertas for select
  using (
    exists (
      select 1 from comandas c
      where c.id = alertas.comanda_id
        and (
          c.usuario_id = auth.uid()
          or (public.sou_staff() and c.estabelecimento_id = public.meu_estabelecimento_id())
        )
    )
  );

create policy "alertas: cliente cria"
  on alertas for insert
  with check (
    exists (
      select 1 from comandas c
      where c.id = alertas.comanda_id
        and c.usuario_id = auth.uid()
    )
  );

create policy "alertas: staff atualiza status"
  on alertas for update
  using (
    exists (
      select 1 from comandas c
      where c.id = alertas.comanda_id
        and public.sou_staff()
        and c.estabelecimento_id = public.meu_estabelecimento_id()
    )
  );

-- ---------------------------------------------------------------------
-- 10. postagens — leitura pública, escrita só do gerente do local
-- ---------------------------------------------------------------------
drop policy if exists "postagens: leitura pública" on postagens;
drop policy if exists "postagens: gerente publica"  on postagens;

create policy "postagens: leitura pública"
  on postagens for select
  using (true);

create policy "postagens: gerente publica"
  on postagens for all
  using (public.meu_tipo() = 'gerente' and estabelecimento_id = public.meu_estabelecimento_id())
  with check (public.meu_tipo() = 'gerente' and estabelecimento_id = public.meu_estabelecimento_id());

-- ---------------------------------------------------------------------
-- 11. perfis — staff vê o perfil de quem tem comanda no seu local
-- ---------------------------------------------------------------------
-- A tela do bar/cozinha mostra o nome do cliente em cada pedido (essencial
-- no balcão, onde não há mesa). Sem esta política o atendente só lê o
-- próprio perfil e o nome chega vazio.
drop policy if exists "perfis: staff vê clientes do seu local" on perfis;

create policy "perfis: staff vê clientes do seu local"
  on perfis for select
  using (
    public.sou_staff()
    and exists (
      select 1 from comandas c
      where c.usuario_id = perfis.id
        and c.estabelecimento_id = public.meu_estabelecimento_id()
    )
  );
