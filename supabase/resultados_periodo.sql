-- =====================================================================
-- +party — Resultados do bar por período (tela Resultados do gerente)
-- =====================================================================
-- resultados_periodo(dias) devolve, num JSON só, tudo o que a tela
-- Resultados mostra para os últimos 3, 7, 15 ou 30 dias (até 90), já
-- somado no banco: o app não precisa buscar 30 dias de comandas.
--
-- O "dia" é o dia do bar: vai das 6h às 6h do dia seguinte (horário de
-- Brasília), como no Movimento. O período inclui hoje.
--
-- O que vem no JSON:
--   periodo        dias, de, ate (datas do bar)
--   totais         números do período (abaixo)
--   anterior       os mesmos números no período anterior de mesmo tamanho,
--                  para a tela mostrar "+12% em relação aos 7 dias antes"
--   por_dia        um item por dia (inclusive dias sem movimento):
--                  faturamento, comandas pagas, preparo do bar e da cozinha
--   calor          comandas abertas por dia da semana (0 = domingo) e hora
--   mais_vendidos  top 10 por quantidade (com a receita de cada um)
--   mais_receita   top 10 por receita
--   sem_venda      itens disponíveis do cardápio que não venderam nada
--
-- totais:
--   faturamento, comandas_pagas, ticket_medio        só comandas pagas
--   nao_pagas, valor_nao_pago                        marcadas pelo gerente
--   recusadas, canceladas
--   clientes, clientes_que_voltaram                  voltou = 2 dias ou mais
--   comandas_na_mesa, comandas_no_balcao
--   itens_vendidos
--   faturamento_bar, faturamento_cozinha             bebida × comida
--   minutos_permanencia      da abertura ao fechamento da conta
--   minutos_para_liberar     da chegada até o atendente liberar
--   minutos_para_pagar       do fechamento da conta até o pagamento
--   minutos_preparo_bar / minutos_preparo_cozinha    do pedido até ficar pronto
--   (médias; null quando não há dado no período)
--
-- Não existe aqui (o banco não guarda): custo dos itens, lucro, meta.
--
-- Quem pode chamar: só o gerente, e só do próprio bar.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

-- Dia do bar de um instante (o dia vira às 6h, horário de Brasília).
create or replace function public.dia_do_bar(p_quando timestamptz)
returns date
language sql
immutable
as $$
  select ((p_quando at time zone 'America/Sao_Paulo') - interval '6 hours')::date;
$$;

