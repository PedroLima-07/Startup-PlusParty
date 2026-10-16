import { Component, inject, input } from '@angular/core';
import { NotificacoesService } from '../../services/notificacoes.service';

/**
 * Convite para ligar os avisos do navegador. A pergunta do navegador só
 * pode ser feita uma vez (se a pessoa recusar, o site não pergunta de novo),
 * então ela só aparece depois de a pessoa tocar em "Ativar avisos", com a
 * explicação na frente, e nunca sozinha ao abrir o site.
 */
@Component({
  selector: 'app-ativar-avisos',
  template: `
    @if (servico.oferecerAvisos()) {
      <section class="convite" aria-labelledby="titulo-avisos">
        <span class="sino" aria-hidden="true">🔔</span>
        <div class="corpo">
          <strong id="titulo-avisos">{{ titulo() }}</strong>
          <p>
            Avisamos quando a comanda for liberada e quando o pedido ficar pronto, mesmo com o
            +party em outra aba.
          </p>
          <div class="acoes">
            <button type="button" class="ligar" (click)="servico.ligarAvisos()">Ativar avisos</button>
            <button type="button" class="depois" (click)="servico.dispensarConvite()">Agora não</button>
          </div>
        </div>
      </section>
    } @else if (explicarBloqueio() && servico.permissao() === 'denied') {
      <p class="bloqueado">
        Os avisos do navegador estão bloqueados para o +party. Para ligar, toque no cadeado ao lado
        do endereço do site e permita as notificações. As novidades continuam aparecendo aqui.
      </p>
    }
  `,
  styleUrl: './ativar-avisos.scss',
})
export class AtivarAvisos {
  protected readonly servico = inject(NotificacoesService);

  readonly titulo = input('Quer ser avisado na hora?');
  /** Na tela de notificações, explica como desbloquear quem já recusou. */
  readonly explicarBloqueio = input(false);
}
