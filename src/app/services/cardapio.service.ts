import { Injectable, inject } from '@angular/core';
import { CardapioAgrupado, Item, ItemCarrinho } from '../models';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class CardapioService {
  private supabase = inject(SupabaseService);

  async buscarCardapio(estabelecimentoId: string): Promise<Item[]> {
    const { data, error } = await this.supabase.client
      .from('itens')
      .select('*')
      .eq('estabelecimento_id', estabelecimentoId)
      .eq('disponivel', true)
      .order('categoria');

    if (error) throw error;
    return (data ?? []) as Item[];
  }

  agruparPorCategoria(itens: Item[]): CardapioAgrupado {
    const grupos: CardapioAgrupado = {};
    for (const item of itens) {
      (grupos[item.categoria] ??= []).push(item);
    }
    return grupos;
  }

  calcularTotalCarrinho(carrinho: ItemCarrinho[]): number {
    return carrinho.reduce((total, { item, quantidade }) => total + item.preco * quantidade, 0);
  }

  /** Confirma o carrinho: cria o pedido e os itens pedidos de uma vez. */
  async confirmarPedido(comandaId: string, carrinho: ItemCarrinho[]): Promise<void> {
    const { data: pedido, error: erroPedido } = await this.supabase.client
      .from('pedidos')
      .insert({ comanda_id: comandaId })
      .select()
      .single();

    if (erroPedido) throw erroPedido;

    const pedidoItens = carrinho.map(({ item, quantidade }) => ({
      pedido_id: pedido.id,
      item_id: item.id,
      quantidade,
      preco_unitario: item.preco,
      status: 'novo' as const,
    }));

    const { error: erroItens } = await this.supabase.client
      .from('pedido_itens')
      .insert(pedidoItens);

    if (erroItens) throw erroItens;
  }
}
