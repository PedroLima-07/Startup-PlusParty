import { Component, computed, input } from '@angular/core';

/** Foto de perfil redonda; sem foto, as iniciais do nome. */
@Component({
  selector: 'app-avatar',
  template: `
    @if (foto(); as endereco) {
      <img [src]="endereco" alt="" />
    } @else {
      <span aria-hidden="true">{{ iniciais() }}</span>
    }
  `,
  host: {
    '[style.--tamanho]': "tamanho() + 'px'",
  },
  styles: `
    :host {
      width: var(--tamanho);
      height: var(--tamanho);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 50%;
      background: #0f1f4b;
      color: #fff;
      font-size: calc(var(--tamanho) * 0.36);
      font-weight: 700;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
})
export class Avatar {
  readonly nome = input.required<string>();
  readonly foto = input<string | null>(null);
  readonly tamanho = input(40);

  /** Primeira letra do primeiro e do último nome: "Ana Lima" vira "AL". */
  protected readonly iniciais = computed(() => {
    const partes = this.nome().trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    const primeira = partes[0].charAt(0);
    const ultima = partes.length > 1 ? partes[partes.length - 1].charAt(0) : '';
    return (primeira + ultima).toUpperCase();
  });
}
