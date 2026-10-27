-- =====================================================================
-- +party — Demonstração do Bar D'Zé: a noite de hoje e os últimos 30 dias
-- =====================================================================
-- Cria movimento para apresentar o app: clientes, comandas, pedidos e
-- quem da equipe preparou, liberou e recebeu cada um. Os horários são
-- contados a partir da hora em que o script roda, então o painel mostra
-- tudo como "a noite de hoje" e os dias anteriores.
--
-- O que aparece depois de rodar (entrando como gerente do Bar D'Zé):
--   - Movimento: 6 comandas abertas, 12 pagas, 2 aguardando pagamento,
--     2 esperando liberação, faturamento e ticket médio;
--   - "Precisa de atenção": pagamento atrasado, pedido parado e cliente
--     esperando liberação;
--   - Resultados: 30 dias com sexta e sábado cheios, dias fracos no meio
--     da semana, clientes que voltam, mais vendidos e tempo de preparo;
--   - Avaliações: notas e comentários das últimas semanas, alguns já
--     respondidos;
--   - Agenda: roda de samba toda sexta, um show hoje e um quiz na terça,
--     com clientes interessados;
--   - Equipe: 2 atendentes de demonstração (Ana Lima e Rafael Menezes);
--   - Atendente:
--       * Gustavo Reis, esperando liberação, já saiu sem pagar uma vez;
--       * Paulo Henrique está na fila da mesa 4: ao confirmar o pagamento
--         da Carla Mendes (mesa 4), a comanda dele abre sozinha.
--
-- Os clientes e atendentes de demonstração usam e-mails terminados em
-- @demo.plusparty.invalid e não têm senha: ninguém entra com eles, e
-- nenhum e-mail é enviado. Rodar de novo apaga a demonstração anterior e
-- cria outra, com os horários de agora. Para só apagar, use
-- supabase/demo_bar_dze_remover.sql.
--
-- Precisa de comanda_regras.sql aplicado (status 'nao_paga' e 'cancelada').
-- Avaliações, fila e agenda só entram se avaliacoes.sql, mesa_fila.sql e
-- agenda_eventos.sql já estiverem aplicados; sem eles, essa parte é pulada.
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

-- Avaliações, pedidos de avaliação e a fila saem junto com as comandas e
-- os perfis (on delete cascade).
delete from comandas
where usuario_id in (select id from auth.users where email like '%@demo.plusparty.invalid');

delete from solicitacoes_equipe
where usuario_id in (select id from auth.users where email like '%@demo.plusparty.invalid');

-- Eventos de demonstração: marcados com a data de criação 01/01/2000.
do $$
begin
  if to_regclass('public.eventos') is not null then
    execute $q$delete from eventos where criado_em = '2000-01-01 00:00:00+00'$q$;
  end if;
end $$;

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
-- Devolve o id da comanda.
create or replace function pg_temp.demo_comanda(
  p jsonb,
  p_vez int,
  p_base timestamptz,
  p_atendentes uuid[]
)
returns uuid
language plpgsql
as $$
declare
  v_bar constant uuid := '11111111-1111-1111-1111-111111111111';
  v_status text := p ->> 'status';
  v_abre timestamptz := p_base + make_interval(mins => (p ->> 'abre')::int);
  v_fecha timestamptz;
  v_equipe int := coalesce(array_length(p_atendentes, 1), 0);
  v_atendente uuid;
  v_liberada boolean := v_status not in ('aguardando_liberacao', 'recusada', 'cancelada');
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
    case when v_liberada then v_atendente end,
    case when v_liberada then v_abre + interval '2 minutes' end,
    case when v_status = 'paga' then v_atendente end,
    case when v_status = 'paga' then v_fecha + make_interval(mins => 2 + (p_vez % 4)) end
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

  -- Alguns clientes chamaram o garçom (aparece no Resumo da noite). A
  -- situação fica com o valor padrão da tabela: os valores aceitos em
  -- alertas.status foram definidos no painel e variam entre bancos. Se o
  -- banco recusar mesmo assim, o chamado é só pulado: é um detalhe.
  if (p ->> 'garcom')::boolean then
    begin
      insert into alertas (comanda_id, tipo, criado_em)
      values (v_comanda, 'chamar_garcom', v_abre + interval '30 minutes');
    exception
      when check_violation or not_null_violation then
        null;
    end;
  end if;

  return v_comanda;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. A demonstração
-- ---------------------------------------------------------------------
do $$
declare
  v_bar constant uuid := '11111111-1111-1111-1111-111111111111';
  v_agora constant timestamptz := now();
  v_hoje constant date := (v_agora at time zone 'America/Sao_Paulo')::date;
  v_marca constant timestamptz := '2000-01-01 00:00:00+00';
  v_atendentes uuid[];
  v_id uuid;
  v_vez int := 0;
  v_comanda jsonb;
  v_dia int;
  v_k int;
  v_n int;
  v_semana int;
  v_status text;
  v_abre int;
  v_noite timestamptz;
  v_cliente text;
  v_comanda_id uuid;
  v_nota int;
  v_bebidas constant text[] := array['Chope Pilsen 350ml', 'Caipirinha de Limão', 'IPA Artesanal 500ml', 'Gin Tônica', 'Negroni', 'Chope Pilsen 350ml'];
  v_comidas constant text[] := array['Batata Frita c/ Cheddar', 'Bolinho de Bacalhau', 'Iscas de Frango'];
  -- Os 10 primeiros são frequentadores: aparecem em várias noites.
  v_clientes constant text[] := array[
    'Isabela Nunes', 'Henrique Dias', 'Juliana Rocha', 'Marcos Vieira', 'Patrícia Gomes',
    'Rodrigo Alves', 'Camila Duarte', 'Felipe Martins', 'Larissa Freitas', 'Gustavo Pereira',
    'Aline Castro', 'Bernardo Melo', 'Cíntia Ramos', 'Daniel Azevedo', 'Eduarda Pinto',
    'Fábio Teixeira', 'Gabriela Moura', 'Hugo Fernandes', 'Ingrid Santana', 'João Victor Lima',
    'Karen Oliveira', 'Leonardo Souza', 'Mariana Batista', 'Nicolas Andrade', 'Olívia Cardoso',
    'Pedro Augusto', 'Queila Barros', 'Renan Moreira', 'Sabrina Costa', 'Tiago Rezende'
  ];
  v_notas constant int[] := array[5, 4, 5, 5, 3, 4, 5, 2, 4, 5, 5, 4];
  v_comentarios constant text[] := array[
    'Chope gelado e atendimento rápido. Volto sexta!',
    null,
    'A roda de samba é o melhor da semana.',
    'Pedir pelo celular salvou a noite, sem fila no balcão.',
    'Bom, mas a batata demorou um pouco.',
    null,
    'Negroni no ponto. Equipe muito atenciosa.',
    'Demorou para liberar a comanda e o bolinho veio frio.',
    'Lugar animado, preço justo.',
    null,
    'Melhor bar do bairro para ver o jogo.',
    'Gostei, só achei a música alta.'
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

  -- ----------------------------------------------------------- hoje
  -- Do mais antigo para o mais recente.
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
    -- Aguardando pagamento (a da Carla já passou dos 30 minutos: vira alerta)
    '{"cliente":"Carla Mendes","mesa":"4","status":"aguardando_pagamento","abre":-130,"fecha":-34,"pedidos":[{"min":-125,"itens":[["IPA Artesanal 500ml",3],["Bolinho de Bacalhau",1]],"bar":6,"cozinha":14},{"min":-70,"itens":[["Refrigerante Lata",1]],"bar":3}]}',
    '{"cliente":"Lucas Barbosa","mesa":"14","status":"aguardando_pagamento","abre":-95,"fecha":-6,"pedidos":[{"min":-90,"itens":[["Caipirinha de Limão",2]],"bar":6}]}',
    -- Abertas (a da Ana Souza tem um pedido parado há 18 minutos no bar)
    '{"cliente":"Ana Souza","mesa":"12","status":"aberta","abre":-85,"pedidos":[{"min":-80,"itens":[["Chope Pilsen 350ml",2],["Caipirinha de Limão",1]],"bar":5},{"min":-18,"itens":[["Chope Pilsen 350ml",2]],"bar":"novo"}]}',
    '{"cliente":"Diego Rocha","mesa":"2","status":"aberta","abre":-75,"pedidos":[{"min":-70,"itens":[["Negroni",2]],"bar":8},{"min":-9,"itens":[["Bolinho de Bacalhau",1]],"cozinha":"em_andamento"}]}',
    '{"cliente":"Elisa Prado","mesa":"15","status":"aberta","abre":-60,"pedidos":[{"min":-55,"itens":[["Gin Tônica",1],["Batata Frita c/ Cheddar",1]],"bar":7,"cozinha":14}]}',
    '{"cliente":"Bruno Lima","mesa":null,"status":"aberta","abre":-40,"pedidos":[{"min":-35,"itens":[["Chope Pilsen 350ml",1]],"bar":3},{"min":-4,"itens":[["Gin Tônica",1]],"bar":"novo"}]}',
    '{"cliente":"Rafaela Costa","mesa":"16","status":"aberta","abre":-30,"pedidos":[{"min":-12,"itens":[["Caipirinha de Limão",2],["Iscas de Frango",1]],"bar":6,"cozinha":"em_andamento"}]}',
    '{"cliente":"Otávio Nunes","mesa":"13","status":"aberta","abre":-20,"pedidos":[{"min":-14,"itens":[["Água Mineral 500ml",1],["Refrigerante Lata",2]],"bar":"novo"}]}',
    -- Esperando liberação (a da Fernanda há 7 minutos: vira alerta; o
    -- Gustavo Reis já saiu sem pagar uma vez, veja abaixo)
    '{"cliente":"Fernanda Alves","mesa":"18","status":"aguardando_liberacao","abre":-7}',
    '{"cliente":"Gustavo Reis","mesa":null,"status":"aguardando_liberacao","abre":-2}'
  ]::jsonb[] loop
    v_vez := v_vez + 1;
    perform pg_temp.demo_comanda(v_comanda, v_vez, v_agora, v_atendentes);
  end loop;

  -- --------------------------------------------- os 29 dias anteriores
  -- Sexta e sábado cheios, domingo e quinta médios, o resto fraco. As
  -- comandas se espalham das 19h à 1h para o mapa de calor.
  for v_dia in 1..29 loop
    v_noite := ((v_hoje - v_dia) + time '20:00') at time zone 'America/Sao_Paulo';
    v_semana := extract(dow from v_hoje - v_dia)::int;
    v_n := case
      when v_semana in (5, 6) then 12 + (v_dia % 5)
      when v_semana in (0, 4) then 7 + (v_dia % 3)
      else 3 + (v_dia % 3)
    end;

    for v_k in 1..v_n loop
      v_vez := v_vez + 1;
      v_abre := -60 + (v_k - 1) * (330 / v_n) + (v_dia % 7);
      v_cliente := v_clientes[((v_dia * 7 + v_k * 3) % array_length(v_clientes, 1)) + 1];
      v_status := 'paga';

      -- Um ou outro pedido recusado ou cancelado, para os números da tela.
      if v_k = v_n and v_dia % 6 = 0 then
        v_status := 'recusada';
      elsif v_k = v_n and v_dia % 9 = 0 then
        v_status := 'cancelada';
      end if;

      -- A conta que ficou sem pagar (4 dias atrás): o Gustavo Reis.
      if v_dia = 4 and v_k = 2 then
        v_status := 'nao_paga';
        v_cliente := 'Gustavo Reis';
      end if;

      if v_status in ('recusada', 'cancelada') then
        perform pg_temp.demo_comanda(
          jsonb_build_object('cliente', v_cliente, 'mesa', (v_k + v_dia % 9)::text,
                             'status', v_status, 'abre', v_abre),
          v_vez, v_noite, v_atendentes);
        continue;
      end if;

      v_comanda_id := pg_temp.demo_comanda(
        jsonb_build_object(
          'cliente', v_cliente,
          'mesa', case when v_k % 5 = 0 then null else (1 + (v_k + v_dia) % 18)::text end,
          'status', v_status,
          'abre', v_abre,
          'fecha', v_abre + 60 + (v_k * 13 + v_dia * 7) % 70,
          'pedidos', jsonb_build_array(
            jsonb_build_object(
              'min', v_abre + 5,
              'itens', jsonb_build_array(
                jsonb_build_array(v_bebidas[((v_dia * v_k) % array_length(v_bebidas, 1)) + 1], 1 + (v_k % 3)),
                jsonb_build_array(v_comidas[((v_dia + v_k) % array_length(v_comidas, 1)) + 1], 1)
              ),
              'bar', 3 + ((v_k + v_dia) % 5) + case when v_semana in (5, 6) then 2 else 0 end,
              'cozinha', 9 + ((v_dia + v_k) % 7) + case when v_semana in (5, 6) then 3 else 0 end
            ),
            jsonb_build_object(
              'min', v_abre + 45,
              'itens', jsonb_build_array(
                jsonb_build_array(v_bebidas[((v_dia + v_k * 2) % array_length(v_bebidas, 1)) + 1], 1 + (v_dia % 2))
              ),
              'bar', 3 + (v_dia % 4)
            )
          )
        ),
        v_vez, v_noite, v_atendentes);

      -- Avaliação em mais ou menos uma de cada três comandas pagas, no dia
      -- seguinte; as notas baixas e algumas boas já têm resposta do bar.
      if v_status = 'paga' and v_k % 3 = 0 and to_regclass('public.avaliacoes') is not null then
        v_nota := v_notas[((v_dia + v_k) % array_length(v_notas, 1)) + 1];
        execute $q$
          insert into avaliacoes (comanda_id, usuario_id, estabelecimento_id, nota, comentario,
                                  criada_em, resposta, respondida_em)
          select c.id, c.usuario_id, c.estabelecimento_id, $2, $3,
                 c.fechada_em + interval '14 hours',
                 case when $2 <= 3 then 'Obrigado pelo retorno! Já conversamos com a equipe da cozinha para melhorar.'
                      when $4 then 'Valeu demais, volte sempre!' end,
                 case when $2 <= 3 or $4 then c.fechada_em + interval '20 hours' end
          from comandas c where c.id = $1
        $q$ using v_comanda_id, v_nota,
                  v_comentarios[((v_dia * 3 + v_k) % array_length(v_comentarios, 1)) + 1],
                  (v_dia % 4 = 0);
      end if;
    end loop;
  end loop;

  -- A conta não paga foi marcada pelo gerente 40 minutos depois de fechar.
  if exists (select 1 from information_schema.columns
             where table_name = 'comandas' and column_name = 'nao_paga_em') then
    execute $q$
      update comandas c set nao_paga_em = c.fechada_em + interval '40 minutes'
      from auth.users u
      where u.id = c.usuario_id and u.email like '%@demo.plusparty.invalid'
        and c.status = 'nao_paga' and c.nao_paga_em is null
    $q$;
  end if;

  -- ------------------------------------------------- fila da mesa 4
  -- A Carla (mesa 4) fechou a conta e ainda não pagou. Ao confirmar o
  -- pagamento dela, a comanda do Paulo abre sozinha (veio da fila).
  if to_regclass('public.fila_mesa') is not null then
    execute $q$
      insert into fila_mesa (estabelecimento_id, mesa, usuario_id, criada_em)
      values ($1, '4', $2, $3)
    $q$ using v_bar, pg_temp.demo_usuario('Paulo Henrique'), v_agora - interval '3 minutes';
  end if;

  -- --------------------------------------------------------- agenda
  -- Marcados com criado_em = 01/01/2000 para a próxima execução apagar.
  if to_regclass('public.eventos') is not null then
    alter table eventos disable trigger preparar_evento;

    execute $q$
      with novos as (
        insert into eventos (estabelecimento_id, titulo, descricao, inicio, fim, entrada,
                             repete_semanal, criado_em)
        values
          -- Toda sexta, 20h (começou há 6 semanas).
          ($1, 'Roda de samba', 'Samba de raiz com o Grupo Batuque D''Zé. Chope em dobro até as 21h.',
           ((date_trunc('week', $2::date)::date + 4 - 42) + time '20:00') at time zone 'America/Sao_Paulo',
           ((date_trunc('week', $2::date)::date + 4 - 42) + time '23:30') at time zone 'America/Sao_Paulo',
           null, true, $3),
          -- Hoje, daqui a 3 horas: "Evento hoje" e lembrete para os interessados.
          ($1, 'Show acústico: voz e violão', 'MPB e pop rock com a Lia Duarte.',
           date_trunc('minute', $4 + interval '3 hours'),
           date_trunc('minute', $4 + interval '5 hours'),
           15, false, $3),
          -- Próxima terça, 21h.
          ($1, 'Quiz de bar', 'Times de até 4 pessoas. O vencedor leva uma rodada de chope.',
           ((date_trunc('week', $2::date)::date + 8) + time '21:00') at time zone 'America/Sao_Paulo',
           ((date_trunc('week', $2::date)::date + 8) + time '23:00') at time zone 'America/Sao_Paulo',
           null, false, $3)
        returning id, titulo
      )
      insert into eventos_interesses (evento_id, usuario_id)
      select n.id, pg_temp.demo_usuario(nome)
      from novos n
      join (values
        ('Roda de samba', 'Isabela Nunes'), ('Roda de samba', 'Juliana Rocha'),
        ('Roda de samba', 'Marcos Vieira'), ('Roda de samba', 'Camila Duarte'),
        ('Roda de samba', 'Felipe Martins'), ('Roda de samba', 'Aline Castro'),
        ('Roda de samba', 'Gabriela Moura'), ('Roda de samba', 'Leonardo Souza'),
        ('Show acústico: voz e violão', 'Patrícia Gomes'), ('Show acústico: voz e violão', 'Ana Souza'),
        ('Show acústico: voz e violão', 'Elisa Prado'), ('Show acústico: voz e violão', 'Hugo Fernandes'),
        ('Show acústico: voz e violão', 'Larissa Freitas'),
        ('Quiz de bar', 'Henrique Dias'), ('Quiz de bar', 'Daniel Azevedo'), ('Quiz de bar', 'Rodrigo Alves')
      ) as i(titulo, nome) on i.titulo = n.titulo
    $q$ using v_bar, v_hoje, v_marca, v_agora;

    alter table eventos enable trigger preparar_evento;
  end if;

  alter table comandas enable trigger registrar_responsaveis_comanda;
  alter table pedido_itens enable trigger registrar_item_pronto;
end $$;

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar
--   comandas_hoje = 22 | comandas_30_dias > 200 | atendentes_demo = 2 |
--   nao_pagas = 1 | avaliacoes > 0 | eventos = 3 | na_fila = 1 |
--   triggers_ligados = 2
-- (avaliacoes, eventos e na_fila ficam 0 se o script daquela parte ainda
-- não foi aplicado)
-- ---------------------------------------------------------------------
create or replace function pg_temp.demo_contar(p_tabela text, p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_total bigint;
begin
  if to_regclass('public.' || p_tabela) is null then
    return 0;
  end if;
  execute p_sql into v_total;
  return v_total;
end;
$$;

select
  (select count(*) from comandas c join auth.users u on u.id = c.usuario_id
    where u.email like '%@demo.plusparty.invalid' and c.criada_em > now() - interval '5 hours') as comandas_hoje,
  (select count(*) from comandas c join auth.users u on u.id = c.usuario_id
    where u.email like '%@demo.plusparty.invalid') as comandas_30_dias,
  (select count(*) from perfis
    where tipo = 'funcionario' and email like '%@demo.plusparty.invalid') as atendentes_demo,
  (select count(*) from comandas c join auth.users u on u.id = c.usuario_id
    where u.email like '%@demo.plusparty.invalid' and c.status = 'nao_paga') as nao_pagas,
  pg_temp.demo_contar('avaliacoes', $q$
    select count(*) from avaliacoes a join auth.users u on u.id = a.usuario_id
    where u.email like '%@demo.plusparty.invalid'$q$) as avaliacoes,
  pg_temp.demo_contar('eventos', $q$
    select count(*) from eventos where criado_em = '2000-01-01 00:00:00+00'$q$) as eventos,
  pg_temp.demo_contar('fila_mesa', $q$
    select count(*) from fila_mesa f join auth.users u on u.id = f.usuario_id
    where u.email like '%@demo.plusparty.invalid' and f.situacao = 'esperando'$q$) as na_fila,
  (select count(*) from pg_trigger
    where tgname in ('registrar_responsaveis_comanda', 'registrar_item_pronto') and tgenabled = 'O') as triggers_ligados;
