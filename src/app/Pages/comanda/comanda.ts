import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ComandaDetalhada, PedidoItemDetalhado, StatusPedidoItem } from '../../models';
import { ComandaService } from '../../services/comanda.service';
import { SupabaseService } from '../../services/supabase.service';
import { NavCliente } from '../../components/nav-cliente/nav-cliente';
import { Carregando } from '../../components/carregando/carregando';
import { ErroCarregar } from '../../components/erro-carregar/erro-carregar';

const ROTULOS_STATUS_ITEM: Record<StatusPedidoItem, string> = {
  novo: 'Enviado',
  em_andamento: 'Preparando',
  pronto: 'Pronto',
};

@Component({
  selector: 'app-comanda',
  imports: [Carregando, CurrencyPipe, ErroCarregar, NavCliente, RouterLink],
  templateUrl: './comanda.html',
  styleUrl: './comanda.scss',
})
export class ComandaPage implements OnInit {
  private comandaService = inject(ComandaService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  id = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly comanda = signal<ComandaDetalhada | null>(null);
  protected readonly itens = signal<PedidoItemDetalhado[]>([]);
  protected readonly confirmandoRecebimento = signal(false);
  protected readonly cancelando = signal(false);
  protected readonly erroCancelamento = signal<string | null>(null);
  protected readonly erroCarregar = signal(false);
  /** Falha ao atualizar com a comanda já na tela: avisa sem esconder o que já está lá. */
  protected readonly avisoAtualizacao = signal<string | null>(null);
  protected readonly atualizando = signal(false);
  protected readonly fechando = signal(false);
  protected readonly erroFechamento = signal<string | null>(null);

  protected readonly total = computed(() => this.comandaService.calcularTotal(this.itens()));

  protected readonly comandaEncerrada = computed(() => {
    const status = this.comanda()?.status;
    return status === 'aguardando_pagamento' || status === 'paga';
  });

  protected readonly aguardandoLiberacao = computed(
    () => this.comanda()?.status === 'aguardando_liberacao'
  );

  async ngOnInit(): Promise<void> {
    // Atualiza sozinha quando o atendente libera, avança um item ou confirma o pagamento.
    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'comandas', filtro: `id=eq.${this.id()}` }, { tabela: 'pedido_itens' }],
      () => {
        // Durante o cancelamento a comanda some do banco; recarregar daria erro.
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
    this.confirmandoRecebimento.set(true);
  }

  protected cancelarFechamento(): void {
    this.confirmandoRecebimento.set(false);
    this.erroFechamento.set(null);
  }

  protected async confirmarFechamento(): Promise<void> {
    if (this.fechando()) return;

    this.fechando.set(true);
    this.erroFechamento.set(null);

    try {
      await this.comandaService.fecharConta(this.id());
      this.confirmandoRecebimento.set(false);
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
      this.comanda.set(comanda);
      this.itens.set(itens);
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
