import { Injectable, inject } from '@angular/core';
import { CardapioAgrupado, Item, ItemCarrinho } from '../models';
import { SupabaseService } from './supabase.service';

/** O cardápio de um bar junto com o nome dele, como a tela de cardápio mostra. */
export interface CardapioDoBar {
  nomeEstabelecimento: string;
  itens: Item[];
}

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

  /**
   * Cardápio do bar onde a comanda foi aberta, numa consulta só: a comanda
   * traz o bar, e o bar traz os itens disponíveis. O RLS só devolve a comanda
   * ao dono dela.
   */
  async buscarCardapioDaComanda(comandaId: string): Promise<CardapioDoBar> {
    const { data, error } = await this.supabase.client
      .from('comandas')
      .select('estabelecimento:estabelecimentos(nome, itens(*))')
      .eq('id', comandaId)
      .eq('estabelecimento.itens.disponivel', true)
      .order('categoria', { referencedTable: 'estabelecimento.itens' })
      .single();

    if (error) throw error;
    const { nome, itens } = data.estabelecimento as unknown as { nome: string; itens: Item[] };
    return { nomeEstabelecimento: nome, itens };
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
