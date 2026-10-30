-- =====================================================================
-- +party — "Excluir minha conta" (direito do titular, LGPD art. 18)
-- =====================================================================
-- O cliente apaga a própria conta pelo app. O que acontece:
--
--   Apagado: notificações, interesses em eventos, lugar na fila de mesa e
--   pedidos de avaliação pendentes.
--
--   Anonimizado (fica sem nada que identifique a pessoa): o perfil passa a se
--   chamar "Conta excluída", sem telefone e sem foto, e o login deixa de
--   existir (e-mail trocado por um endereço inválido, senha apagada, conta
--   bloqueada). As comandas, os pedidos e as avaliações continuam, porque são
--   o histórico de vendas do bar; nelas aparece só "Conta excluída".
--   (É o que a Política de Privacidade promete: "apagamos ou anonimizamos".)
--
-- Regras:
--   - só para clientes: conta da equipe de um bar sai pelo gerente (remover
--     da equipe) antes;
--   - não exclui com comanda em andamento (esperando liberação, aberta ou
--     esperando pagamento): primeiro a conta do bar precisa ser fechada.
--
-- A foto de perfil o app apaga do Storage antes de chamar a função.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  eu uuid := auth.uid();
  perfil record;
begin
  if eu is null then
    raise exception 'Entre na sua conta para excluí-la.';
  end if;

  select tipo into perfil from perfis where id = eu;
  if perfil.tipo is distinct from 'cliente' then
    raise exception 'Contas da equipe de um bar não são excluídas por aqui. Peça ao gerente para remover você da equipe primeiro.';
  end if;

  if exists (
    select 1 from comandas
    where usuario_id = eu and status in ('aguardando_liberacao', 'aberta', 'aguardando_pagamento')
  ) then
    raise exception 'Você tem uma comanda em andamento. Feche a conta no bar antes de excluir a sua conta.';
  end if;

  -- Apagado
  delete from notificacoes where usuario_id = eu;
  if to_regclass('public.eventos_interesses') is not null then
    delete from eventos_interesses where usuario_id = eu;
  end if;
  if to_regclass('public.fila_mesa') is not null then
    delete from fila_mesa where usuario_id = eu;
  end if;
  if to_regclass('public.avaliacoes_pedidas') is not null then
    delete from avaliacoes_pedidas where usuario_id = eu;
  end if;

  -- Anonimizado: o perfil fica, sem dados pessoais (o histórico do bar aponta para ele).
  update perfis
  set nome = 'Conta excluída',
      email = 'excluida-' || eu || '@removida.invalid',
      telefone = null
  where id = eu;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'perfis' and column_name = 'foto_url') then
    execute 'update perfis set foto_url = null where id = $1' using eu;
  end if;

  -- O login deixa de existir: sem e-mail, sem senha, bloqueado e sem sessões abertas.
  update auth.users
  set email = 'excluida-' || eu || '@removida.invalid',
      encrypted_password = '',
      raw_user_meta_data = '{}'::jsonb,
      phone = null,
      banned_until = '2999-12-31'
  where id = eu;
  delete from auth.identities where user_id = eu;
  delete from auth.sessions where user_id = eu;
end;
$$;

revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar  funcao = 1 | so_logado = true
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_proc where proname = 'excluir_minha_conta') as funcao,
  (not has_function_privilege('anon', 'public.excluir_minha_conta()', 'execute')) as so_logado;
