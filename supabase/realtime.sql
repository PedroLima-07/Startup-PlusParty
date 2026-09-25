-- =====================================================================
-- +party — Atualização em tempo real
-- =====================================================================
-- Faz o Supabase avisar o app quando comandas e itens de pedido mudam,
-- para as telas do cliente e do atendente se atualizarem sozinhas.
-- O RLS continua valendo: cada um só recebe aviso das linhas que pode ver.
--
-- Como aplicar: SQL Editor → colar → Run. Pode rodar de novo sem problema.
-- =====================================================================

do $$
declare
  tabela text;
begin
  foreach tabela in array array['comandas', 'pedido_itens'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabela);
    end if;
  end loop;
end $$;

-- Conferência: deve listar comandas e pedido_itens.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public';
