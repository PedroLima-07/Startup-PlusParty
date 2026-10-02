-- =====================================================================
-- +party — Template de onboarding de um novo estabelecimento
-- =====================================================================
-- Não existe tela de cadastro de cardápio no app (decisão de escopo):
-- quando um bar novo quiser usar o +party, a equipe cadastra o
-- estabelecimento e o cardápio dele direto aqui, pelo SQL Editor do
-- Supabase (Table Editor também funciona, isso aqui só agiliza).
--
-- Como usar: copie este arquivo, troque os valores de exemplo pelos
-- do bar novo, rode no SQL Editor. Não precisa commitar a cópia
-- preenchida — isso é operação, não código do produto.
-- =====================================================================

-- 1. Estabelecimento
-- descricao é o resumo do card no Discovery; sobre é o texto do perfil.
-- A foto fica em public/img/estabelecimentos (commitada no app).
-- dias_abertos: 0 = domingo ... 6 = sábado. Detalhes em estabelecimentos_detalhes.sql.
insert into estabelecimentos (
  id, nome, descricao, endereco, capacidade,
  foto_url, sobre, tags, horario_abre, horario_fecha, dias_abertos
)
values (
  gen_random_uuid(),
  'Nome do Bar',
  'Descrição curta do bar',
  'Endereço completo',
  50,
  'img/estabelecimentos/nome-do-bar.jpg',
  'Texto mais completo: clima, temática e pra quem é o lugar.',
  array['Agitado', 'Bom pro rolê'],
  '18:00',
  '02:00',
  '{2,3,4,5,6}'
)
returning id; -- guarde esse id, é o estabelecimento_id usado abaixo

-- 2. Itens do cardápio
-- Troque 'ESTABELECIMENTO_ID_AQUI' pelo id retornado no passo 1.
insert into itens (estabelecimento_id, nome, categoria, preco, setor, disponivel)
values
  ('ESTABELECIMENTO_ID_AQUI', 'Chope Pilsen 350ml', 'Cervejas', 12.00, 'bar', true),
  ('ESTABELECIMENTO_ID_AQUI', 'IPA Artesanal 500ml', 'Cervejas', 24.00, 'bar', true),
  ('ESTABELECIMENTO_ID_AQUI', 'Caipirinha de Limão', 'Drinks', 22.00, 'bar', true),
  ('ESTABELECIMENTO_ID_AQUI', 'Batata Frita c/ Cheddar', 'Pra petiscar', 34.00, 'cozinha', true);

-- 3. (Opcional) Perfil do gerente/funcionário do bar
-- Só depois que essa pessoa tiver feito signup pelo app (supabase.auth),
-- para ter o id do auth.users. Troque AUTH_USER_ID_AQUI por esse id.
insert into perfis (id, nome, email, tipo, estabelecimento_id)
values (
  'AUTH_USER_ID_AQUI',
  'Nome do gerente',
  'email@bar.com',
  'gerente',
  'ESTABELECIMENTO_ID_AQUI'
);
