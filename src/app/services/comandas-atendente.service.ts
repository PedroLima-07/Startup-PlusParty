import { Injectable, inject, signal } from '@angular/core';
import { ComandaAtendente, ItemConsumido, StatusComanda } from '../models';
import { SupabaseService } from './supabase.service';

type StatusNaLista = ComandaAtendente['status'];

/** O que precisa de ação vem primeiro; 'aberta' só acompanha. */
const ORDEM_NA_LISTA: Record<StatusNaLista, number> = {
  aguardando_liberacao: 0,
  aguardando_pagamento: 1,
  aberta: 2,
};

const STATUS_PENDENTES: StatusNaLista[] = ['aguardando_liberacao', 'aguardando_pagamento'];

/** Formato de cada linha que a consulta de comandas devolve. */
export interface LinhaComandaAtendente {
  id: string;
  status: StatusNaLista;
  mesa: string | null;
  criada_em: string;
  cliente: { nome: string } | null;
  pedidos: {
    pedido_itens: { quantidade: number; preco_unitario: number; item: { nome: string } | null }[];
  }[];
}

/**
 * A comanda já não estava no status esperado: outro atendente agiu antes ou
 * o cliente cancelou a solicitação. Nada foi alterado.
 */
export class ComandaJaMudouError extends Error {
  constructor() {
    super('A comanda já não está mais neste status.');
  }
}

@Injectable({
  providedIn: 'root',
})
export class ComandasAtendenteService {
  private supabase = inject(SupabaseService);

  private readonly totalPendencias = signal(0);

  /**
   * Comandas esperando liberação ou pagamento, como na última consulta.
   * É o número do contador na navegação do atendente.
   */
  readonly pendencias = this.totalPendencias.asReadonly();

  /**
   * Comandas do bar que ainda estão na mão do atendente (nem pagas nem
   * recusadas), com as pendências no topo.
   *
   * O filtro por estabelecimento é necessário mesmo com o RLS: quem virou
   * atendente também enxerga as comandas que abriu como cliente em outro bar.
   */
  async listar(estabelecimentoId: string): Promise<ComandaAtendente[]> {
    const { data, error } = await this.supabase.client
      .from('comandas')
      .select(
        'id, status, mesa, criada_em, cliente:perfis(nome), ' +
          'pedidos(pedido_itens(quantidade, preco_unitario, item:itens(nome)))',
      )
      .eq('estabelecimento_id', estabelecimentoId)
      .in('status', Object.keys(ORDEM_NA_LISTA))
      .order('criada_em');

    if (error) throw error;

    const comandas = this.ordenar(
      ((data ?? []) as unknown as LinhaComandaAtendente[]).map((linha) => this.paraComanda(linha)),
    );
    this.totalPendencias.set(comandas.filter((c) => STATUS_PENDENTES.includes(c.status)).length);
    return comandas;
  }

  /** Só conta as pendências, sem trazer as comandas. Para a navegação fora da aba Comandas. */
  async atualizarPendencias(estabelecimentoId: string): Promise<void> {
    const { count, error } = await this.supabase.client
      .from('comandas')
      .select('id', { count: 'exact', head: true })
      .eq('estabelecimento_id', estabelecimentoId)
      .in('status', STATUS_PENDENTES);

    if (error) throw error;
    this.totalPendencias.set(count ?? 0);
  }

  async liberar(comandaId: string): Promise<void> {
    await this.mudarStatus(comandaId, 'aguardando_liberacao', 'aberta');
  }

  /** Precisa do status 'recusada' no banco (supabase/recusar_comanda.sql). */
  async recusar(comandaId: string): Promise<void> {
    await this.mudarStatus(comandaId, 'aguardando_liberacao', 'recusada');
  }

  async confirmarPagamento(comandaId: string): Promise<void> {
    await this.mudarStatus(comandaId, 'aguardando_pagamento', 'paga');
  }

  paraComanda(linha: LinhaComandaAtendente): ComandaAtendente {
    const itens = this.juntarItens(linha);

    return {
      id: linha.id,
      status: linha.status,
      mesa: linha.mesa,
      cliente: linha.cliente?.nome.trim() || 'Cliente',
      criada_em: linha.criada_em,
      total: itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0),
      itens,
    };
  }

  /** Pendências primeiro; dentro de cada status, quem espera há mais tempo. */
  ordenar(comandas: ComandaAtendente[]): ComandaAtendente[] {
    return [...comandas].sort(
      (a, b) =>
        ORDEM_NA_LISTA[a.status] - ORDEM_NA_LISTA[b.status] ||
        new Date(a.criada_em).getTime() - new Date(b.criada_em).getTime(),
    );
  }

  /**
   * O mesmo item pedido em rodadas diferentes vira uma linha só. O preço entra
   * na chave porque fica congelado em cada pedido e pode ter mudado no meio da noite.
   */
  private juntarItens(linha: LinhaComandaAtendente): ItemConsumido[] {
    const porItem = new Map<string, ItemConsumido>();

    for (const pedidoItem of linha.pedidos.flatMap((pedido) => pedido.pedido_itens)) {
      const nome = pedidoItem.item?.nome ?? 'Item';
      const chave = `${nome}|${pedidoItem.preco_unitario}`;
      const existente = porItem.get(chave);

      if (existente) {
        existente.quantidade += pedidoItem.quantidade;
      } else {
        porItem.set(chave, {
          nome,
          quantidade: pedidoItem.quantidade,
          preco_unitario: pedidoItem.preco_unitario,
        });
      }
    }

    return Array.from(porItem.values());
  }

  /**
   * Só muda se a comanda ainda estiver no status esperado; se não estiver,
   * avisa com ComandaJaMudouError em vez de fingir que deu certo.
   */
  private async mudarStatus(
    comandaId: string,
    de: StatusComanda,
    para: StatusComanda,
  ): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('comandas')
      .update({ status: para })
      .eq('id', comandaId)
      .eq('status', de)
      .select('id');

    if (error) throw error;
    if ((data ?? []).length === 0) throw new ComandaJaMudouError();
  }
}
