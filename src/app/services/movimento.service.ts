import { Injectable, computed, signal } from '@angular/core';
import {
  AlertaGerente,
  ComandaResumo,
  ItemVendido,
  LotacaoPorHora,
  StatusMovimento,
} from '../models';

/**
 * Números do painel do gerente (Movimento, Resumo da noite e Resultados).
 *
 * TODO: os valores de base abaixo são de exemplo, ainda não vêm do Supabase.
 * Tudo que é derivado (ticket médio, percentuais, pico) já é calculado a partir
 * deles, então ligar ao banco é trocar só os sinais de base.
 */
@Injectable({
  providedIn: 'root',
})
export class MovimentoService {
  // ------------------------------------------------------------------
  // Dados de base (exemplo)
  // ------------------------------------------------------------------
  readonly statusMovimento = signal<StatusMovimento>('quente');

  readonly comandasAbertas = signal(34);
  readonly comandasPagas = signal(58);
  readonly comandasAguardandoPagamento = signal(3);
  readonly valorAguardandoPagamento = signal(412);

  /** Soma só das comandas já pagas. */
  readonly faturamento = signal(4820);
  readonly metaFaturamento = signal(6000);
  /** Consumo das comandas ainda abertas, que pode mudar até o fechamento. */
  readonly valorEmAberto = signal(1240);

  readonly comandasEmMesa = signal(27);
  readonly comandasNoBalcao = signal(7);

  readonly itensVendidos = signal(342);
  readonly pedidos = signal(187);
  readonly itensDoBar = signal(198);
  readonly itensDaCozinha = signal(144);

  readonly minutosPreparoBar = signal(4);
  readonly minutosPreparoCozinha = signal(23);
  readonly pedidosEmPreparo = signal(12);
  readonly pedidosProntos = signal(175);
  readonly chamadosDeGarcom = signal(8);

  readonly lotacaoPorHora = signal<LotacaoPorHora[]>([
    { hora: '19h', comandas: 8 },
    { hora: '20h', comandas: 15 },
    { hora: '21h', comandas: 24 },
    { hora: '22h', comandas: 31 },
    { hora: '23h', comandas: 38 },
    { hora: '0h', comandas: 34 },
    { hora: '1h', comandas: 19 },
  ]);

  readonly maisVendidos = signal<ItemVendido[]>([
    { nome: 'Chope Pilsen 350ml', quantidade: 87 },
    { nome: 'Caipirinha de Limão', quantidade: 54 },
    { nome: 'Batata Frita c/ Cheddar', quantidade: 41 },
    { nome: 'IPA Artesanal 500ml', quantidade: 29 },
    { nome: 'Iscas de Frango', quantidade: 22 },
  ]);

  readonly alertas = signal<AlertaGerente[]>([
    {
      id: 'a1',
      tipo: 'pagamento',
      titulo: 'Comanda sem pagamento há 25 min',
      detalhe: 'Comanda 07 · Mesa 12 · Carlos Souza · R$ 142,00',
      comanda: '07',
    },
    {
      id: 'a2',
      tipo: 'pedido_parado',
      titulo: 'Pedido parado há 18 min',
      detalhe: 'Comanda 12 · Cozinha · 1× Iscas de Frango',
      comanda: '12',
    },
    {
      id: 'a3',
      tipo: 'liberacao',
      titulo: 'Comanda aguardando liberação há 6 min',
      detalhe: 'Mesa 04 · Ana Lima',
      comanda: null,
    },
    {
      id: 'a4',
      tipo: 'sem_pedido',
      titulo: 'Comanda aberta há 3h sem novo pedido',
      detalhe: 'Comanda 03 · Mesa 09 · R$ 78,00',
      comanda: '03',
    },
  ]);

  readonly comandas = signal<ComandaResumo[]>([
    { numero: '01', cliente: 'Rafael Menezes', mesa: '02', horario: '22:40', valor: 109.6, status: 'aberta' },
    { numero: '02', cliente: 'Beatriz Lima', mesa: '03', horario: '22:15', valor: 144, status: 'aberta' },
    { numero: '04', cliente: 'Carlos Souza', mesa: 'Balcão', horario: '21:20', valor: 139.7, status: 'aberta' },
    { numero: '07', cliente: 'Carlos Souza', mesa: '12', horario: '21:10', valor: 142, status: 'aguardando_pagamento' },
    { numero: '05', cliente: 'Marina Duarte', mesa: '06', horario: '20:55', valor: 96.5, status: 'paga' },
    { numero: '12', cliente: 'João Pedro', mesa: '08', horario: '20:40', valor: 64, status: 'aberta' },
    { numero: '03', cliente: 'Lívia Castro', mesa: '09', horario: '19:35', valor: 78, status: 'aberta' },
    { numero: '06', cliente: 'Thiago Ramos', mesa: 'Balcão', horario: '19:20', valor: 52.9, status: 'paga' },
  ]);

  // ------------------------------------------------------------------
  // Derivados
  // ------------------------------------------------------------------
  /** Todas as comandas da noite, em qualquer situação. */
  readonly totalComandas = computed(
    () => this.comandasAbertas() + this.comandasPagas() + this.comandasAguardandoPagamento(),
  );

  readonly ticketMedio = computed(() =>
    this.comandasPagas() > 0 ? this.faturamento() / this.comandasPagas() : 0,
  );

  /** Quanto da meta de faturamento já foi atingido, de 0 a 100. */
  readonly percentualDaMeta = computed(() =>
    percentual(this.faturamento(), this.metaFaturamento()),
  );

  readonly percentualEncerradas = computed(() =>
    percentual(this.comandasPagas(), this.totalComandas()),
  );

  readonly percentualEmMesa = computed(() =>
    percentual(this.comandasEmMesa(), this.comandasEmMesa() + this.comandasNoBalcao()),
  );

  readonly pedidosParados = computed(
    () => this.alertas().filter((alerta) => alerta.tipo === 'pedido_parado').length,
  );
}

/** Parte de um todo em porcentagem inteira, limitada a 100. Sem todo, é zero. */
function percentual(parte: number, todo: number): number {
  if (todo <= 0) return 0;
  return Math.min(100, Math.round((parte / todo) * 100));
}
