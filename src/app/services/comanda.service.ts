import { Injectable, inject } from '@angular/core';
import {
  Comanda,
  ComandaDetalhada,
  ContaPendente,
  PedidoItemDetalhado,
  STATUS_ATIVOS,
  StatusComanda,
} from '../models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

export class ComandaEmOutroLugarError extends Error {
  constructor(readonly nomeEstabelecimento: string) {
    super(`Já existe uma comanda ativa em ${nomeEstabelecimento}.`);
  }
}

/** O cliente fechou uma conta e ainda não pagou: não pode abrir outra comanda. */
export class ContaPendenteError extends Error {
  constructor(readonly conta: ContaPendente) {
    super(`Há uma conta esperando pagamento em ${conta.estabelecimento}.`);
  }
}

/** A comanda que ainda prende o cliente (só pode existir uma). */
export interface ComandaAtiva {
  id: string;
  estabelecimento_id: string;
  estabelecimento: string;
  mesa: string | null;
  status: StatusComanda;
  fechada_em: string | null;
  total: number;
}

interface LinhaComandaAtiva {
  id: string;
  estabelecimento_id: string;
  mesa: string | null;
  status: StatusComanda;
  fechada_em: string | null;
  estabelecimento: { nome: string } | null;
  pedidos: { pedido_itens: { quantidade: number; preco_unitario: number }[] }[];
}

/** Erro do Postgres para valor repetido onde só pode haver um. */
const VIOLACAO_DE_UNICIDADE = '23505';

@Injectable({
  providedIn: 'root',
})
export class ComandaService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);

  /**
   * Abre a comanda no estabelecimento. Se o cliente já tem uma comanda ativa
   * nesse mesmo lugar, devolve ela em vez de criar outra. Se a comanda ativa
   * é uma conta fechada esperando pagamento, recusa com ContaPendenteError;
   * se é em outro lugar, com ComandaEmOutroLugarError.
   *
   * O banco também garante uma comanda ativa por cliente: se outra aba abrir
   * no mesmo instante, o insert desta falha e ela passa a usar a que ficou.
   */
  async abrirComanda(estabelecimentoId: string, mesa: string | null): Promise<Pick<Comanda, 'id'>> {
    const existente = await this.usarComandaAtiva(estabelecimentoId);
    if (existente) return existente;

    const user = await this.authService.usuarioAtual();
    if (!user) throw new Error('Usuário não autenticado.');

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

    if (error) {
      if (error.code === VIOLACAO_DE_UNICIDADE) {
        const criadaEmOutraAba = await this.usarComandaAtiva(estabelecimentoId);
        if (criadaEmOutraAba) return criadaEmOutraAba;
      }
      throw error;
    }
    return data as Pick<Comanda, 'id'>;
  }

  /** A comanda ativa do cliente logado, com o total consumido; null se não tem. */
  async buscarComandaAtiva(): Promise<ComandaAtiva | null> {
    const user = await this.authService.usuarioAtual();
    if (!user) return null;

    const { data, error } = await this.supabase.client
      .from('comandas')
      .select(
        'id, estabelecimento_id, mesa, status, fechada_em, estabelecimento:estabelecimentos(nome), ' +
          'pedidos(pedido_itens(quantidade, preco_unitario))',
      )
      .eq('usuario_id', user.id)
      .in('status', STATUS_ATIVOS)
      .order('criada_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const linha = data as unknown as LinhaComandaAtiva;
    return {
      id: linha.id,
      estabelecimento_id: linha.estabelecimento_id,
      estabelecimento: linha.estabelecimento?.nome ?? 'outro estabelecimento',
      mesa: linha.mesa,
      status: linha.status,
      fechada_em: linha.fechada_em,
      total: linha.pedidos
        .flatMap((pedido) => pedido.pedido_itens)
        .reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0),
    };
  }

  /** A conta fechada que o cliente ainda não pagou; null se não há. */
  async buscarContaPendente(): Promise<ContaPendente | null> {
    const ativa = await this.buscarComandaAtiva();
    return ativa?.status === 'aguardando_pagamento' ? this.paraContaPendente(ativa) : null;
  }

  /** Decide o que fazer com a comanda ativa antes de abrir outra (ver abrirComanda). */
  private async usarComandaAtiva(estabelecimentoId: string): Promise<Pick<Comanda, 'id'> | null> {
    const ativa = await this.buscarComandaAtiva();
    if (!ativa) return null;

    if (ativa.status === 'aguardando_pagamento') throw new ContaPendenteError(this.paraContaPendente(ativa));
    if (ativa.estabelecimento_id === estabelecimentoId) return { id: ativa.id };
    throw new ComandaEmOutroLugarError(ativa.estabelecimento);
  }

  private paraContaPendente(ativa: ComandaAtiva): ContaPendente {
    return {
      id: ativa.id,
      estabelecimento: ativa.estabelecimento,
      mesa: ativa.mesa,
      fechada_em: ativa.fechada_em,
      total: ativa.total,
    };
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

  /**
   * Desiste da comanda que ainda espera a liberação do atendente: ela vira
   * 'cancelada' (supabase/comanda_regras.sql). Devolve false se já não dava
   * para cancelar, por exemplo porque o atendente liberou nesse meio tempo.
   */
  async cancelarSolicitacao(comandaId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from('comandas')
      .update({ status: 'cancelada' })
      .eq('id', comandaId)
      .eq('status', 'aguardando_liberacao')
      .select('id');

    if (error) throw error;
    return (data ?? []).length > 0;
  }

  calcularTotal(itens: PedidoItemDetalhado[]): number {
    return itens.reduce((total, item) => total + item.quantidade * item.preco_unitario, 0);
  }

  /** A hora do fechamento (fechada_em) quem grava é o banco. */
  async fecharConta(comandaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('comandas')
      .update({ status: 'aguardando_pagamento' })
      .eq('id', comandaId);

    if (error) throw error;
  }
}
