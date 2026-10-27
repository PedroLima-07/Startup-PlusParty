import { Component, input, output } from '@angular/core';

/**
 * Janela que pede confirmação antes de algo que não dá para desfazer
 * (apagar uma postagem, cancelar um evento). Fecha pelo fundo e pelo Esc.
 */
@Component({
  selector: 'app-confirmar',
  template: `
    <div class="fundo" (click)="cancelar.emit()">
      <section
        class="janela"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-confirmar"
        (click)="$event.stopPropagation()"
      >
        <h2 id="titulo-confirmar">{{ titulo() }}</h2>
        <p>{{ texto() }}</p>
        @if (erro(); as mensagem) {
          <p class="mensagem-erro" role="alert">{{ mensagem }}</p>
        }
        <div class="botoes">
          <button type="button" class="botao-contorno" (click)="cancelar.emit()">Cancelar</button>
          <button type="button" class="botao-perigo" [disabled]="ocupado()" (click)="confirmar.emit()">
            {{ ocupado() ? rotuloOcupado() : rotulo() }}
          </button>
        </div>
      </section>
    </div>
  `,
  styleUrl: './confirmar.scss',
  host: { '(document:keydown.escape)': 'aoEsc()' },
})
export class Confirmar {
  readonly titulo = input.required<string>();
  readonly texto = input.required<string>();
  /** Texto do botão vermelho, como "Apagar". */
  readonly rotulo = input.required<string>();
  /** Enquanto a ação acontece, como "Apagando...". */
  readonly rotuloOcupado = input('Aguarde...');
  readonly ocupado = input(false);
  readonly erro = input<string | null>(null);

  readonly confirmar = output<void>();
  readonly cancelar = output<void>();

  /** No meio da ação o Esc não fecha: a resposta ainda vai chegar. */
  protected aoEsc(): void {
    if (!this.ocupado()) this.cancelar.emit();
  }
}
