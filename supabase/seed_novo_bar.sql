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

-- 3. Gerente do bar
-- O gerente é o único papel definido por aqui: é isso que identifica quem
-- responde pelo bar. Peça para a pessoa se cadastrar pelo app (ela nasce
-- cliente, com o perfil já criado) e então promova pelo e-mail do cadastro.
-- Deve responder "UPDATE 1"; "UPDATE 0" quer dizer que o e-mail não bateu.
update perfis
set tipo = 'gerente',
    estabelecimento_id = 'ESTABELECIMENTO_ID_AQUI'
where email = 'email-do-gerente@exemplo.com';

-- Os atendentes não entram por aqui: cada um se cadastra pelo app, em
-- "Sou atendente", e o gerente aprova na aba Equipe (ver equipe.sql).
