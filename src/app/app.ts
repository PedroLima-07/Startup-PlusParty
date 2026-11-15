import { Component, ViewContainerRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AvisoNotificacao } from './components/aviso-notificacao/aviso-notificacao';
import { NavCliente, ROTAS_DO_MENU } from './components/nav-cliente/nav-cliente';
import { AvaliacaoService } from './services/avaliacao.service';
import { NotificacoesService } from './services/notificacoes.service';

@Component({
  imports: [AvisoNotificacao, NavCliente, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly lugarDaAvaliacao = viewChild('avaliacao', { read: ViewContainerRef });
  private avaliacaoCarregada = false;

  private readonly router = inject(Router);
  private readonly url = signal(this.router.url);

  /**
   * Área do cliente: nas quatro telas do menu ele aparece inteiro; nas demais
   * (perfil do bar, comanda…) só como menu lateral do desktop.
   */
  protected readonly menuCliente = computed<'completo' | 'desktop' | null>(() => {
    const url = this.url();
    if (!url.startsWith('/cliente/')) return null;
    return ROTAS_DO_MENU.some((rota) => url.startsWith(rota)) ? 'completo' : 'desktop';
  });

  constructor() {
    this.router.events.subscribe((evento) => {
      if (evento instanceof NavigationEnd) this.url.set(evento.urlAfterRedirects);
    });

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
