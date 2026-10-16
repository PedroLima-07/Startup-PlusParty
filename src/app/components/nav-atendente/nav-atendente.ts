import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ComandasAtendenteService } from '../../services/comandas-atendente.service';
import { SupabaseService } from '../../services/supabase.service';

/**
 * Navegação do atendente: Pedidos e Comandas. No celular é a barra de baixo;
 * no desktop vira a coluna da esquerda, com o bar, quem está logado e o Sair.
 * O ícone de Comandas leva o contador de pendências, para ele perceber que
 * tem alguém esperando liberação ou pagamento mesmo sem sair de Pedidos.
 */
@Component({
  selector: 'app-nav-atendente',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav-atendente.html',
  styleUrls: ['./nav-atendente.scss', './nav-atendente.desktop.scss'],
})
export class NavAtendente implements OnInit {
  private comandasService = inject(ComandasAtendenteService);
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  /**
   * Se o próprio menu busca e acompanha a contagem. A aba Comandas desliga:
   * ela já recarrega a lista, e a contagem sai de lá sem outra consulta.
   */
  readonly acompanhar = input(true);

  protected readonly pendencias = this.comandasService.pendencias;
  protected readonly nomeDoBar = signal('');
  protected readonly nomeDoUsuario = signal('');

  protected readonly iniciais = computed(() => {
    const partes = this.nomeDoUsuario().trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (partes[0][0] + ultima).toUpperCase();
  });

  async ngOnInit(): Promise<void> {
    // O perfil já fica guardado depois do login: não é outra consulta ao banco.
    void this.authService
      .perfilAtual()
      .then((perfil) => {
        this.nomeDoBar.set(perfil?.estabelecimento?.nome ?? '');
        this.nomeDoUsuario.set(perfil?.nome ?? '');
      })
      .catch(() => undefined);

    if (!this.acompanhar()) return;

    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'comandas' }],
      () => void this.contar(),
    );
    this.destroyRef.onDestroy(pararDeEscutar);

    await this.contar();
  }

  protected async sair(): Promise<void> {
    await this.authService.sair();
    await this.router.navigateByUrl('/login');
  }

  /** O contador é um aviso a mais: se a contagem falhar, a tela segue funcionando. */
  private async contar(): Promise<void> {
    try {
      const estabelecimentoId = (await this.authService.perfilAtual())?.estabelecimento?.id;
      if (estabelecimentoId) await this.comandasService.atualizarPendencias(estabelecimentoId);
    } catch {
      // Fica com a última contagem conhecida.
    }
  }
}
