-- =====================================================================
-- +party — Regras de gravação de pedido tão rígidas quanto a criar_pedido
-- =====================================================================
-- O app cria pedidos pela função criar_pedido (criar_pedido.sql), que
-- confere: a comanda é do cliente e está aberta, o item é do mesmo bar, está
-- disponível, e a quantidade vai de 1 a 99. Ela roda com a permissão de quem
-- chama, então as regras (RLS) de pedidos e pedido_itens também valem.
--
-- O problema: a regra de pedido_itens era mais frouxa que a função. Pela API,
-- sem passar pela função, o cliente conseguia pôr item:
--   - num pedido antigo de uma comanda já fechada (conta esperando pagamento
--     ou paga), mudando o total depois de fechar;
--   - de outro bar, ou que o bar marcou como indisponível;
--   - com quantidade zero, negativa ou absurda.
-- Agora a regra exige o mesmo que a função.
--
-- E o cadastro: a regra "perfis: criar o próprio" passa a aceitar só perfil
-- de cliente sem bar. (O perfil já nasce pelo trigger do cadastro; a regra
-- fica só como garantia, e não pode servir para alguém se criar gerente.)
--
-- Como aplicar: SQL Editor → colar este arquivo inteiro → Run.
-- Pode rodar de novo sem problema. A última consulta confere o resultado.
-- =====================================================================

drop policy if exists "pedido_itens: cliente cria" on pedido_itens;
create policy "pedido_itens: cliente cria"
  on pedido_itens for insert
  with check (
    quantidade between 1 and 99
    and exists (
      select 1
      from pedidos p
      join comandas c on c.id = p.comanda_id
      join itens i on i.id = pedido_itens.item_id
      where p.id = pedido_itens.pedido_id
        and c.usuario_id = auth.uid()
        and c.status = 'aberta'
        and i.estabelecimento_id = c.estabelecimento_id
        and i.disponivel
    )
  );

drop policy if exists "perfis: criar o próprio" on perfis;
create policy "perfis: criar o próprio"
  on perfis for insert
  with check (id = auth.uid() and tipo = 'cliente' and estabelecimento_id is null);

-- ---------------------------------------------------------------------
-- Conferência: deve mostrar  item_confere_comanda_aberta = 1 | perfil_so_cliente = 1
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_policies
    where tablename = 'pedido_itens' and policyname = 'pedido_itens: cliente cria'
      and with_check like '%aberta%' and with_check like '%disponivel%') as item_confere_comanda_aberta,
  (select count(*) from pg_policies
    where tablename = 'perfis' and policyname = 'perfis: criar o próprio'
      and with_check like '%cliente%') as perfil_so_cliente;
