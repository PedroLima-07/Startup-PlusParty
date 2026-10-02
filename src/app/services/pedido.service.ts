import { Injectable, inject } from '@angular/core';
import { ItemCarrinho } from '../models';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class PedidoService {
  private supabase = inject(SupabaseService);

  /**
   * Cria o pedido e os itens numa transação só (ver supabase/criar_pedido.sql).
   * Só manda item e quantidade: o valor de cada item é lido no banco.
   * Devolve o id do pedido criado.
   */
  async criarPedido(comandaId: string, itensDoCarrinho: ItemCarrinho[]): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('criar_pedido', {
      p_comanda_id: comandaId,
      p_itens: itensDoCarrinho.map(({ item, quantidade }) => ({ item_id: item.id, quantidade })),
    });

    if (error) throw error;
    return data as string;
  }
}
