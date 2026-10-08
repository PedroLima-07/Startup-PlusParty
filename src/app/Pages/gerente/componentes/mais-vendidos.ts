import { Component, computed, input } from '@angular/core';
import { ItemVendido } from '../../../models';

/** Lista dos itens mais pedidos, com uma barra proporcional ao primeiro colocado. */
@Component({
  selector: 'app-mais-vendidos',
  template: `
    <ol>
      @for (item of itens(); track item.nome; let posicao = $index) {
        <li [class.primeiro]="posicao === 0">
          <span class="posicao">{{ posicao + 1 }}</span>
          <span class="nome">{{ item.nome }}</span>
          <strong class="quantidade">{{ item.quantidade }}</strong>
          <span class="trilho"><span [style.width.%]="largura(item)"></span></span>
        </li>
      } @empty {
        <li class="vazio">Nenhum item pedido ainda.</li>
      }
    </ol>
  `,
  styleUrl: './mais-vendidos.scss',
})
export class MaisVendidos {
  /** Já em ordem, do mais para o menos vendido. */
  readonly itens = input.required<ItemVendido[]>();

  private readonly maior = computed(() =>
    Math.max(0, ...this.itens().map((item) => item.quantidade)),
  );

  protected largura(item: ItemVendido): number {
    return this.maior() > 0 ? (item.quantidade / this.maior()) * 100 : 0;
  }
}
