import { Component, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

/** Rotas que têm item no menu, na ordem em que aparecem. */
const ROTAS_DO_MENU = ['/cliente/home', '/cliente/discovery'];

// Cada tela cria o seu próprio menu. Guardar onde o destaque estava na tela
// anterior permite que ele deslize até o item novo em vez de só aparecer lá.
let ultimaPosicao: number | null = null;

@Component({
  selector: 'app-nav-cliente',
  imports: [RouterLink],
  templateUrl: './nav-cliente.html',
  styleUrl: './nav-cliente.scss',
})
export class NavCliente {
  private readonly router = inject(Router);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Índice do item em destaque; `null` nas telas que não têm item no menu. */
  protected readonly posicao = signal<number | null>(null);

  constructor() {
    const atual = this.posicaoDaRota();
    if (atual === null) return;

    this.posicao.set(ultimaPosicao ?? atual);
    ultimaPosicao = atual;

    afterNextRender(() => {
      // Ler o tamanho obriga o navegador a desenhar a posição antiga antes
      // da nova; sem isso a animação não teria de onde partir.
      void this.elemento.nativeElement.offsetWidth;
      this.posicao.set(atual);
    });
  }

  private posicaoDaRota(): number | null {
    const indice = ROTAS_DO_MENU.findIndex((rota) => this.router.url.startsWith(rota));
    return indice === -1 ? null : indice;
  }
}
