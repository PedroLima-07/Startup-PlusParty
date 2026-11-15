import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Logo } from '../logo/logo';
import { AuthService } from '../../services/auth.service';
import { NotificacoesService } from '../../services/notificacoes.service';

/** Rotas que têm item no menu, na ordem em que aparecem. */
export const ROTAS_DO_MENU = ['/cliente/home', '/cliente/discovery', '/cliente/novidades', '/cliente/notificacoes'];

@Component({
  selector: 'app-nav-cliente',
  imports: [Logo, RouterLink],
  templateUrl: './nav-cliente.html',
  styleUrl: './nav-cliente.scss',
})
export class NavCliente {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Índice do item em destaque; `null` nas telas que não têm item no menu. */
  protected readonly posicao = signal<number | null>(null);
  protected readonly naoLidas = inject(NotificacoesService).naoLidas;
  /** Quem está logado, para o cartão da conta no menu do desktop; `null` sem login. */
  protected readonly conta = signal<{ nome: string; inicial: string } | null>(null);
  protected readonly saindo = signal(false);

  constructor() {
    this.acompanharRota();
    // O menu existe uma vez só (na raiz do app) e segue a rota: o destaque
    // desliza até o item novo, e o cartão da conta acompanha login e saída.
    this.router.events.pipe(takeUntilDestroyed()).subscribe((evento) => {
      if (evento instanceof NavigationEnd) this.acompanharRota();
    });
  }

  /** O destaque sai no toque, sem esperar a tela nova carregar. */
  protected destacar(indice: number): void {
    this.posicao.set(indice);
  }

  private acompanharRota(): void {
    this.posicao.set(this.posicaoDaRota());
    void this.carregarConta();
  }

  /** O perfil fica guardado desde o login: trocar de tela não vai ao banco. */
  private async carregarConta(): Promise<void> {
    try {
      const perfil = await this.auth.perfilAtual();
      if (!perfil) {
        this.conta.set(null);
        return;
      }
      const nome = perfil.nome.trim().split(/\s+/)[0] || 'Você';
      this.conta.set({ nome, inicial: nome.charAt(0).toUpperCase() });
    } catch {
      // Sem o perfil, o menu só fica sem o cartão da conta.
    }
  }

  protected async sair(): Promise<void> {
    if (this.saindo()) return;
    this.saindo.set(true);
    try {
      await this.auth.sair();
      await this.router.navigateByUrl('/login');
    } finally {
      this.saindo.set(false);
    }
  }

  private posicaoDaRota(): number | null {
    const indice = ROTAS_DO_MENU.findIndex((rota) => this.router.url.startsWith(rota));
    return indice === -1 ? null : indice;
  }
}