-- Os números de um intervalo de dias do bar (usado para o período e o anterior).
create or replace function public.totais_resultados(p_bar uuid, p_de date, p_ate date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with comandas_periodo as (
    select c.*
    from comandas c
    where c.estabelecimento_id = p_bar
      and public.dia_do_bar(c.criada_em) between p_de and p_ate
  ),
  -- Comandas que de fato aconteceram (recusada e cancelada nunca abriram).
  atendidas as (
    select * from comandas_periodo where status not in ('recusada', 'cancelada', 'aguardando_liberacao')
  ),
  vendas as (
    select pi.*, p.criado_em as pedido_em, p.comanda_id, c.status as status_comanda, i.setor
    from atendidas c
    join pedidos p on p.comanda_id = c.id
    join pedido_itens pi on pi.pedido_id = p.id
    left join itens i on i.id = pi.item_id
  ),
  valor_comanda as (
    select comanda_id, sum(quantidade * preco_unitario) as valor
    from vendas group by comanda_id
  ),
  preparo as (
    select setor, extract(epoch from (max(pronto_em) - min(pedido_em))) / 60 as minutos
    from vendas
    where pronto_em is not null
    group by pedido_id, setor
  ),
  visitas as (
    select usuario_id, count(distinct public.dia_do_bar(criada_em)) as dias
    from atendidas group by usuario_id
  )
  select jsonb_build_object(
    'faturamento', coalesce((select sum(v.valor) from valor_comanda v
                             join atendidas c on c.id = v.comanda_id where c.status = 'paga'), 0),
    'comandas_pagas', (select count(*) from atendidas where status = 'paga'),
    'ticket_medio', (select round(avg(coalesce(v.valor, 0)), 2) from atendidas c
                     left join valor_comanda v on v.comanda_id = c.id where c.status = 'paga'),
    'nao_pagas', (select count(*) from atendidas where status = 'nao_paga'),
    'valor_nao_pago', coalesce((select sum(v.valor) from valor_comanda v
                                join atendidas c on c.id = v.comanda_id where c.status = 'nao_paga'), 0),
    'recusadas', (select count(*) from comandas_periodo where status = 'recusada'),
    'canceladas', (select count(*) from comandas_periodo where status = 'cancelada'),
    'clientes', (select count(*) from visitas),
    'clientes_que_voltaram', (select count(*) from visitas where dias >= 2),
    'comandas_na_mesa', (select count(*) from atendidas where mesa is not null),
    'comandas_no_balcao', (select count(*) from atendidas where mesa is null),
    'itens_vendidos', coalesce((select sum(quantidade) from vendas), 0),
    'faturamento_bar', coalesce((select sum(quantidade * preco_unitario) from vendas
                                 where status_comanda = 'paga' and setor = 'bar'), 0),
    'faturamento_cozinha', coalesce((select sum(quantidade * preco_unitario) from vendas
                                     where status_comanda = 'paga' and setor = 'cozinha'), 0),
    'minutos_permanencia', (select round(avg(extract(epoch from (fechada_em - criada_em)) / 60))
                            from atendidas where fechada_em is not null),
    'minutos_para_liberar', (select round(avg(extract(epoch from (liberada_em - criada_em)) / 60))
                             from atendidas where liberada_em is not null),
    'minutos_para_pagar', (select round(avg(extract(epoch from (pagamento_em - fechada_em)) / 60))
                           from atendidas where status = 'paga' and pagamento_em is not null
                             and fechada_em is not null),
    'minutos_preparo_bar', (select round(avg(minutos)) from preparo where setor = 'bar'),
    'minutos_preparo_cozinha', (select round(avg(minutos)) from preparo where setor = 'cozinha')
  );
$$;

revoke all on function public.totais_resultados(uuid, date, date) from public, anon, authenticated;

create or replace function public.resultados_periodo(p_dias int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bar  uuid := public.meu_estabelecimento_id();
  dias int := least(greatest(coalesce(p_dias, 7), 1), 90);
  ate  date := public.dia_do_bar(now());
  de   date := ate - (dias - 1);
begin
  if public.meu_tipo() is distinct from 'gerente' or bar is null then
    raise exception 'Só o gerente do bar vê os resultados.';
  end if;

  return (
    with comandas_periodo as (
      select c.* from comandas c
      where c.estabelecimento_id = bar
        and public.dia_do_bar(c.criada_em) between de and ate
        and c.status not in ('recusada', 'cancelada', 'aguardando_liberacao')
    ),
    vendas as (
      select pi.quantidade, pi.preco_unitario, pi.pronto_em, pi.pedido_id, pi.item_id,
             p.criado_em as pedido_em, c.status as status_comanda, c.criada_em as comanda_em,
             i.nome, i.setor
      from comandas_periodo c
      join pedidos p on p.comanda_id = c.id
      join pedido_itens pi on pi.pedido_id = p.id
      left join itens i on i.id = pi.item_id
    ),
    vendidos as (
      select coalesce(nome, 'Item removido') as nome,
             sum(quantidade)::int as quantidade,
             sum(quantidade * preco_unitario) as receita
      from vendas group by 1
    ),
    dias_do_periodo as (
      select generate_series(de, ate, interval '1 day')::date as dia
    ),
    preparo_por_dia as (
      select public.dia_do_bar(comanda_em) as dia, setor,
             round(avg(minutos)) as minutos
      from (
        select comanda_em, setor, pedido_id,
               extract(epoch from (max(pronto_em) - min(pedido_em))) / 60 as minutos
        from vendas where pronto_em is not null
        group by comanda_em, setor, pedido_id
      ) x
      group by 1, 2
    )
    select jsonb_build_object(
      'periodo', jsonb_build_object('dias', dias, 'de', de, 'ate', ate),
      'totais', public.totais_resultados(bar, de, ate),
      'anterior', public.totais_resultados(bar, de - dias, de - 1),
      'por_dia', (
        select jsonb_agg(jsonb_build_object(
                 'dia', d.dia,
                 'faturamento', coalesce((select sum(quantidade * preco_unitario) from vendas
                                          where status_comanda = 'paga'
                                            and public.dia_do_bar(comanda_em) = d.dia), 0),
                 'comandas_pagas', (select count(*) from comandas_periodo
                                    where status = 'paga' and public.dia_do_bar(criada_em) = d.dia),
                 'minutos_preparo_bar', (select minutos from preparo_por_dia p
                                         where p.dia = d.dia and p.setor = 'bar'),
                 'minutos_preparo_cozinha', (select minutos from preparo_por_dia p
                                             where p.dia = d.dia and p.setor = 'cozinha'))
               order by d.dia)
        from dias_do_periodo d
      ),
      'calor', coalesce((
        select jsonb_agg(jsonb_build_object('dia_semana', dia_semana, 'hora', hora, 'comandas', total)
                         order by dia_semana, hora)
        from (
          select extract(dow from criada_em at time zone 'America/Sao_Paulo')::int as dia_semana,
                 extract(hour from criada_em at time zone 'America/Sao_Paulo')::int as hora,
                 count(*) as total
          from comandas_periodo
          group by 1, 2
        ) c
      ), '[]'::jsonb),
      'mais_vendidos', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade, 'receita', receita))
        from (select * from vendidos order by quantidade desc, receita desc, nome limit 10) v
      ), '[]'::jsonb),
      'mais_receita', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', quantidade, 'receita', receita))
        from (select * from vendidos order by receita desc, quantidade desc, nome limit 10) v
      ), '[]'::jsonb),
      'sem_venda', coalesce((
        select jsonb_agg(jsonb_build_object('nome', i.nome, 'categoria', i.categoria) order by i.nome)
        from itens i
        where i.estabelecimento_id = bar
          and i.disponivel
          and not exists (select 1 from vendas v where v.item_id = i.id)
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.resultados_periodo(int) from public, anon;
grant execute on function public.resultados_periodo(int) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar 3
-- ---------------------------------------------------------------------
select count(distinct proname) as funcoes_3
from pg_proc
where proname in ('dia_do_bar', 'totais_resultados', 'resultados_periodo');
