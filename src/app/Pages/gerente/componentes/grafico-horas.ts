import { Component, computed, input } from '@angular/core';
import { LotacaoPorHora } from '../../../models';
import { GraficoBarras, barraMaisAlta } from './grafico-barras';

/** Barras de comandas abertas por faixa de horário, com o pico em destaque. */
@Component({
  selector: 'app-grafico-horas',
  imports: [GraficoBarras],
  template: `
    @if (pico(); as p) {
      <app-grafico-barras [dados]="barras()" descricao="Comandas abertas por hora" />
      <p class="resumo">
        Seu pico foi às <strong>{{ p.rotulo }}</strong
        >, com {{ p.valor }} comandas abertas ao mesmo tempo.
      </p>
    } @else {
      <p class="resumo">Ainda não há movimento registrado hoje.</p>
    }
  `,
  styleUrl: './grafico-horas.scss',
})
export class GraficoHoras {
  readonly dados = input.required<LotacaoPorHora[]>();

  protected readonly barras = computed(() =>
    this.dados().map((faixa) => ({ rotulo: faixa.hora, valor: faixa.comandas })),
  );

  /** A faixa mais cheia; null enquanto não houver nenhuma comanda. */
  protected readonly pico = computed(() => barraMaisAlta(this.barras()));
}
