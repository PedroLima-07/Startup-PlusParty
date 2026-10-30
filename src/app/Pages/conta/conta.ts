import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NavCliente } from '../../components/nav-cliente/nav-cliente';
import { AuthService } from '../../services/auth.service';

/** O que a pessoa digita para confirmar que quer mesmo excluir. */
export const PALAVRA_DE_CONFIRMACAO = 'EXCLUIR';

/**
 * Minha conta (cliente): quem está logado, sair e excluir a conta (LGPD).
 * Excluir pede para digitar EXCLUIR, porque não dá para desfazer.
 */
@Component({
  selector: 'app-conta',
  imports: [FormsModule, NavCliente, RouterLink],
  templateUrl: './conta.html',
  styleUrl: './conta.scss',
})
export class ContaPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly palavra = PALAVRA_DE_CONFIRMACAO;
  protected readonly nome = signal('');
  protected readonly email = signal('');
  protected readonly excluindo = signal(false);
  protected readonly confirmando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected digitado = '';

  async ngOnInit(): Promise<void> {
    const [usuario, perfil] = await Promise.all([
      this.auth.usuarioAtual(),
      this.auth.perfilAtual().catch(() => null),
    ]);
    this.email.set(usuario?.email ?? '');
    this.nome.set(perfil?.nome ?? '');
  }

  protected async sair(): Promise<void> {
    await this.auth.sair();
    await this.router.navigateByUrl('/login');
  }

  protected abrirConfirmacao(): void {
    this.digitado = '';
    this.erro.set(null);
    this.confirmando.set(true);
  }

  protected async excluir(): Promise<void> {
    if (this.digitado.trim().toUpperCase() !== PALAVRA_DE_CONFIRMACAO || this.excluindo()) return;
    this.excluindo.set(true);
    this.erro.set(null);
    try {
      await this.auth.excluirConta();
      await this.router.navigateByUrl('/login?conta=excluida');
    } catch (e) {
      // O banco explica o motivo (comanda em andamento, conta da equipe...).
      this.erro.set(e instanceof Error && e.message ? e.message : 'Não foi possível excluir agora. Tente de novo.');
    } finally {
      this.excluindo.set(false);
    }
  }
}
