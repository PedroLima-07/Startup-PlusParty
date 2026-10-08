-- =====================================================================
-- +party — Cliente cancela a comanda que ainda espera liberação
-- =====================================================================
-- O cliente abre a comanda e fica aguardando o atendente liberar. Se
-- desistir (errou de bar, mudou de ideia), precisa conseguir cancelar
-- sozinho; sem isso a comanda ficava presa e ele não abria outra.
--
-- Cancelar aqui é apagar a linha. Só vale enquanto o status for
-- 'aguardando_liberacao': nesse ponto a comanda ainda não tem pedidos
-- (pedir exige comanda 'aberta'), então nada fica órfão. Depois de
-- liberada, o caminho continua sendo fechar a conta.
--
-- Como aplicar: SQL Editor → colar → Run. Pode rodar de novo sem problema.
-- =====================================================================

drop policy if exists "comandas: cliente cancela antes da liberação" on comandas;

create policy "comandas: cliente cancela antes da liberação"
  on comandas for delete
  using (usuario_id = auth.uid() and status = 'aguardando_liberacao');
