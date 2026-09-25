import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ComandaDetalhada, PedidoItemDetalhado, StatusPedidoItem } from '../../models';
import { ComandaService } from '../../services/comanda.service';
import { SupabaseService } from '../../services/supabase.service';

const ROTULOS_STATUS_ITEM: Record<StatusPedidoItem, string> = {
  novo: 'Enviado',
  em_andamento: 'Preparando',
  pronto: 'Pronto',
};

@Component({
  selector: 'app-comanda',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './comanda.html',
  styleUrl: './comanda.scss',
})
export class ComandaPage implements OnInit {
  private comandaService = inject(ComandaService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);

  id = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly comanda = signal<ComandaDetalhada | null>(null);
  protected readonly itens = signal<PedidoItemDetalhado[]>([]);
  protected readonly confirmandoRecebimento = signal(false);

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
      () => void this.carregarDados(true),
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
    this.itens.set(await this.comandaService.buscarItensPedidos(this.id()));
  }

  protected async verificarLiberacao(): Promise<void> {
    await this.carregarDados();
  }

  protected abrirConfirmacaoRecebimento(): void {
    this.confirmandoRecebimento.set(true);
  }

  protected cancelarFechamento(): void {
    this.confirmandoRecebimento.set(false);
  }

  protected async confirmarFechamento(): Promise<void> {
    await this.comandaService.fecharConta(this.id());
    this.confirmandoRecebimento.set(false);
    await this.carregarDados();
  }

  /** `silencioso` recarrega sem trocar a tela por "Carregando...". */
  private async carregarDados(silencioso = false): Promise<void> {
    if (!silencioso) this.carregando.set(true);
    const [comanda, itens] = await Promise.all([
      this.comandaService.buscarComanda(this.id()),
      this.comandaService.buscarItensPedidos(this.id()),
    ]);
    this.comanda.set(comanda);
    this.itens.set(itens);
    this.carregando.set(false);
  }
}
