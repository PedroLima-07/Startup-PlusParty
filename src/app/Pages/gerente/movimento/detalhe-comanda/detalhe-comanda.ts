import { CurrencyPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { StatusComanda, StatusPedidoItem } from '../../../../models';
import { DetalheComanda as Detalhe } from '../../../../services/movimento.service';
import { Icone } from '../../componentes/icone';

const ROTULOS_STATUS: Record<StatusComanda, string> = {
  aguardando_liberacao: 'Aguardando liberação',
  aberta: 'Aberta',
  aguardando_pagamento: 'Aguardando pagamento',
  paga: 'Paga',
  recusada: 'Recusada',
};

const ROTULOS_ITEM: Record<StatusPedidoItem, string> = {
  novo: 'Novo',
  em_andamento: 'Em preparo',
  pronto: 'Pronto',
};

/** Janela com os pedidos de uma comanda, aberta pelo Movimento. Fecha pelo X, pelo fundo ou pelo Esc. */
@Component({
  selector: 'app-detalhe-comanda',
  imports: [CurrencyPipe, Icone],
  templateUrl: './detalhe-comanda.html',
  styleUrl: './detalhe-comanda.scss',
  host: { '(document:keydown.escape)': 'fechar.emit()' },
})
export class DetalheComanda {
  readonly detalhe = input.required<Detalhe>();
  readonly fechar = output<void>();

  protected rotuloStatus(status: StatusComanda): string {
    return ROTULOS_STATUS[status];
  }

  protected rotuloItem(status: StatusPedidoItem): string {
    return ROTULOS_ITEM[status];
  }
}
