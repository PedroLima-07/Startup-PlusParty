import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AvaliarExperiencia } from './components/avaliar-experiencia/avaliar-experiencia';
import { AvisoNotificacao } from './components/aviso-notificacao/aviso-notificacao';
import { AvaliacaoService } from './services/avaliacao.service';
import { NotificacoesService } from './services/notificacoes.service';

@Component({
  imports: [AvaliarExperiencia, AvisoNotificacao, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  constructor() {
    // Notificações acompanham o login em qualquer tela, não só na de avisos.
    inject(NotificacoesService).iniciar();
    // O pedido de avaliação volta a cada acesso até ser respondido ou dispensado.
    inject(AvaliacaoService).iniciar();
  }
}
