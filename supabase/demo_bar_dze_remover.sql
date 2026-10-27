-- =====================================================================
-- +party — Apaga a noite de demonstração do Bar D'Zé
-- =====================================================================
-- Remove tudo o que supabase/demo_bar_dze.sql criou: os clientes e
-- atendentes de demonstração (e-mails @demo.plusparty.invalid), as
-- comandas, os pedidos, os chamados de garçom, as avaliações, a fila e os
-- eventos de demonstração. Os dados de verdade (contas reais, cardápio,
-- postagens, eventos do gerente) não são tocados.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- A última consulta deve mostrar: sobrou = 0
-- =====================================================================

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

-- Avaliações, pedidos de avaliação e a fila saem junto (on delete cascade).
delete from comandas
where usuario_id in (select id from auth.users where email like '%@demo.plusparty.invalid');

-- Eventos de demonstração: marcados com a data de criação 01/01/2000.
do $$
begin
  if to_regclass('public.eventos') is not null then
    execute $q$delete from eventos where criado_em = '2000-01-01 00:00:00+00'$q$;
  end if;
end $$;

delete from solicitacoes_equipe
where usuario_id in (select id from auth.users where email like '%@demo.plusparty.invalid');

delete from perfis
where id in (select id from auth.users where email like '%@demo.plusparty.invalid');

delete from auth.users where email like '%@demo.plusparty.invalid';

select count(*) as sobrou from auth.users where email like '%@demo.plusparty.invalid';
