-- =====================================================================
-- +party — Índices para as consultas mais usadas
-- =====================================================================
-- O Query Performance do Supabase apontou a consulta do Movimento (comandas
-- da noite com pedidos e itens) e o Index Advisor sugeriu 3 índices, que
-- reduzem o custo dela em cerca de 80%:
--   comandas (criada_em), pedidos (comanda_id), pedido_itens (pedido_id)
--
-- No Postgres, ligação entre tabelas (chave estrangeira) não ganha índice
-- sozinha. Por isso entram também os índices das ligações que o app consulta
-- o tempo todo: as comandas de um bar e de um cliente, os itens de um pedido,
-- a equipe de um bar e os chamados de garçom de uma comanda.
--
-- Índice deixa a leitura mais rápida e a gravação um pouco mais lenta. Aqui
-- só entram os que as telas usam em toda atualização.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- Depois: Query Performance → "Reset report" e, em alguns dias, compare.
-- =====================================================================

-- Sugeridos pelo Index Advisor (consulta do Movimento)
create index if not exists comandas_criada_em_idx on comandas (criada_em);
create index if not exists pedidos_comanda_idx on pedidos (comanda_id);
create index if not exists pedido_itens_pedido_idx on pedido_itens (pedido_id);

-- Comandas de um bar por data: Movimento, Resultados, atendente.
create index if not exists comandas_bar_criada_em_idx on comandas (estabelecimento_id, criada_em);
-- Comandas de um cliente: comanda ativa, histórico de conta não paga.
create index if not exists comandas_cliente_idx on comandas (usuario_id, criada_em desc);
-- Itens vendidos por item do cardápio: mais vendidos, itens sem venda.
create index if not exists pedido_itens_item_idx on pedido_itens (item_id);
-- Equipe de um bar (atendentes e gerente).
create index if not exists perfis_bar_idx on perfis (estabelecimento_id) where estabelecimento_id is not null;
-- Chamados de garçom de uma comanda.
create index if not exists alertas_comanda_idx on alertas (comanda_id);

-- Atualiza as estatísticas para o banco já começar a usar os índices.
analyze comandas, pedidos, pedido_itens, perfis, alertas;

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar 8
-- ---------------------------------------------------------------------
select count(*) as indices_8
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'comandas_criada_em_idx', 'pedidos_comanda_idx', 'pedido_itens_pedido_idx',
    'comandas_bar_criada_em_idx', 'comandas_cliente_idx', 'pedido_itens_item_idx',
    'perfis_bar_idx', 'alertas_comanda_idx'
  );
