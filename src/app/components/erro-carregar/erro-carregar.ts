import { Component, input, output } from '@angular/core';

/** Mostrado no lugar da tela quando os dados dela não puderam ser carregados. */
@Component({
  selector: 'app-erro-carregar',
  template: `
    <div class="erro" role="alert">
      <svg class="icone" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <p class="mensagem">{{ mensagem() }}</p>
      <button type="button" class="botao" (click)="tentarDeNovo.emit()">Tentar de novo</button>
    </div>
  `,
  styleUrl: './erro-carregar.scss',
})
export class ErroCarregar {
  readonly mensagem = input('Não foi possível carregar agora. Verifique sua conexão.');
  readonly tentarDeNovo = output<void>();
}
