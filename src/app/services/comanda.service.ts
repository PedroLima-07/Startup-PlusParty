import { Injectable, inject } from '@angular/core';
import { ComandaDetalhada, Pedido, PedidoItemDetalhado } from '../models';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class ComandaService {
  private supabase = inject(SupabaseService);

  async buscarComanda(comandaId: string): Promise<ComandaDetalhada> {
    const { data, error } = await this.supabase.client
      .from('comandas')
      .select('*, estabelecimento:estabelecimentos(nome)')
      .eq('id', comandaId)
      .single();

    if (error) throw error;
    return data as unknown as ComandaDetalhada;
  }

  async buscarItensPedidos(comandaId: string): Promise<PedidoItemDetalhado[]> {
    const { data, error } = await this.supabase.client
      .from('pedido_itens')
      .select('*, item:itens(nome, setor), pedido:pedidos!inner(comanda_id)')
      .eq('pedido.comanda_id', comandaId);

    if (error) throw error;
    return (data ?? []) as unknown as PedidoItemDetalhado[];
  }

  calcularTotal(itens: PedidoItemDetalhado[]): number {
    return itens.reduce((total, item) => total + item.quantidade * item.preco_unitario, 0);
  }

  async criarPedido(comandaId: string): Promise<Pedido> {
    const { data, error } = await this.supabase.client
      .from('pedidos')
      .insert({ comanda_id: comandaId })
      .select()
      .single();

    if (error) throw error;
    return data as Pedido;
  }

  async fecharConta(comandaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('comandas')
      .update({ status: 'aguardando_pagamento', fechada_em: new Date().toISOString() })
      .eq('id', comandaId);

    if (error) throw error;
  }
}
