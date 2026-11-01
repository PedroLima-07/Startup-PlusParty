import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';

const DURACAO_GIRO_MS = 700;

/** Botão Atualizar do atendente: as setas giram uma vez a cada toque. */
@Component({
  selector: 'app-botao-atualizar',
  templateUrl: './botao-atualizar.html',
  styleUrl: './botao-atualizar.scss',
})
export class BotaoAtualizar {
  readonly desabilitado = input(false);
  readonly atualizar = output<void>();

  protected readonly girando = signal(false);
  private espera: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.espera));
  }

  protected tocar(): void {
    clearTimeout(this.espera);
    this.girando.set(true);
    this.espera = setTimeout(() => this.girando.set(false), DURACAO_GIRO_MS);
    this.atualizar.emit();
  }
}
