import { duracaoEspera } from '../../../../tempo';
import { CurrencyPipe } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { MINUTOS_ALERTA_PAGAMENTO, StatusComanda, StatusPedidoItem } from '../../../../models';
import { DetalheComanda as Detalhe, MovimentoService } from '../../../../services/movimento.service';
import { Icone } from '../../componentes/icone';

const ROTULOS_STATUS: Record<StatusComanda, string> = {
  aguardando_liberacao: 'Aguardando liberação',
  aberta: 'Aberta',
  aguardando_pagamento: 'Aguardando pagamento',
  paga: 'Paga',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
  nao_paga: 'Não paga',
};

const ROTULOS_ITEM: Record<StatusPedidoItem, string> = {
  novo: 'Novo',
  em_andamento: 'Em preparo',
  pronto: 'Pronto',
};

/**
 * Janela com os pedidos de uma comanda, aberta pelo Movimento. Fecha pelo X, pelo fundo ou pelo Esc.
 * Comanda esperando pagamento pode ser marcada como não paga, com confirmação.
 */
@Component({
  selector: 'app-detalhe-comanda',
  imports: [CurrencyPipe, Icone],
  templateUrl: './detalhe-comanda.html',
  styleUrls: ['./detalhe-comanda.scss', '../movimento.nao-paga.scss'],
  host: { '(document:keydown.escape)': 'aoApertarEsc()' },
})
export class DetalheComanda {
  protected readonly duracao = duracaoEspera;
  private movimento = inject(MovimentoService);

  readonly detalhe = input.required<Detalhe>();
  readonly fechar = output<void>();

  protected readonly limitePagamento = MINUTOS_ALERTA_PAGAMENTO;
  /** A confirmação de "não paga" está aberta por cima do detalhe. */
  protected readonly confirmandoNaoPaga = signal(false);
  protected readonly marcandoNaoPaga = signal(false);
  protected readonly erroNaoPaga = signal<string | null>(null);

  /** Enquanto grava, a janela não fecha. */
  protected pedirParaFechar(): void {
    if (this.marcandoNaoPaga()) return;
    this.fechar.emit();
  }

  /** Esc fecha primeiro a confirmação; com ela fechada, o detalhe. */
  protected aoApertarEsc(): void {
    if (this.confirmandoNaoPaga()) this.cancelarNaoPaga();
    else this.pedirParaFechar();
  }

  protected pedirConfirmacaoNaoPaga(): void {
    this.erroNaoPaga.set(null);
    this.confirmandoNaoPaga.set(true);
  }

  protected cancelarNaoPaga(): void {
    if (this.marcandoNaoPaga()) return;
    this.confirmandoNaoPaga.set(false);
    this.erroNaoPaga.set(null);
  }

  protected async confirmarNaoPaga(): Promise<void> {
    if (this.marcandoNaoPaga()) return;

    this.marcandoNaoPaga.set(true);
    this.erroNaoPaga.set(null);
    try {
      await this.movimento.marcarNaoPaga(this.detalhe().id);
      this.confirmandoNaoPaga.set(false);
    } catch {
      this.erroNaoPaga.set('Não foi possível marcar agora. Atualize o painel e tente de novo.');
    } finally {
      this.marcandoNaoPaga.set(false);
    }
  }

  protected rotuloStatus(status: StatusComanda): string {
    return ROTULOS_STATUS[status];
  }

  protected rotuloItem(status: StatusPedidoItem): string {
    return ROTULOS_ITEM[status];
  }
}
