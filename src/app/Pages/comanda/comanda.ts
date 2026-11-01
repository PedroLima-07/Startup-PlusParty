import { ItensNaoRecebidosService } from '../../services/itens-nao-recebidos.service';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  ComandaDetalhada,
  ItemNaoRecebido,
  MOTIVOS_ITEM_NAO_RECEBIDO,
  MINUTOS_ALERTA_PAGAMENTO,
  PedidoItemDetalhado,
  StatusPedidoItem,
} from '../../models';
import { AvaliacaoService } from '../../services/avaliacao.service';
import { ComandaService } from '../../services/comanda.service';
import { SupabaseService } from '../../services/supabase.service';
import { NavCliente } from '../../components/nav-cliente/nav-cliente';
import { Carregando } from '../../components/carregando/carregando';
import { ErroCarregar } from '../../components/erro-carregar/erro-carregar';
import { AtivarAvisos } from '../../components/ativar-avisos/ativar-avisos';
import { minutosDesde, relogio, duracaoEspera } from '../../tempo';

const ROTULOS_STATUS_ITEM: Record<StatusPedidoItem, string> = {
  novo: 'Enviado',
  em_andamento: 'Preparando',
  pronto: 'Pronto',
};

@Component({
  selector: 'app-comanda',
  imports: [AtivarAvisos, Carregando, CurrencyPipe, DatePipe, ErroCarregar, NavCliente, RouterLink],
  templateUrl: './comanda.html',
  styleUrls: ['./comanda.scss', './comanda.conta.scss', './comanda.fechar.scss'],
  host: { '(document:keydown.escape)': 'cancelarFechamento()' },
})
export class ComandaPage implements OnInit {
  private comandaService = inject(ComandaService);
  private readonly itensNaoRecebidos = inject(ItensNaoRecebidosService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private avaliacao = inject(AvaliacaoService);
  private agora = relogio();

  id = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly comanda = signal<ComandaDetalhada | null>(null);
  protected readonly itens = signal<PedidoItemDetalhado[]>([]);
  protected readonly confirmandoRecebimento = signal(false);
  /** Segunda etapa do fechamento: o motivo de fechar sem algum item. */
  protected readonly pedindoMotivo = signal(false);
  protected readonly prontosNaoRecebidos = signal<ReadonlySet<string>>(new Set());
  protected readonly motivoRapido = signal('');
  protected readonly motivoTexto = signal('');
  protected readonly motivos = MOTIVOS_ITEM_NAO_RECEBIDO;
  protected readonly naoCobrados = signal<ItemNaoRecebido[]>([]);
  protected readonly itensPendentes = computed(() => this.itens().filter((i) => i.status !== 'pronto'));
  protected readonly itensProntos = computed(() => this.itens().filter((i) => i.status === 'pronto'));
  private readonly itensRecebidos = computed(() =>
    this.itensProntos().filter((i) => !this.prontosNaoRecebidos().has(i.id)),
  );
  protected readonly totalAoFechar = computed(() => this.comandaService.calcularTotal(this.itensRecebidos()));
  protected readonly algoNaoRecebido = computed(
    () => this.itensPendentes().length > 0 || this.prontosNaoRecebidos().size > 0,
  );
  protected readonly motivoFinal = computed(() =>
    [this.motivoRapido(), this.motivoTexto().trim()].filter(Boolean).join(': '),
  );
  protected readonly cancelando = signal(false);
  protected readonly erroCancelamento = signal<string | null>(null);
  protected readonly erroCarregar = signal(false);
  /** Falha ao atualizar com a comanda já na tela: avisa sem esconder o que já está lá. */
  protected readonly avisoAtualizacao = signal<string | null>(null);
  protected readonly atualizando = signal(false);
  protected readonly fechando = signal(false);
  protected readonly erroFechamento = signal<string | null>(null);

  protected readonly total = computed(() => this.comandaService.calcularTotal(this.itens()));

  /** Conta fechada (esperando pagamento), paga ou registrada como não paga. */
  protected readonly comandaEncerrada = computed(() => {
    const status = this.comanda()?.status;
    return status === 'aguardando_pagamento' || status === 'paga' || status === 'nao_paga';
  });

  protected readonly esperandoPagamento = computed(
    () => this.comanda()?.status === 'aguardando_pagamento',
  );

  /** Minutos desde que o cliente fechou a conta; null se ela não está fechada. */
  protected readonly duracao = duracaoEspera;
  protected readonly minutosEsperandoPagamento = computed(() => {
    const fechadaEm = this.comanda()?.fechada_em;
    return this.esperandoPagamento() && fechadaEm ? minutosDesde(fechadaEm, this.agora()) : null;
  });

  /** Passou do prazo: o atendente e o gerente já receberam o alerta. */
  protected readonly pagamentoAtrasado = computed(
    () => (this.minutosEsperandoPagamento() ?? 0) >= MINUTOS_ALERTA_PAGAMENTO,
  );

  protected readonly cancelada = computed(() => this.comanda()?.status === 'cancelada');

  /** O atendente não confirmou a presença: esta comanda acabou, mas dá para abrir outra. */
  protected readonly recusada = computed(() => this.comanda()?.status === 'recusada');

  protected readonly aguardandoLiberacao = computed(
    () => this.comanda()?.status === 'aguardando_liberacao'
  );

  async ngOnInit(): Promise<void> {
    // Atualiza sozinha quando o atendente libera ou recusa, avança um item ou confirma o pagamento.
    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'comandas', filtro: `id=eq.${this.id()}` }, { tabela: 'pedido_itens' }],
      () => {
        // Durante o cancelamento a tela já vai sair; recarregar só piscaria.
        if (!this.cancelando()) void this.carregarDados(true);
      },
    );
    this.destroyRef.onDestroy(pararDeEscutar);

    await this.carregarDados();
  }

  protected rotuloLocal(comanda: ComandaDetalhada): string {
    return comanda.mesa ? `Mesa ${comanda.mesa}` : 'Balcão';
  }

  protected rotuloStatusItem(status: StatusPedidoItem): string {
    return ROTULOS_STATUS_ITEM[status];
  }

  protected async atualizarStatus(): Promise<void> {
    await this.carregarDados(true);
  }

  protected async verificarLiberacao(): Promise<void> {
    await this.carregarDados(true);
  }

  protected async tentarDeNovo(): Promise<void> {
    await this.carregarDados();
  }

  protected async cancelarSolicitacao(): Promise<void> {
    if (this.cancelando()) return;

    this.cancelando.set(true);
    this.erroCancelamento.set(null);

    try {
      if (await this.comandaService.cancelarSolicitacao(this.id())) {
        await this.router.navigateByUrl('/cliente/home');
        return;
      }

      // Não cancelou: o atendente liberou antes. Mostra a comanda como está.
      this.cancelando.set(false);
      await this.carregarDados();
    } catch {
      this.erroCancelamento.set('Não foi possível cancelar agora. Tente novamente.');
      this.cancelando.set(false);
    }
  }

  protected abrirConfirmacaoRecebimento(): void {
    this.prontosNaoRecebidos.set(new Set());
    this.motivoRapido.set('');
    this.motivoTexto.set('');
    this.pedindoMotivo.set(false);
    this.confirmandoRecebimento.set(true);
  }

  protected alternarNaoRecebido(id: string): void {
    this.prontosNaoRecebidos.update((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  }

  protected alternarMotivo(motivo: string): void {
    this.motivoRapido.update((atual) => (atual === motivo ? '' : motivo));
  }

  protected aoDigitarMotivo(evento: Event): void {
    this.motivoTexto.set((evento.target as HTMLTextAreaElement).value);
  }

  protected voltarDoMotivo(): void {
    this.pedindoMotivo.set(false);
  }

  protected cancelarFechamento(): void {
    this.confirmandoRecebimento.set(false);
    this.pedindoMotivo.set(false);
    this.erroFechamento.set(null);
  }

  protected async confirmarFechamento(): Promise<void> {
    if (this.fechando()) return;
    if (this.algoNaoRecebido() && !this.pedindoMotivo()) {
      this.pedindoMotivo.set(true);
      return;
    }
    if (this.pedindoMotivo() && !this.motivoFinal()) return;

    this.fechando.set(true);
    this.erroFechamento.set(null);

    try {
      if (this.algoNaoRecebido()) {
        await this.comandaService.fecharContaSemItens(this.id(), [...this.prontosNaoRecebidos()], this.motivoFinal());
      } else {
        await this.comandaService.fecharConta(this.id());
      }
      this.confirmandoRecebimento.set(false);
      this.pedindoMotivo.set(false);
      await this.carregarDados(true);
    } catch {
      this.erroFechamento.set('Não foi possível fechar a conta agora. Tente de novo.');
    } finally {
      this.fechando.set(false);
    }
  }

  /**
   * `silencioso` recarrega sem trocar a tela pela ampulheta. Se a comanda já
   * está na tela, uma falha vira um aviso; sem comanda, vira a tela de erro.
   */
  private async carregarDados(silencioso = false): Promise<void> {
    if (silencioso) this.atualizando.set(true);
    else this.carregando.set(true);
    this.erroCarregar.set(false);
    this.avisoAtualizacao.set(null);

    try {
      const [comanda, itens] = await Promise.all([
        this.comandaService.buscarComanda(this.id()),
        this.comandaService.buscarItensPedidos(this.id()),
      ]);
      const acabouDePagar = comanda.status === 'paga' && this.comanda()?.status !== 'paga';
      this.comanda.set(comanda);
      this.itens.set(itens);
      if (comanda?.status !== 'aberta') {
        this.itensNaoRecebidos.daComanda(this.id()).then((lista) => this.naoCobrados.set(lista)).catch(() => undefined);
      }
      // Pagamento confirmado: o pedido de avaliação aparece na hora.
      if (acabouDePagar) void this.avaliacao.verificar();
    } catch {
      if (this.comanda()) {
        this.avisoAtualizacao.set('Não foi possível atualizar a comanda agora. Tente de novo.');
      } else {
        this.erroCarregar.set(true);
      }
    } finally {
      this.carregando.set(false);
      this.atualizando.set(false);
    }
  }
}
