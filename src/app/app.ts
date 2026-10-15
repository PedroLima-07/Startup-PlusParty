import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AvisoNotificacao } from './components/aviso-notificacao/aviso-notificacao';
import { NotificacoesService } from './services/notificacoes.service';

@Component({
  imports: [AvisoNotificacao, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  constructor() {
    // Notificações acompanham o login em qualquer tela, não só na de avisos.
    inject(NotificacoesService).iniciar();
  }
}
