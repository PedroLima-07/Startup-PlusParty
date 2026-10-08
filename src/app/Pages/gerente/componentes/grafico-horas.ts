import { Component, computed, input } from '@angular/core';
import { LotacaoPorHora } from '../../../models';

/** Barras de comandas abertas por faixa de horário, com o pico em destaque. */
@Component({
  selector: 'app-grafico-horas',
  template: `
    @if (pico(); as p) {
      <ol class="barras" aria-label="Comandas abertas por hora">
        @for (faixa of dados(); track faixa.hora) {
          <li [class.pico]="faixa === p">
            <span class="valor">{{ faixa.comandas }}</span>
            <span class="barra" [style.--altura]="altura(faixa)"></span>
            <span class="hora">{{ faixa.hora }}</span>
          </li>
        }
      </ol>
      <p class="resumo">
        Seu pico foi às <strong>{{ p.hora }}</strong
        >, com {{ p.comandas }} comandas abertas ao mesmo tempo.
      </p>
    } @else {
      <p class="resumo">Ainda não há movimento registrado hoje.</p>
    }
  `,
  styleUrl: './grafico-horas.scss',
})
export class GraficoHoras {
  readonly dados = input.required<LotacaoPorHora[]>();

  /** A faixa mais cheia; null enquanto não houver nenhuma comanda. */
  protected readonly pico = computed(() => {
    const maior = this.dados().reduce<LotacaoPorHora | null>(
      (atual, faixa) => (!atual || faixa.comandas > atual.comandas ? faixa : atual),
      null,
    );
    return maior && maior.comandas > 0 ? maior : null;
  });

  /** Altura da barra em relação ao pico (0 a 100), com um mínimo para ela não sumir. */
  protected altura(faixa: LotacaoPorHora): number {
    const pico = this.pico()?.comandas ?? 0;
    return pico > 0 ? Math.max(4, (faixa.comandas / pico) * 100) : 0;
  }
}
