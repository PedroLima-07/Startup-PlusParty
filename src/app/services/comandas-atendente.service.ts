import { Injectable, inject } from '@angular/core';
import { ComandaPendente } from '../models';
import { SupabaseService } from './supabase.service';

/** Formato de cada linha que a consulta de comandas pendentes devolve. */
export interface LinhaComandaPendente {
  id: string;
  status: ComandaPendente['status'];
  mesa: string | null;
  criada_em: string;
  cliente: { nome: string } | null;
  pedidos: { pedido_itens: { quantidade: number; preco_unitario: number }[] }[];
}

@Injectable({
  providedIn: 'root',
})
export class ComandasAtendenteService {
  private supabase = inject(SupabaseService);

  /** Comandas esperando o atendente. O RLS já limita ao estabelecimento dele. */
  async listarPendentes(): Promise<ComandaPendente[]> {
    const { data, error } = await this.supabase.client
      .from('comandas')
      .select(
        'id, status, mesa, criada_em, cliente:perfis(nome), ' +
          'pedidos(pedido_itens(quantidade, preco_unitario))',
      )
      .in('status', ['aguardando_liberacao', 'aguardando_pagamento'])
      .order('criada_em');

    if (error) throw error;
    return ((data ?? []) as unknown as LinhaComandaPendente[]).map((linha) => this.paraComanda(linha));
  }

  async liberar(comandaId: string): Promise<void> {
    await this.mudarStatus(comandaId, 'aguardando_liberacao', 'aberta');
  }

  async confirmarPagamento(comandaId: string): Promise<void> {
    await this.mudarStatus(comandaId, 'aguardando_pagamento', 'paga');
  }

  paraComanda(linha: LinhaComandaPendente): ComandaPendente {
    const total = linha.pedidos
      .flatMap((pedido) => pedido.pedido_itens)
      .reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);

    return {
      id: linha.id,
      status: linha.status,
      mesa: linha.mesa,
      cliente: linha.cliente?.nome.trim() || 'Cliente',
      criada_em: linha.criada_em,
      total,
    };
  }

  /** Só muda se a comanda ainda estiver no status esperado (evita agir duas vezes). */
  private async mudarStatus(comandaId: string, de: string, para: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('comandas')
      .update({ status: para })
      .eq('id', comandaId)
      .eq('status', de);

    if (error) throw error;
  }
}
