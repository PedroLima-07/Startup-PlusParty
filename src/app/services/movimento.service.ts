import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AlertaGerente,
  ComandaResumo,
  ItemVendido,
  LotacaoPorHora,
  SetorItem,
  StatusComanda,
  StatusMovimento,
  StatusPedidoItem,
} from '../models';
import { AuthService } from './auth.service';
import { HomeService } from './home.service';
import { SupabaseService } from './supabase.service';

/** A noite do bar começa às 6h: comandas da madrugada contam para a noite anterior. */
const HORA_VIRADA_DO_DIA = 6;

/** Quantos itens a lista de mais vendidos mostra. */
const TOP_MAIS_VENDIDOS = 5;

/** A partir de quantos minutos cada situação vira alerta para o gerente. */
const MINUTOS_ALERTA = {
  pagamento: 20,
  pedido_parado: 15,
  liberacao: 5,
  sem_pedido: 180,
} as const;

/** Formato de cada linha que a consulta de comandas da noite devolve. */
export interface LinhaComandaMovimento {
  id: string;
  status: StatusComanda;
  mesa: string | null;
  criada_em: string;
  fechada_em: string | null;
  cliente: { nome: string } | null;
  pedidos: {
    id: string;
    criado_em: string;
    pedido_itens: {
      quantidade: number;
      preco_unitario: number;
      status: StatusPedidoItem;
      item: { nome: string; setor: SetorItem } | null;
    }[];
  }[];
}

/** Tudo que o painel mostra, calculado a partir das comandas da noite. */
export interface NumerosMovimento {
  comandasAbertas: number;
  comandasPagas: number;
  comandasAguardandoPagamento: number;
  valorAguardandoPagamento: number;
  faturamento: number;
  valorEmAberto: number;
  comandasEmMesa: number;
  comandasNoBalcao: number;
  itensVendidos: number;
  pedidos: number;
  itensDoBar: number;
  itensDaCozinha: number;
  pedidosEmPreparo: number;
  pedidosProntos: number;
  lotacaoPorHora: LotacaoPorHora[];
  maisVendidos: ItemVendido[];
  alertas: AlertaGerente[];
  comandas: ComandaResumo[];
}

/**
 * Números do painel do gerente (Movimento, Resumo da noite e Resultados).
 *
 * `carregar()` busca as comandas da noite no Supabase e preenche os sinais de
 * base. O RLS já limita a consulta ao estabelecimento do gerente logado.
 *
 * Ainda sem dado no banco, por isso ficam vazios: a meta de faturamento (não
 * há coluna para ela) e o tempo de preparo (pedido_itens não guarda quando o
 * item ficou pronto). As telas escondem esses blocos enquanto estiverem nulos.
 */
