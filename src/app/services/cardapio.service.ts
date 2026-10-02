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
}
