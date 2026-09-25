-- =====================================================================
-- +party — Proteções de regra de negócio no banco
-- =====================================================================
-- O RLS decide QUEM pode mexer em cada linha. Estes triggers decidem O QUE
-- pode ser mudado, porque o RLS sozinho deixava o cliente, pela API:
--   1. se liberar sozinho ou marcar a própria comanda como paga
--   2. abrir uma comanda já "aberta", pulando a liberação
--   3. mudar o próprio tipo para gerente (ou trocar de estabelecimento)
--   4. se cadastrar já como gerente, passando tipo no signUp()
--   5. pedir um item pagando o preço que quiser (preco_unitario vinha do app)
--
-- Chamadas sem usuário logado (auth.uid() nulo), como o SQL Editor do
-- painel, passam direto: é assim que a equipe corrige dados e promove
-- funcionários. Pelo app, anônimo nem chega aqui, o RLS já barra antes.
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 e 2. comandas: só as transições de status permitidas
-- ---------------------------------------------------------------------
--   aguardando_liberacao → aberta                 (staff: libera)
--   aberta               → aguardando_pagamento   (dono ou staff: fecha a conta)
--   aguardando_pagamento → paga                   (staff: confirma o pagamento)

create or replace function public.validar_comanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_do_local boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'aguardando_liberacao';
    new.fechada_em := null;
    return new;
  end if;

  if new.usuario_id <> old.usuario_id or new.estabelecimento_id <> old.estabelecimento_id then
    raise exception 'Não é permitido mudar o dono ou o estabelecimento da comanda.';
  end if;

  if new.status = old.status then
    return new;
  end if;

  staff_do_local := public.sou_staff() and old.estabelecimento_id = public.meu_estabelecimento_id();

  if old.status = 'aguardando_liberacao' and new.status = 'aberta' and staff_do_local then
    return new;
  end if;

  if old.status = 'aberta' and new.status = 'aguardando_pagamento' then
    return new;
  end if;

  if old.status = 'aguardando_pagamento' and new.status = 'paga' and staff_do_local then
    return new;
  end if;

  raise exception 'Mudança de status não permitida: % → %.', old.status, new.status;
end;
$$;

drop trigger if exists validar_comanda on comandas;
create trigger validar_comanda
  before insert or update on comandas
  for each row execute function public.validar_comanda();

-- ---------------------------------------------------------------------
-- 3. perfis: tipo e estabelecimento só mudam pelo painel
-- ---------------------------------------------------------------------
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.tipo is distinct from old.tipo
     or new.estabelecimento_id is distinct from old.estabelecimento_id then
    raise exception 'Tipo e estabelecimento do perfil só podem ser alterados pela equipe.';
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_perfil on perfis;
create trigger proteger_perfil
  before update on perfis
  for each row execute function public.proteger_perfil();

-- ---------------------------------------------------------------------
-- 4. cadastro: todo mundo nasce cliente
-- ---------------------------------------------------------------------
-- Substitui a versão de trigger_criar_perfil.sql, que lia tipo e
-- estabelecimento_id do que o próprio usuário mandava no signUp().
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
    'cliente',
    null
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. pedido_itens: preço e status definidos pelo banco
-- ---------------------------------------------------------------------
create or replace function public.preparar_pedido_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  select preco into new.preco_unitario
  from itens
  where id = new.item_id;

  if new.preco_unitario is null then
    raise exception 'Item do cardápio não encontrado.';
  end if;

  new.status := 'novo';
  return new;
end;
$$;

drop trigger if exists preparar_pedido_item on pedido_itens;
create trigger preparar_pedido_item
  before insert on pedido_itens
  for each row execute function public.preparar_pedido_item();
