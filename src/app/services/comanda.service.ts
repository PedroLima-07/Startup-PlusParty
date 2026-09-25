import { Injectable, inject } from '@angular/core';
import { Comanda, ComandaDetalhada, PedidoItemDetalhado } from '../models';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class ComandaService {
  private supabase = inject(SupabaseService);

  async abrirComanda(estabelecimentoId: string, mesa: string | null): Promise<Comanda> {
    const {
      data: { user },
      error: erroUsuario,
    } = await this.supabase.client.auth.getUser();
    if (erroUsuario) throw erroUsuario;
    if (!user) throw new Error('Usuário não autenticado.');

    const { data, error } = await this.supabase.client
      .from('comandas')
      .insert({
        usuario_id: user.id,
        estabelecimento_id: estabelecimentoId,
        mesa,
        status: 'aguardando_liberacao',
      })
      .select()
      .single();

    if (error) throw error;
    return data as Comanda;
  }

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

  async fecharConta(comandaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('comandas')
      .update({ status: 'aguardando_pagamento', fechada_em: new Date().toISOString() })
      .eq('id', comandaId);

    if (error) throw error;
  }
}
