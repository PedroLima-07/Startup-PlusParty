-- =====================================================================
-- +party — Noite de demonstração no Bar D'Zé
-- =====================================================================
-- Cria uma noite de movimento para apresentar o app: clientes, comandas,
-- pedidos e quem da equipe preparou, liberou e recebeu cada um. Os
-- horários são contados a partir da hora em que o script roda, então o
-- painel do gerente mostra tudo como "a noite de hoje".
--
-- O que aparece depois de rodar (entrando como gerente do Bar D'Zé):
--   - Movimento: 6 comandas abertas, 12 pagas, 2 aguardando pagamento,
--     2 esperando liberação, faturamento e ticket médio;
--   - "Precisa de atenção": pagamento atrasado, pedido parado e cliente
--     esperando liberação;
--   - Resultados: lotação por hora, mais vendidos e tempo de preparo;
--   - Equipe: 2 atendentes de demonstração (Ana Lima e Rafael Menezes)
--     com desempenho de hoje e das últimas 7 noites;
--   - Atendente: os mesmos pedidos e comandas em andamento.
--
-- Os clientes e atendentes de demonstração usam e-mails terminados em
-- @demo.plusparty.invalid e não têm senha: ninguém entra com eles, e
-- nenhum e-mail é enviado. Rodar de novo apaga a demonstração anterior e
-- cria outra, com os horários de agora. Para só apagar, use
-- supabase/demo_bar_dze_remover.sql.
--
-- Quando rodar: perto da apresentação, depois das 10h. A noite do app
-- começa às 6h; rodando antes das 10h, as primeiras comandas caem na
-- noite anterior e não aparecem no Movimento.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- A última consulta confere o resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Apaga a demonstração anterior, se houver
-- ---------------------------------------------------------------------
delete from pedido_itens
where pedido_id in (
  select p.id from pedidos p
  join comandas c on c.id = p.comanda_id
  join auth.users u on u.id = c.usuario_id
  where u.email like '%@demo.plusparty.invalid'
);

delete from pedidos
where comanda_id in (
  select c.id from comandas c
  join auth.users u on u.id = c.usuario_id
  where u.email like '%@demo.plusparty.invalid'
);

delete from alertas
where comanda_id in (
  select c.id from comandas c
  join auth.users u on u.id = c.usuario_id
  where u.email like '%@demo.plusparty.invalid'
);

delete from comandas
where usuario_id in (select id from auth.users where email like '%@demo.plusparty.invalid');

delete from solicitacoes_equipe
where usuario_id in (select id from auth.users where email like '%@demo.plusparty.invalid');

delete from perfis
where id in (select id from auth.users where email like '%@demo.plusparty.invalid');

delete from auth.users where email like '%@demo.plusparty.invalid';

-- ---------------------------------------------------------------------
-- 2. Ajudantes (só existem durante esta execução)
-- ---------------------------------------------------------------------

-- Usuário de demonstração: sem senha, e-mail já confirmado. O perfil é
-- criado pelo trigger ao_criar_usuario, como num cadastro normal.
create or replace function pg_temp.demo_usuario(p_nome text)
returns uuid
language plpgsql
as $$
declare
  v_email text := lower(translate(p_nome, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç ', 'AAAAEEIOOOUCaaaaeeiooouc.'))
                  || '@demo.plusparty.invalid';
  v_id uuid;
begin
  select id into v_id from auth.users where email = v_email;
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, '', now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('nome', p_nome, 'demo', true),
    now(), now(), '', '', '', ''
  );
  return v_id;
end;
$$;

-- Uma comanda com os pedidos, a partir de uma descrição em JSON:
--   abre / fecha / min: minutos a partir de p_base (negativos = antes);
--   em cada pedido, "bar" e "cozinha" dizem como está o setor:
--     um número = ficou pronto tantos minutos depois do pedido;
--     "novo" ou "em_andamento" = ainda não ficou pronto.
-- p_vez escolhe, em rodízio, quem da equipe liberou, preparou e recebeu.
create or replace function pg_temp.demo_comanda(
  p jsonb,
  p_vez int,
  p_base timestamptz,
  p_atendentes uuid[]
)
returns void
language plpgsql
as $$
declare
  v_bar constant uuid := '11111111-1111-1111-1111-111111111111';
  v_status text := p ->> 'status';
  v_abre timestamptz := p_base + make_interval(mins => (p ->> 'abre')::int);
  v_fecha timestamptz;
  v_equipe int := coalesce(array_length(p_atendentes, 1), 0);
  v_atendente uuid;
  v_comanda uuid := gen_random_uuid();
  v_pedido uuid;
  v_criado timestamptz;
  v_ordem int := 0;
  v_estado text;
  v_minutos int;
  v_pedido_json jsonb;
  v_item_json jsonb;
  v_item record;
begin
  if p ? 'fecha' then
    v_fecha := p_base + make_interval(mins => (p ->> 'fecha')::int);
  end if;
  if v_equipe > 0 then
    v_atendente := p_atendentes[(p_vez % v_equipe) + 1];
  end if;

  insert into comandas (
    id, usuario_id, estabelecimento_id, mesa, status, criada_em, fechada_em,
    liberada_por, liberada_em, pagamento_por, pagamento_em
  ) values (
    v_comanda, pg_temp.demo_usuario(p ->> 'cliente'), v_bar, p ->> 'mesa', v_status, v_abre, v_fecha,
    case when v_status <> 'aguardando_liberacao' then v_atendente end,
    case when v_status <> 'aguardando_liberacao' then v_abre + interval '2 minutes' end,
    case when v_status = 'paga' then v_atendente end,
    case when v_status = 'paga' then v_fecha + interval '3 minutes' end
  );

  for v_pedido_json in select * from jsonb_array_elements(coalesce(p -> 'pedidos', '[]')) loop
    v_ordem := v_ordem + 1;
    v_pedido := gen_random_uuid();
    v_criado := p_base + make_interval(mins => (v_pedido_json ->> 'min')::int);
    insert into pedidos (id, comanda_id, criado_em) values (v_pedido, v_comanda, v_criado);

    for v_item_json in select * from jsonb_array_elements(v_pedido_json -> 'itens') loop
      select id, preco, setor into v_item
      from itens
      where estabelecimento_id = v_bar and nome = v_item_json ->> 0;

      if v_item.id is null then
        raise exception 'O item "%" não está no cardápio do Bar D''Zé.', v_item_json ->> 0;
      end if;

      if jsonb_typeof(v_pedido_json -> v_item.setor) = 'string' then
        v_estado := v_pedido_json ->> v_item.setor;
        v_minutos := null;
      else
        v_estado := 'pronto';
        v_minutos := coalesce((v_pedido_json ->> v_item.setor)::int, 5);
      end if;

      insert into pedido_itens (pedido_id, item_id, quantidade, preco_unitario, status, pronto_por, pronto_em)
      values (
        v_pedido, v_item.id, (v_item_json ->> 1)::int, v_item.preco, v_estado,
        case when v_estado = 'pronto' and v_equipe > 0
          then p_atendentes[((p_vez + v_ordem) % v_equipe) + 1] end,
        case when v_estado = 'pronto' then v_criado + make_interval(mins => v_minutos) end
      );
    end loop;
  end loop;

  -- Alguns clientes chamaram o garçom (aparece no Resumo da noite).
  if (p ->> 'garcom')::boolean then
    insert into alertas (comanda_id, tipo, status, criado_em)
    values (v_comanda, 'chamar_garcom', 'resolvido', v_abre + interval '30 minutes');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. A noite de demonstração
-- ---------------------------------------------------------------------
do $$
declare
  v_bar constant uuid := '11111111-1111-1111-1111-111111111111';
  v_agora constant timestamptz := now();
  v_atendentes uuid[];
  v_id uuid;
  v_vez int := 0;
  v_comanda jsonb;
  v_dia int;
  v_k int;
  v_noite timestamptz;
  v_bebidas constant text[] := array['Chope Pilsen 350ml', 'Caipirinha de Limão', 'IPA Artesanal 500ml', 'Gin Tônica', 'Negroni'];
  v_comidas constant text[] := array['Batata Frita c/ Cheddar', 'Bolinho de Bacalhau', 'Iscas de Frango'];
  v_clientes constant text[] := array[
    'Isabela Nunes', 'Henrique Dias', 'Juliana Rocha', 'Marcos Vieira', 'Patrícia Gomes',
    'Rodrigo Alves', 'Camila Duarte', 'Felipe Martins', 'Larissa Freitas', 'Gustavo Pereira'
  ];
begin
  if not exists (select 1 from estabelecimentos where id = v_bar) then
    raise exception 'O Bar D''Zé (id %) não existe neste banco.', v_bar;
  end if;

  -- Estes dois triggers gravam quem fez o quê com o usuário logado; aqui
  -- não há usuário logado, e eles apagariam a equipe da demonstração.
  -- Ficam desligados só durante esta transação (se der erro, tudo volta).
  alter table comandas disable trigger registrar_responsaveis_comanda;
  alter table pedido_itens disable trigger registrar_item_pronto;

  -- Atendentes de demonstração, aprovados há 40 dias pelo convite.
  foreach v_comanda in array array[
    '{"nome": "Ana Lima", "telefone": "(15) 98888-1010"}'::jsonb,
    '{"nome": "Rafael Menezes", "telefone": "(15) 97777-2020"}'::jsonb
  ] loop
    v_id := pg_temp.demo_usuario(v_comanda ->> 'nome');
    update perfis
    set tipo = 'funcionario', estabelecimento_id = v_bar, telefone = v_comanda ->> 'telefone'
    where id = v_id;
    insert into solicitacoes_equipe (usuario_id, estabelecimento_id, telefone, status, criada_em, respondida_em)
    values (v_id, v_bar, v_comanda ->> 'telefone', 'aprovada', v_agora - interval '41 days', v_agora - interval '40 days');
  end loop;

  -- A equipe que aparece nos registros: os de demonstração e os atendentes
  -- de verdade do bar, se houver.
  select array_agg(id order by (email like '%@demo.plusparty.invalid') desc, nome)
  into v_atendentes
  from perfis
  where estabelecimento_id = v_bar and tipo = 'funcionario';

  -- Hoje, do mais antigo para o mais recente.
  foreach v_comanda in array array[
    -- Pagas
    '{"cliente":"Isabela Nunes","mesa":"1","status":"paga","abre":-235,"fecha":-150,"garcom":true,"pedidos":[{"min":-230,"itens":[["Chope Pilsen 350ml",2],["Bolinho de Bacalhau",1]],"bar":5,"cozinha":14},{"min":-190,"itens":[["Chope Pilsen 350ml",2]],"bar":4}]}',
    '{"cliente":"Henrique Dias","mesa":null,"status":"paga","abre":-228,"fecha":-170,"pedidos":[{"min":-225,"itens":[["IPA Artesanal 500ml",2],["Iscas de Frango",1]],"bar":6,"cozinha":16}]}',
    '{"cliente":"Juliana Rocha","mesa":"3","status":"paga","abre":-215,"fecha":-120,"pedidos":[{"min":-210,"itens":[["Caipirinha de Limão",2],["Batata Frita c/ Cheddar",1]],"bar":7,"cozinha":13},{"min":-160,"itens":[["Caipirinha de Limão",1],["Água Mineral 500ml",1]],"bar":5}]}',
    '{"cliente":"Marcos Vieira","mesa":"6","status":"paga","abre":-205,"fecha":-140,"pedidos":[{"min":-200,"itens":[["Chope Pilsen 350ml",3]],"bar":4},{"min":-175,"itens":[["Chope Pilsen 350ml",3],["Bolinho de Bacalhau",1]],"bar":5,"cozinha":12}]}',
    '{"cliente":"Patrícia Gomes","mesa":"8","status":"paga","abre":-190,"fecha":-95,"garcom":true,"pedidos":[{"min":-185,"itens":[["Gin Tônica",2]],"bar":8},{"min":-140,"itens":[["Negroni",1],["Iscas de Frango",1]],"bar":9,"cozinha":15}]}',
    '{"cliente":"Rodrigo Alves","mesa":null,"status":"paga","abre":-180,"fecha":-130,"pedidos":[{"min":-178,"itens":[["Chope Pilsen 350ml",2]],"bar":3}]}',
    '{"cliente":"Camila Duarte","mesa":"10","status":"paga","abre":-170,"fecha":-80,"pedidos":[{"min":-165,"itens":[["Caipirinha de Limão",2],["Batata Frita c/ Cheddar",1]],"bar":6,"cozinha":14},{"min":-120,"itens":[["Chope Pilsen 350ml",2]],"bar":4}]}',
    '{"cliente":"Felipe Martins","mesa":"11","status":"paga","abre":-160,"fecha":-70,"pedidos":[{"min":-155,"itens":[["IPA Artesanal 500ml",2],["Bolinho de Bacalhau",1]],"bar":5,"cozinha":11},{"min":-110,"itens":[["IPA Artesanal 500ml",1]],"bar":4}]}',
    '{"cliente":"Larissa Freitas","mesa":"5","status":"paga","abre":-150,"fecha":-60,"pedidos":[{"min":-145,"itens":[["Gin Tônica",1],["Refrigerante Lata",1]],"bar":7},{"min":-100,"itens":[["Gin Tônica",1],["Batata Frita c/ Cheddar",1]],"bar":6,"cozinha":13}]}',
    '{"cliente":"Gustavo Pereira","mesa":null,"status":"paga","abre":-140,"fecha":-100,"pedidos":[{"min":-138,"itens":[["Chope Pilsen 350ml",2]],"bar":3}]}',
    '{"cliente":"Beatriz Lopes","mesa":"9","status":"paga","abre":-125,"fecha":-45,"garcom":true,"pedidos":[{"min":-120,"itens":[["Negroni",2],["Iscas de Frango",1]],"bar":9,"cozinha":17},{"min":-80,"itens":[["Água Mineral 500ml",2]],"bar":3}]}',
    '{"cliente":"Thiago Ribeiro","mesa":"7","status":"paga","abre":-110,"fecha":-35,"pedidos":[{"min":-105,"itens":[["Chope Pilsen 350ml",4],["Batata Frita c/ Cheddar",1]],"bar":5,"cozinha":12}]}',
    -- Aguardando pagamento (a primeira já passou dos 20 minutos: vira alerta)
    '{"cliente":"Carla Mendes","mesa":"4","status":"aguardando_pagamento","abre":-130,"fecha":-26,"pedidos":[{"min":-125,"itens":[["IPA Artesanal 500ml",3],["Bolinho de Bacalhau",1]],"bar":6,"cozinha":14},{"min":-70,"itens":[["Refrigerante Lata",1]],"bar":3}]}',
    '{"cliente":"Lucas Barbosa","mesa":"14","status":"aguardando_pagamento","abre":-95,"fecha":-6,"pedidos":[{"min":-90,"itens":[["Caipirinha de Limão",2]],"bar":6}]}',
    -- Abertas (a da Ana Souza tem um pedido parado há 18 minutos no bar)
    '{"cliente":"Ana Souza","mesa":"12","status":"aberta","abre":-85,"pedidos":[{"min":-80,"itens":[["Chope Pilsen 350ml",2],["Caipirinha de Limão",1]],"bar":5},{"min":-18,"itens":[["Chope Pilsen 350ml",2]],"bar":"novo"}]}',
    '{"cliente":"Diego Rocha","mesa":"2","status":"aberta","abre":-75,"pedidos":[{"min":-70,"itens":[["Negroni",2]],"bar":8},{"min":-9,"itens":[["Bolinho de Bacalhau",1]],"cozinha":"em_andamento"}]}',
    '{"cliente":"Elisa Prado","mesa":"15","status":"aberta","abre":-60,"pedidos":[{"min":-55,"itens":[["Gin Tônica",1],["Batata Frita c/ Cheddar",1]],"bar":7,"cozinha":14}]}',
    '{"cliente":"Bruno Lima","mesa":null,"status":"aberta","abre":-40,"pedidos":[{"min":-35,"itens":[["Chope Pilsen 350ml",1]],"bar":3},{"min":-4,"itens":[["Gin Tônica",1]],"bar":"novo"}]}',
    '{"cliente":"Rafaela Costa","mesa":"16","status":"aberta","abre":-30,"pedidos":[{"min":-12,"itens":[["Caipirinha de Limão",2],["Iscas de Frango",1]],"bar":6,"cozinha":"em_andamento"}]}',
    '{"cliente":"Otávio Nunes","mesa":"13","status":"aberta","abre":-20,"pedidos":[{"min":-14,"itens":[["Água Mineral 500ml",1],["Refrigerante Lata",2]],"bar":"novo"}]}',
    -- Esperando liberação (a primeira há 7 minutos: vira alerta)
    '{"cliente":"Fernanda Alves","mesa":"18","status":"aguardando_liberacao","abre":-7}',
    '{"cliente":"Gustavo Reis","mesa":null,"status":"aguardando_liberacao","abre":-2}'
  ]::jsonb[] loop
    v_vez := v_vez + 1;
    perform pg_temp.demo_comanda(v_comanda, v_vez, v_agora, v_atendentes);
  end loop;

  -- As 6 noites anteriores, só comandas pagas: dão o desempenho das
  -- "7 noites" no perfil de cada atendente.
  for v_dia in 1..6 loop
    -- 20h daquela noite, no horário de Brasília.
    v_noite := (date_trunc('day', v_agora at time zone 'America/Sao_Paulo') - make_interval(days => v_dia)
                + interval '20 hours') at time zone 'America/Sao_Paulo';

    for v_k in 1..(5 + (v_dia % 3) * 2) loop
      v_vez := v_vez + 1;
      perform pg_temp.demo_comanda(
        jsonb_build_object(
          'cliente', v_clientes[((v_dia + v_k) % array_length(v_clientes, 1)) + 1],
          'mesa', (v_k + v_dia)::text,
          'status', 'paga',
          'abre', v_k * 25,
          'fecha', v_k * 25 + 90,
          'pedidos', jsonb_build_array(
            jsonb_build_object(
              'min', v_k * 25 + 5,
              'itens', jsonb_build_array(
                jsonb_build_array(v_bebidas[((v_dia * v_k) % array_length(v_bebidas, 1)) + 1], 1 + (v_k % 3)),
                jsonb_build_array(v_comidas[((v_dia + v_k) % array_length(v_comidas, 1)) + 1], 1)
              ),
              'bar', 4 + (v_k % 4),
              'cozinha', 10 + (v_dia % 6)
            ),
            jsonb_build_object(
              'min', v_k * 25 + 50,
              'itens', jsonb_build_array(
                jsonb_build_array(v_bebidas[((v_dia + v_k) % array_length(v_bebidas, 1)) + 1], 1 + (v_dia % 2))
              ),
              'bar', 3 + (v_dia % 4)
            )
          )
        ),
        v_vez,
        v_noite,
        v_atendentes
      );
    end loop;
  end loop;

  alter table comandas enable trigger registrar_responsaveis_comanda;
  alter table pedido_itens enable trigger registrar_item_pronto;
end $$;

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar
--   comandas_hoje = 22 | atendentes_demo = 2 | itens_prontos > 0 |
--   triggers_ligados = 2
-- ---------------------------------------------------------------------
select
  (select count(*) from comandas c join auth.users u on u.id = c.usuario_id
    where u.email like '%@demo.plusparty.invalid' and c.criada_em > now() - interval '5 hours') as comandas_hoje,
  (select count(*) from perfis
    where tipo = 'funcionario' and email like '%@demo.plusparty.invalid') as atendentes_demo,
  (select count(*) from pedido_itens where pronto_por is not null and pronto_em > now() - interval '5 hours') as itens_prontos,
  (select count(*) from pg_trigger
    where tgname in ('registrar_responsaveis_comanda', 'registrar_item_pronto') and tgenabled = 'O') as triggers_ligados;