@Injectable({
  providedIn: 'root',
})
export class MovimentoService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);
  private homeService = inject(HomeService);

  // ------------------------------------------------------------------
  // Dados de base
  // ------------------------------------------------------------------
  readonly statusMovimento = signal<StatusMovimento>('normal');

  readonly comandasAbertas = signal(0);
  readonly comandasPagas = signal(0);
  readonly comandasAguardandoPagamento = signal(0);
  readonly valorAguardandoPagamento = signal(0);

  /** Soma só das comandas já pagas. */
  readonly faturamento = signal(0);
  /** Sem meta cadastrada, é null e a barra de meta não aparece. */
  readonly metaFaturamento = signal<number | null>(null);
  /** Consumo das comandas ainda abertas, que pode mudar até o fechamento. */
  readonly valorEmAberto = signal(0);

  readonly comandasEmMesa = signal(0);
  readonly comandasNoBalcao = signal(0);

  readonly itensVendidos = signal(0);
  readonly pedidos = signal(0);
  readonly itensDoBar = signal(0);
  readonly itensDaCozinha = signal(0);

  /** Minutos médios de preparo; null enquanto o banco não registrar quando o item fica pronto. */
  readonly minutosPreparoBar = signal<number | null>(null);
  readonly minutosPreparoCozinha = signal<number | null>(null);
  readonly pedidosEmPreparo = signal(0);
  readonly pedidosProntos = signal(0);
  readonly chamadosDeGarcom = signal(0);

  readonly lotacaoPorHora = signal<LotacaoPorHora[]>([]);
  readonly maisVendidos = signal<ItemVendido[]>([]);
  readonly alertas = signal<AlertaGerente[]>([]);
  readonly comandas = signal<ComandaResumo[]>([]);

  /** Quando os números foram buscados pela última vez. */
  readonly atualizadoEm = signal<Date | null>(null);
  /** Mensagem para a tela quando a última busca falhou; os números anteriores continuam. */
  readonly erro = signal<string | null>(null);
  readonly atualizando = signal(false);

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
    percentual(this.faturamento(), this.metaFaturamento() ?? 0),
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

  // ------------------------------------------------------------------
  // Carga
  // ------------------------------------------------------------------
  /**
   * Versão para as telas: nunca rejeita. Se a busca falhar, mantém os
   * números anteriores e deixa a mensagem em `erro`.
   */
  async atualizar(): Promise<void> {
    this.atualizando.set(true);
    try {
      await this.carregar();
      this.erro.set(null);
    } catch {
      this.erro.set('Não foi possível atualizar os números da noite. Tente de novo em instantes.');
    } finally {
      this.atualizando.set(false);
    }
  }

  /** Busca a noite atual no Supabase e atualiza todos os sinais. */
  async carregar(agora = new Date()): Promise<void> {
    const inicio = inicioDaNoite(agora).toISOString();
    const perfil = await this.authService.perfilAtual();
    const estabelecimentoId = perfil?.estabelecimento?.id ?? null;

    const [comandas, chamados, capacidade] = await Promise.all([
      this.buscarComandas(inicio),
      this.contarChamados(inicio),
      estabelecimentoId ? this.buscarCapacidade(estabelecimentoId) : Promise.resolve(null),
    ]);

    const numeros = calcularMovimento(comandas, agora);
    this.aplicar(numeros);
    this.chamadosDeGarcom.set(chamados);
    // Mesma conta do selo da Home: entra quem já está aberto ou esperando liberação.
    const ocupando = comandas.filter(
      (comanda) => comanda.status === 'aberta' || comanda.status === 'aguardando_liberacao',
    ).length;
    this.statusMovimento.set(this.homeService.calcularLotacao(ocupando, capacidade));
    this.atualizadoEm.set(agora);
  }

  private async buscarComandas(inicio: string): Promise<LinhaComandaMovimento[]> {
    const { data, error } = await this.supabase.client
      .from('comandas')
      .select(
        'id, status, mesa, criada_em, fechada_em, cliente:perfis(nome), ' +
          'pedidos(id, criado_em, pedido_itens(quantidade, preco_unitario, status, item:itens(nome, setor)))',
      )
      .gte('criada_em', inicio)
      .order('criada_em');

    if (error) throw error;
    return (data ?? []) as unknown as LinhaComandaMovimento[];
  }

  /** Chamados de garçom da noite. O RLS limita aos alertas das comandas do bar. */
  private async contarChamados(inicio: string): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('alertas')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'chamar_garcom')
      .gte('criado_em', inicio);

    if (error) throw error;
    return count ?? 0;
  }

  private async buscarCapacidade(estabelecimentoId: string): Promise<number | null> {
    const { data, error } = await this.supabase.client
      .from('estabelecimentos')
      .select('capacidade')
      .eq('id', estabelecimentoId)
      .maybeSingle();

    if (error) throw error;
    return (data as { capacidade: number | null } | null)?.capacidade ?? null;
  }

  private aplicar(numeros: NumerosMovimento): void {
    this.comandasAbertas.set(numeros.comandasAbertas);
    this.comandasPagas.set(numeros.comandasPagas);
    this.comandasAguardandoPagamento.set(numeros.comandasAguardandoPagamento);
    this.valorAguardandoPagamento.set(numeros.valorAguardandoPagamento);
    this.faturamento.set(numeros.faturamento);
    this.valorEmAberto.set(numeros.valorEmAberto);
    this.comandasEmMesa.set(numeros.comandasEmMesa);
    this.comandasNoBalcao.set(numeros.comandasNoBalcao);
    this.itensVendidos.set(numeros.itensVendidos);
    this.pedidos.set(numeros.pedidos);
    this.itensDoBar.set(numeros.itensDoBar);
    this.itensDaCozinha.set(numeros.itensDaCozinha);
    this.pedidosEmPreparo.set(numeros.pedidosEmPreparo);
    this.pedidosProntos.set(numeros.pedidosProntos);
    this.lotacaoPorHora.set(numeros.lotacaoPorHora);
    this.maisVendidos.set(numeros.maisVendidos);
    this.alertas.set(numeros.alertas);
    this.comandas.set(numeros.comandas);
  }
}

/** Início da noite que contém `agora`: hoje às 6h, ou ontem às 6h se ainda for madrugada. */
export function inicioDaNoite(agora: Date): Date {
  const inicio = new Date(agora);
  inicio.setHours(HORA_VIRADA_DO_DIA, 0, 0, 0);
  if (agora.getHours() < HORA_VIRADA_DO_DIA) inicio.setDate(inicio.getDate() - 1);
  return inicio;
}

