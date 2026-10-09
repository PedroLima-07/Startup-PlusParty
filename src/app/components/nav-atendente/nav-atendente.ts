import { Component, DestroyRef, OnInit, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ComandasAtendenteService } from '../../services/comandas-atendente.service';
import { SupabaseService } from '../../services/supabase.service';

/**
 * Navegação inferior do atendente: Pedidos e Comandas. O ícone de Comandas
 * leva o contador de pendências, para ele perceber que tem alguém esperando
 * liberação ou pagamento mesmo sem sair da tela de Pedidos.
 */
@Component({
  selector: 'app-nav-atendente',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav-atendente.html',
  styleUrl: './nav-atendente.scss',
})
export class NavAtendente implements OnInit {
  private comandasService = inject(ComandasAtendenteService);
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);

  /**
   * Se o próprio menu busca e acompanha a contagem. A aba Comandas desliga:
   * ela já recarrega a lista, e a contagem sai de lá sem outra consulta.
   */
  readonly acompanhar = input(true);

  protected readonly pendencias = this.comandasService.pendencias;

  async ngOnInit(): Promise<void> {
    if (!this.acompanhar()) return;

    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'comandas' }],
      () => void this.contar(),
    );
    this.destroyRef.onDestroy(pararDeEscutar);

    await this.contar();
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
