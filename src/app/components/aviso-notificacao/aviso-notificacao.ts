import { Component, inject } from '@angular/core';
import { NotificacoesService } from '../../services/notificacoes.service';
import { ICONE_NOTIFICACAO } from './icone-notificacao';

/**
 * Aviso no topo da tela quando chega uma notificação com o app aberto.
 * Fica no App, então aparece em qualquer tela. Tocar abre a tela dela.
 */
@Component({
  selector: 'app-aviso-notificacao',
  template: `
    <div class="regiao" aria-live="polite">
      @if (servico.avisoNaTela(); as aviso) {
        <div class="aviso" [attr.data-tipo]="aviso.tipo">
          <button type="button" class="conteudo" (click)="servico.abrir(aviso)">
            <span class="icone" aria-hidden="true">{{ icones[aviso.tipo] }}</span>
            <span class="texto">
              <strong>{{ aviso.titulo }}</strong>
              @if (aviso.texto) {
                <span>{{ aviso.texto }}</span>
              }
            </span>
          </button>
          <button type="button" class="fechar" aria-label="Fechar aviso" (click)="servico.fecharAviso()">
            ×
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './aviso-notificacao.scss',
})
export class AvisoNotificacao {
  protected readonly servico = inject(NotificacoesService);
  protected readonly icones = ICONE_NOTIFICACAO;
}
