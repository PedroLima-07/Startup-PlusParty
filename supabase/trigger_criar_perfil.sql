-- =====================================================================
-- +party — Trigger: cria o perfil automaticamente no cadastro
-- =====================================================================
-- Problema que isso resolve: supabase.auth.signUp() cria o usuário em
-- auth.users, mas não cria a linha em perfis. Se o insert em perfis for
-- feito pelo cliente (front-end) logo após o signUp(), ele depende de
-- auth.uid() já estar disponível — o que só acontece se houver sessão
-- ativa. Com "Confirm email" ativado, não há sessão até o usuário
-- clicar no link do e-mail, e o insert é barrado pelo RLS.
--
-- Este trigger roda no banco, como SECURITY DEFINER (dono da tabela),
-- então ignora RLS e funciona em qualquer configuração de confirmação
-- de e-mail.
--
-- Como aplicar: SQL Editor do Supabase → colar → Run.
-- =====================================================================

create or replace function public.lidar_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email, tipo, estabelecimento_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    new.email,
    -- Nunca ler tipo/estabelecimento do signUp(): o próprio usuário controla
    -- esses metadados e poderia se cadastrar como gerente. Funcionários são
    -- promovidos pela equipe no painel (ver seed_novo_bar.sql).
    'cliente',
    null
  );
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.lidar_novo_usuario();

-- ---------------------------------------------------------------------
-- Como usar no front-end (quem for fazer o cadastro):
--
-- await supabase.auth.signUp({
--   email,
--   password,
--   options: { data: { nome } },
-- });
--
-- Não é mais necessário inserir em "perfis" manualmente depois do
-- signUp() — o trigger já faz isso.
-- ---------------------------------------------------------------------
