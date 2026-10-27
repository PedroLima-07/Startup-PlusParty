import { Component, ViewContainerRef, effect, inject, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AvisoNotificacao } from './components/aviso-notificacao/aviso-notificacao';
import { AvaliacaoService } from './services/avaliacao.service';
import { NotificacoesService } from './services/notificacoes.service';

@Component({
  imports: [AvisoNotificacao, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly lugarDaAvaliacao = viewChild('avaliacao', { read: ViewContainerRef });
  private avaliacaoCarregada = false;

  constructor() {
    // Notificações acompanham o login em qualquer tela, não só na de avisos.
    inject(NotificacoesService).iniciar();

    // O pedido de avaliação volta a cada acesso até ser respondido ou dispensado.
    // A tela dele só é baixada quando há um pedido: quem não tem nada a
    // avaliar não carrega esse código.
    const avaliacao = inject(AvaliacaoService);
    avaliacao.iniciar();
    effect(() => {
      const lugar = this.lugarDaAvaliacao();
      if (!avaliacao.pendente() || !lugar || this.avaliacaoCarregada) return;
      this.avaliacaoCarregada = true;
      void import('./components/avaliar-experiencia/avaliar-experiencia').then(({ AvaliarExperiencia }) =>
        lugar.createComponent(AvaliarExperiencia),
      );
    });
  }
}
