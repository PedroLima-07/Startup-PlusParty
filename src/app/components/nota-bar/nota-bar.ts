import { Component, computed, input } from '@angular/core';

/** Com menos avaliações que isso, a média ainda diz pouco: o bar aparece como novo. */
export const MINIMO_AVALIACOES = 5;

/**
 * Nota do bar dada pelos clientes: "★ 4,6 (128 avaliações)". Bar com menos de
 * 5 avaliações mostra "Novo no +party" no lugar da média.
 */
@Component({
  selector: 'app-nota-bar',
  template: `
    @if (temNota()) {
      <span class="nota" [attr.aria-label]="'Nota ' + texto() + ' de 5, ' + quantidade()">
        <svg class="estrela" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l3 6.9 7.5.6-5.7 4.9 1.8 7.4L12 17.8 5.4 21.8l1.8-7.4L1.5 9.5 9 8.9z" />
        </svg>
        <strong>{{ texto() }}</strong>
        <span class="total" aria-hidden="true">({{ quantidade() }})</span>
      </span>
    } @else {
      <span class="novo">Novo no +party</span>
    }
  `,
  styleUrl: './nota-bar.scss',
})
export class NotaBar {
  readonly media = input<number | null>(null);
  readonly total = input<number | null>(0);

  protected readonly temNota = computed(
    () => this.media() !== null && (this.total() ?? 0) >= MINIMO_AVALIACOES,
  );
  /** 4.63 → "4,6" */
  protected readonly texto = computed(() => (this.media() ?? 0).toFixed(1).replace('.', ','));
  protected readonly quantidade = computed(() => {
    const total = this.total() ?? 0;
    return `${total} ${total === 1 ? 'avaliação' : 'avaliações'}`;
  });
}
