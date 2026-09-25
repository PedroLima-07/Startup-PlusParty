import { Injectable, inject } from '@angular/core';
import { Comanda, ComandaDetalhada, PedidoItemDetalhado } from '../models';
import { SupabaseService } from './supabase.service';

export class ComandaEmOutroLugarError extends Error {
  constructor(readonly nomeEstabelecimento: string) {
    super(`Já existe uma comanda ativa em ${nomeEstabelecimento}.`);
  }
}

@Injectable({
  providedIn: 'root',
})
export class ComandaService {
  private supabase = inject(SupabaseService);

  /**
   * Abre a comanda no estabelecimento. Se o cliente já tem uma comanda ativa
   * (ainda não paga) nesse mesmo lugar, devolve ela em vez de criar outra.
   * Se a comanda ativa for em outro lugar, recusa com ComandaEmOutroLugarError.
   */
  async abrirComanda(estabelecimentoId: string, mesa: string | null): Promise<Pick<Comanda, 'id'>> {
    const {
      data: { user },
      error: erroUsuario,
    } = await this.supabase.client.auth.getUser();
    if (erroUsuario) throw erroUsuario;
    if (!user) throw new Error('Usuário não autenticado.');

    const { data: ativa, error: erroAtiva } = await this.supabase.client
      .from('comandas')
      .select('id, estabelecimento_id, estabelecimento:estabelecimentos(nome)')
      .eq('usuario_id', user.id)
      .neq('status', 'paga')
      .order('criada_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroAtiva) throw erroAtiva;
    if (ativa) {
      if (ativa.estabelecimento_id === estabelecimentoId) return { id: ativa.id };
      const lugar = ativa.estabelecimento as unknown as { nome: string } | null;
      throw new ComandaEmOutroLugarError(lugar?.nome ?? 'outro estabelecimento');
    }

    const { data, error } = await this.supabase.client
      .from('comandas')
      .insert({
        usuario_id: user.id,
        estabelecimento_id: estabelecimentoId,
        mesa,
        status: 'aguardando_liberacao',
      })
      .select('id')
      .single();

    if (error) throw error;
    return data as Pick<Comanda, 'id'>;
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
