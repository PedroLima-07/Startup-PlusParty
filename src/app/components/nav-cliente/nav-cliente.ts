import { Component, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificacoesService } from '../../services/notificacoes.service';

/** Rotas que têm item no menu, na ordem em que aparecem. */
const ROTAS_DO_MENU = ['/cliente/home', '/cliente/discovery', '/cliente/novidades', '/cliente/notificacoes'];

// Cada tela cria o seu próprio menu. Guardar onde o destaque estava na tela
// anterior permite que ele deslize até o item novo em vez de só aparecer lá.
let ultimaPosicao: number | null = null;

@Component({
  selector: 'app-nav-cliente',
  imports: [RouterLink],
  templateUrl: './nav-cliente.html',
  styleUrl: './nav-cliente.scss',
})
export class NavCliente {
  private readonly router = inject(Router);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly auth = inject(AuthService);

  /** Índice do item em destaque; `null` nas telas que não têm item no menu. */
  protected readonly posicao = signal<number | null>(null);
  protected readonly naoLidas = inject(NotificacoesService).naoLidas;
  /** Quem está logado, para o cartão da conta no menu do desktop; `null` sem login. */
  protected readonly conta = signal<{ nome: string; inicial: string } | null>(null);
  protected readonly saindo = signal(false);

  constructor() {
    void this.carregarConta();

    const atual = this.posicaoDaRota();
    if (atual === null) return;

    this.posicao.set(ultimaPosicao ?? atual);
    ultimaPosicao = atual;

    afterNextRender(() => {
      // Ler o tamanho obriga o navegador a desenhar a posição antiga antes
      // da nova; sem isso a animação não teria de onde partir.
      void this.elemento.nativeElement.offsetWidth;
      this.posicao.set(atual);
    });
  }

  /** O perfil fica guardado desde o login: trocar de tela não vai ao banco. */
  private async carregarConta(): Promise<void> {
    try {
      const perfil = await this.auth.perfilAtual();
      if (!perfil) return;
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