/** Transforma as comandas da noite em todos os números do painel. */
export function calcularMovimento(linhas: LinhaComandaMovimento[], agora: Date): NumerosMovimento {
  const ordenadas = [...linhas].sort((a, b) => tempo(a.criada_em) - tempo(b.criada_em));
  // A comanda não tem número no banco: numera pela ordem de abertura na noite.
  const numeros = new Map(ordenadas.map((linha, i) => [linha.id, String(i + 1).padStart(2, '0')]));

  const doStatus = (status: StatusComanda) => ordenadas.filter((linha) => linha.status === status);
  const abertas = doStatus('aberta');
  const pagas = doStatus('paga');
  const aguardandoPagamento = doStatus('aguardando_pagamento');

  const itens = ordenadas.flatMap((linha) =>
    linha.pedidos.flatMap((pedido) => pedido.pedido_itens),
  );
  const todosPedidos = ordenadas.flatMap((linha) => linha.pedidos);
  const quantidadeDoSetor = (setor: SetorItem) =>
    soma(itens.filter((item) => item.item?.setor === setor).map((item) => item.quantidade));

  const pedidosComItens = todosPedidos.filter((pedido) => pedido.pedido_itens.length > 0);
  const prontos = pedidosComItens.filter((pedido) =>
    pedido.pedido_itens.every((item) => item.status === 'pronto'),
  );

  return {
    comandasAbertas: abertas.length,
    comandasPagas: pagas.length,
    comandasAguardandoPagamento: aguardandoPagamento.length,
    valorAguardandoPagamento: soma(aguardandoPagamento.map(totalDaComanda)),
    faturamento: soma(pagas.map(totalDaComanda)),
    valorEmAberto: soma(abertas.map(totalDaComanda)),
    comandasEmMesa: abertas.filter((linha) => linha.mesa).length,
    comandasNoBalcao: abertas.filter((linha) => !linha.mesa).length,
    itensVendidos: soma(itens.map((item) => item.quantidade)),
    pedidos: pedidosComItens.length,
    itensDoBar: quantidadeDoSetor('bar'),
    itensDaCozinha: quantidadeDoSetor('cozinha'),
    pedidosEmPreparo: pedidosComItens.length - prontos.length,
    pedidosProntos: prontos.length,
    lotacaoPorHora: calcularLotacaoPorHora(ordenadas, agora),
    maisVendidos: calcularMaisVendidos(itens),
    alertas: calcularAlertas(ordenadas, numeros, agora),
    comandas: ordenadas
      .filter((linha) => linha.status !== 'aguardando_liberacao')
      .reverse()
      .map((linha) => ({
        numero: numeros.get(linha.id)!,
        cliente: nomeDoCliente(linha),
        mesa: linha.mesa ?? 'Balcão',
        horario: horaMinuto(new Date(linha.criada_em)),
        valor: totalDaComanda(linha),
        status: linha.status as ComandaResumo['status'],
      })),
  };
}

/**
 * Quantas comandas estavam abertas em cada hora, da primeira hora com comanda
 * até agora. Uma comanda conta da abertura até o cliente fechar a conta.
 */
function calcularLotacaoPorHora(linhas: LinhaComandaMovimento[], agora: Date): LotacaoPorHora[] {
  if (linhas.length === 0) return [];

  const intervalos = linhas.map((linha) => ({
    abre: tempo(linha.criada_em),
    fecha: fimDaComanda(linha, agora),
  }));

  const hora = new Date(Math.min(...intervalos.map((intervalo) => intervalo.abre)));
  hora.setMinutes(0, 0, 0);

  const faixas: LotacaoPorHora[] = [];
  while (hora.getTime() <= agora.getTime()) {
    const inicio = hora.getTime();
    const fim = inicio + 60 * 60 * 1000;
    const comandas = intervalos.filter(({ abre, fecha }) => abre < fim && fecha >= inicio).length;
    faixas.push({ hora: `${hora.getHours()}h`, comandas });
    hora.setHours(hora.getHours() + 1);
  }
  return faixas;
}

