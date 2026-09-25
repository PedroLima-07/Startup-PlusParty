import { Injectable, inject } from '@angular/core';
import { PedidoSetor, SetorItem, StatusPedidoItem } from '../models';
import { SupabaseService } from './supabase.service';

/** Formato de cada linha que a consulta de itens pendentes devolve. */
export interface ItemPendente {
  id: string;
  quantidade: number;
  status: StatusPedidoItem;
  pedido_id: string;
  item: { nome: string; setor: SetorItem };
  pedido: {
    criado_em: string;
    comanda: { mesa: string | null; cliente: { nome: string } | null };
  };
}

@Injectable({
  providedIn: 'root',
})
export class PedidosAtendenteService {
  private supabase = inject(SupabaseService);

  /**
   * Itens ainda não prontos. Não filtra por estabelecimento aqui: o RLS já
   * só devolve os itens do estabelecimento do funcionário logado.
   */
  async listarPendentes(): Promise<PedidoSetor[]> {
    const { data, error } = await this.supabase.client
      .from('pedido_itens')
      .select(
        'id, quantidade, status, pedido_id, item:itens(nome, setor), ' +
          'pedido:pedidos!inner(criado_em, comanda:comandas!inner(mesa, cliente:perfis(nome)))',
      )
      .in('status', ['novo', 'em_andamento']);

    if (error) throw error;
    return this.agruparPorPedidoESetor((data ?? []) as unknown as ItemPendente[]);
  }

  async atualizarStatus(itensIds: string[], status: StatusPedidoItem): Promise<void> {
    const { error } = await this.supabase.client
      .from('pedido_itens')
      .update({ status })
      .in('id', itensIds);

    if (error) throw error;
  }

  /** Junta os itens de um mesmo pedido e setor num card, do mais antigo pro mais novo. */
  agruparPorPedidoESetor(itens: ItemPendente[]): PedidoSetor[] {
    const grupos = new Map<string, PedidoSetor>();

    for (const linha of itens) {
      const chave = `${linha.pedido_id}-${linha.item.setor}`;
      let grupo = grupos.get(chave);

      if (!grupo) {
        grupo = {
          id: chave,
          pedido_id: linha.pedido_id,
          setor: linha.item.setor,
          status: linha.status,
          mesa: linha.pedido.comanda.mesa,
          cliente: linha.pedido.comanda.cliente?.nome ?? 'Cliente',
          criado_em: linha.pedido.criado_em,
          itens_ids: [],
          itens: [],
        };
        grupos.set(chave, grupo);
      }

      // Se um item do grupo ainda é "novo", o card inteiro ainda não começou.
      if (linha.status === 'novo') grupo.status = 'novo';

      grupo.itens_ids.push(linha.id);
      grupo.itens.push({ nome: linha.item.nome, quantidade: linha.quantidade });
    }

    return Array.from(grupos.values()).sort(
      (a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime(),
    );
  }
}
