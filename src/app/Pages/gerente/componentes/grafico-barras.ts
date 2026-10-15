import { Component, computed, input } from '@angular/core';

export interface Barra {
  rotulo: string;
  valor: number;
}

/** A barra mais alta; null quando nenhuma passa de zero. */
export function barraMaisAlta<T extends Barra>(barras: T[]): T | null {
  const maior = barras.reduce<T | null>(
    (atual, barra) => (!atual || barra.valor > atual.valor ? barra : atual),
    null,
  );
  return maior && maior.valor > 0 ? maior : null;
}

/**
 * Barras verticais com o valor em cima e o rótulo embaixo, a mais alta em
 * destaque. Usado no movimento por hora e no desempenho de cada atendente.
 */
@Component({
  selector: 'app-grafico-barras',
  template: `
    <ol class="barras" [attr.aria-label]="descricao()">
      @for (barra of dados(); track $index) {
        <li [class.pico]="barra === pico()">
          <span class="valor">{{ barra.valor }}</span>
          <span class="barra" [style.--altura]="altura(barra)"></span>
          <span class="rotulo">{{ barra.rotulo }}</span>
        </li>
      }
    </ol>
  `,
  styleUrl: './grafico-barras.scss',
})
export class GraficoBarras {
  readonly dados = input.required<Barra[]>();
  /** O que as barras medem, para leitores de tela. */
  readonly descricao = input.required<string>();

  protected readonly pico = computed(() => barraMaisAlta(this.dados()));

  /** Altura em relação à mais alta (0 a 100), com um mínimo para a barra não sumir. */
  protected altura(barra: Barra): number {
    const maior = this.pico()?.valor ?? 0;
    return maior > 0 ? Math.max(4, (barra.valor / maior) * 100) : 0;
  }
}