function calcularMaisVendidos(
  itens: LinhaComandaMovimento['pedidos'][number]['pedido_itens'],
): ItemVendido[] {
  const porNome = new Map<string, number>();
  for (const item of itens) {
    const nome = item.item?.nome ?? 'Item removido';
    porNome.set(nome, (porNome.get(nome) ?? 0) + item.quantidade);
  }

  return Array.from(porNome, ([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome))
    .slice(0, TOP_MAIS_VENDIDOS);
}

/** O que precisa do gerente agora, do mais urgente para o menos. */
function calcularAlertas(
  linhas: LinhaComandaMovimento[],
  numeros: Map<string, string>,
  agora: Date,
): AlertaGerente[] {
  const alertas: AlertaGerente[] = [];
  const minutosDesde = (data: string) => Math.floor((agora.getTime() - tempo(data)) / 60_000);

  for (const linha of linhas) {
    const numero = numeros.get(linha.id)!;
    const local = linha.mesa ? `Mesa ${linha.mesa}` : 'Balcão';
    const cliente = nomeDoCliente(linha);
    const total = moeda(totalDaComanda(linha));

    if (linha.status === 'aguardando_pagamento') {
      const minutos = minutosDesde(linha.fechada_em ?? linha.criada_em);
      if (minutos >= MINUTOS_ALERTA.pagamento) {
        alertas.push({
          id: `pagamento-${linha.id}`,
          tipo: 'pagamento',
          titulo: `Comanda sem pagamento há ${duracao(minutos)}`,
          detalhe: `Comanda ${numero} · ${local} · ${cliente} · ${total}`,
          comanda: numero,
        });
      }
    }

    if (linha.status === 'aguardando_liberacao') {
      const minutos = minutosDesde(linha.criada_em);
      if (minutos >= MINUTOS_ALERTA.liberacao) {
        alertas.push({
          id: `liberacao-${linha.id}`,
          tipo: 'liberacao',
          titulo: `Comanda aguardando liberação há ${duracao(minutos)}`,
          detalhe: `${local} · ${cliente}`,
          comanda: null,
        });
      }
    }

    for (const pedido of linha.pedidos) {
      const minutos = minutosDesde(pedido.criado_em);
      if (minutos < MINUTOS_ALERTA.pedido_parado) continue;

      for (const setor of ['bar', 'cozinha'] as const) {
        const pendentes = pedido.pedido_itens.filter(
          (item) => item.item?.setor === setor && item.status !== 'pronto',
        );
        if (pendentes.length === 0) continue;

        alertas.push({
          id: `parado-${pedido.id}-${setor}`,
          tipo: 'pedido_parado',
          titulo: `Pedido parado há ${duracao(minutos)}`,
          detalhe:
            `Comanda ${numero} · ${setor === 'bar' ? 'Bar' : 'Cozinha'} · ` +
            pendentes.map((item) => `${item.quantidade}× ${item.item?.nome}`).join(', '),
          comanda: numero,
        });
      }
    }

    if (linha.status === 'aberta') {
      const ultimo =
        linha.pedidos
          .map((pedido) => pedido.criado_em)
          .sort()
          .at(-1) ?? linha.criada_em;
      const minutos = minutosDesde(ultimo);
      if (minutos >= MINUTOS_ALERTA.sem_pedido) {
        alertas.push({
          id: `sem-pedido-${linha.id}`,
          tipo: 'sem_pedido',
          titulo: `Comanda aberta há ${duracao(minutos)} sem novo pedido`,
          detalhe: `Comanda ${numero} · ${local} · ${total}`,
          comanda: numero,
        });
      }
    }
  }

  const ordem: AlertaGerente['tipo'][] = ['pagamento', 'pedido_parado', 'liberacao', 'sem_pedido'];
  return alertas.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo));
}

/**
 * Até quando a comanda ocupou o bar: o fechamento da conta; se ainda está
 * aberta, agora. Sem fechamento registrado, vale o último pedido.
 */
function fimDaComanda(linha: LinhaComandaMovimento, agora: Date): number {
  if (linha.fechada_em) return tempo(linha.fechada_em);
  if (linha.status === 'aberta' || linha.status === 'aguardando_liberacao') return agora.getTime();
  return Math.max(
    tempo(linha.criada_em),
    ...linha.pedidos.map((pedido) => tempo(pedido.criado_em)),
  );
}

function totalDaComanda(linha: LinhaComandaMovimento): number {
  return soma(
    linha.pedidos.flatMap((pedido) =>
      pedido.pedido_itens.map((item) => item.quantidade * item.preco_unitario),
    ),
  );
}

function nomeDoCliente(linha: LinhaComandaMovimento): string {
  return linha.cliente?.nome.trim() || 'Cliente';
}

function soma(valores: number[]): number {
  return valores.reduce((total, valor) => total + valor, 0);
}

function tempo(data: string): number {
  return new Date(data).getTime();
}

function horaMinuto(data: Date): string {
  return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
}

/** 25 -> '25 min'; 130 -> '2h10'; 180 -> '3h' */
function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h${String(resto).padStart(2, '0')}` : `${horas}h`;
}

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Parte de um todo em porcentagem inteira, limitada a 100. Sem todo, é zero. */
function percentual(parte: number, todo: number): number {
  if (todo <= 0) return 0;
  return Math.min(100, Math.round((parte / todo) * 100));
}
