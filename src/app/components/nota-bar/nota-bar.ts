import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-nota-bar',
  template: `
    <span class="nota" [class.maxima]="maxima()" [attr.aria-label]="'Avaliação ' + texto() + ' de 5'">
      <span class="estrela" aria-hidden="true">★</span>
      <span>{{ texto() }}</span>
      @if (maxima()) {
        <span class="selo">Nota máxima</span>
      }
    </span>
  `,
  styleUrl: './nota-bar.scss',
})
export class NotaBar {
  readonly nota = input<number | null>(null);

  protected readonly texto = computed(() => (this.nota() ?? 0).toFixed(1));
  protected readonly maxima = computed(() => (this.nota() ?? 0) >= 5);
}
