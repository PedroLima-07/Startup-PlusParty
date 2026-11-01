import { Component, ElementRef, afterNextRender, input, signal, viewChild } from '@angular/core';

const CHAVE_ULTIMA_COMANDA_AVISADA = 'comanda.avisoCobranca';

/** Explica a regra de cobrança uma vez por comanda, assim que ela é liberada. */
@Component({
  selector: 'app-aviso-cobranca',
  templateUrl: './aviso-cobranca.html',
  styleUrl: './aviso-cobranca.scss',
})
export class AvisoCobranca {
  readonly comandaId = input.required<string>();

  protected readonly dispensado = signal(false);
  private readonly dialogo = viewChild<ElementRef<HTMLDialogElement>>('dialogo');

  constructor() {
    afterNextRender(() => {
      if (this.jaViu()) {
        this.dispensado.set(true);
        return;
      }
      this.dialogo()?.nativeElement.showModal?.();
    });
  }

  protected entendi(): void {
    this.dispensado.set(true);
    try {
      localStorage.setItem(CHAVE_ULTIMA_COMANDA_AVISADA, this.comandaId());
    } catch {
      // Sem armazenamento, o aviso só volta se a página for aberta de novo.
    }
  }

  private jaViu(): boolean {
    try {
      return localStorage.getItem(CHAVE_ULTIMA_COMANDA_AVISADA) === this.comandaId();
    } catch {
      return false;
    }
  }
}
