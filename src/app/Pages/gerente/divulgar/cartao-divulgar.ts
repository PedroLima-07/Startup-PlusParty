import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icone } from '../componentes/icone';

/** Preferência de cada gerente neste navegador: quando dispensou o cartão. */
const CHAVE = 'gerente.divulgar.dispensadoEm';
const VOLTA_DEPOIS_MS = 7 * 24 * 60 * 60 * 1000;

/** O cartão aparece se nunca foi dispensado ou se já passaram 7 dias. */
export function cartaoDivulgarVisivel(agora = Date.now()): boolean {
  try {
    const dispensado = Number(localStorage.getItem(CHAVE));
    return !dispensado || agora - dispensado >= VOLTA_DEPOIS_MS;
  } catch {
    // Sem acesso ao armazenamento (janela anônima, bloqueio): o cartão aparece.
    return true;
  }
}

/**
 * Convite no Movimento para a página Divulgar meu bar. Pode ser dispensado e
 * volta depois de 7 dias.
 */
@Component({
  selector: 'app-cartao-divulgar',
  imports: [Icone, RouterLink],
  template: `
    @if (visivel()) {
      <section class="cartao" aria-labelledby="titulo-divulgar">
        <span class="icone" aria-hidden="true"><app-icone nome="compartilhar" /></span>
        <div class="texto">
          <h2 id="titulo-divulgar">Divulgue o +party no seu bar</h2>
          <p>Imagem para o Story e textos prontos para chamar os clientes.</p>
          <a routerLink="/gerente/divulgar">Ver materiais <app-icone nome="seta" /></a>
        </div>
        <button
          type="button"
          class="dispensar"
          aria-label="Dispensar por 7 dias"
          title="Dispensar por 7 dias"
          (click)="dispensar()"
        >
          <app-icone nome="fechar" />
        </button>
      </section>
    }
  `,
  styleUrl: './cartao-divulgar.scss',
})
export class CartaoDivulgar {
  protected readonly visivel = signal(cartaoDivulgarVisivel());

  protected dispensar(): void {
    try {
      localStorage.setItem(CHAVE, String(Date.now()));
    } catch {
      // Sem armazenamento, some só até recarregar a página.
    }
    this.visivel.set(false);
  }
}
