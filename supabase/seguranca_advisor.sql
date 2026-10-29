-- =====================================================================
-- +party — Ajustes pedidos pelo Security Advisor do Supabase
-- =====================================================================
-- O Advisor (Advisors → Security Advisor) mostrava avisos de três tipos.
-- Este script corrige os dois primeiros e reduz o terceiro ao que é de
-- propósito.
--
-- 1. "Function Search Path Mutable"
--    Funções sem search_path fixo (em_reais, normalizar_mesa, dia_do_bar).
--    Sem ele, alguém que conseguisse criar um objeto com o mesmo nome em
--    outro schema poderia trocar o que a função usa. Aqui toda função nossa
--    do schema public passa a usar só `public`.
--
-- 2. "Public Can Execute SECURITY DEFINER Function" em funções de trigger
--    (avisar_evento_cancelado, pedir_avaliacao, notificar_*...). Elas só
--    rodam pelos triggers, que não precisam dessa permissão. Tirar a
--    permissão impede que alguém chame direto pela API.
--
-- 3. Funções SECURITY DEFINER que visitantes (anon) podiam chamar sem
--    precisar. Só ficam abertas para visitantes as que o app usa sem login:
--      agenda_do_bar, avaliacoes_do_bar, bares_com_evento_hoje,
--      lotacao_estabelecimentos
--    e as que as regras de segurança (RLS) usam por dentro:
--      meu_tipo, meu_estabelecimento_id, sou_staff
--    Quem estava logado continua podendo chamar o que já chamava.
--
-- Os avisos que continuam depois disso são esperados: são as funções do app
-- (avaliar, marcar_interesse, resultados_periodo...) que o usuário logado
-- precisa chamar. Cada uma confere dentro dela quem pode fazer o quê.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- Depois, no Security Advisor, clique em "Rerun linter".
-- =====================================================================

do $$
declare
  f record;
  abertas_para_visitante text[] := array[
    'agenda_do_bar', 'avaliacoes_do_bar', 'bares_com_evento_hoje', 'lotacao_estabelecimentos',
    'meu_tipo', 'meu_estabelecimento_id', 'sou_staff'
  ];
  logado_podia boolean;
begin
  for f in
    select p.oid, p.proname, p.prosecdef, p.prorettype = 'trigger'::regtype as de_trigger,
           p.oid::regprocedure::text as assinatura,
           coalesce(array_to_string(p.proconfig, ','), '') like '%search_path%' as tem_search_path
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      -- Só as nossas: funções que vêm de extensões ficam como estão.
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    -- 1. search_path fixo
    if not f.tem_search_path then
      execute format('alter function %s set search_path = public', f.assinatura);
    end if;

    -- 2. Função de trigger: ninguém chama direto.
    if f.de_trigger then
      execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);

    -- 3. SECURITY DEFINER que o visitante não precisa.
    elsif f.prosecdef and not (f.proname = any (abertas_para_visitante)) then
      logado_podia := has_function_privilege('authenticated', f.oid, 'execute');
      execute format('revoke all on function %s from public, anon', f.assinatura);
      if logado_podia then
        execute format('grant execute on function %s to authenticated', f.assinatura);
      end if;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar
--   sem_search_path = 0 | triggers_abertos = 0 | definer_para_visitante = 7
--   (as 7 da lista do item 3; menos, se alguma delas não existir no banco)
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path%') as sem_search_path,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))) as triggers_abertos,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute')) as definer_para_visitante;
