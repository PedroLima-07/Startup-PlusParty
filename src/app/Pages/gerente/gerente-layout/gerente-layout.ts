import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { EquipeService } from '../../../services/equipe.service';
import { SupabaseService } from '../../../services/supabase.service';

@Component({
  selector: 'app-gerente-layout',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './gerente-layout.html',
  styleUrls: ['./gerente-layout.scss'],
})
export class GerenteLayout implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private equipeService = inject(EquipeService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);

  protected readonly nomeEstabelecimento = signal('');
  /** Contador da aba Equipe: gente esperando o gerente responder. */
  protected readonly pedidosPendentes = computed(() => this.equipeService.pendentes().length);
  tituloPagina = 'Movimento';

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        if (event.urlAfterRedirects.includes('/movimento')) {
          this.tituloPagina = 'Movimento';
        } else if (event.urlAfterRedirects.includes('/postagens')) {
          this.tituloPagina = 'Postagens';
        } else if (event.urlAfterRedirects.includes('/perfil-bar')) {
          this.tituloPagina = 'Perfil do bar';
        } else if (event.urlAfterRedirects.includes('/equipe')) {
          this.tituloPagina = 'Equipe';
        }
      });
  }

  async ngOnInit(): Promise<void> {
    // Pedido novo de atendente aparece no contador sozinho, em qualquer aba.
    // O contador é um aviso: se a consulta falhar, o resto da área segue igual.
    const atualizarPedidos = () =>
      void this.equipeService.carregarPendentes().catch(() => undefined);
    this.destroyRef.onDestroy(
      this.supabase.escutarMudancas([{ tabela: 'solicitacoes_equipe' }], atualizarPedidos),
    );
    atualizarPedidos();

    const nome = await this.authService.buscarNomeEstabelecimentoAtual().catch(() => null);
    this.nomeEstabelecimento.set(nome ?? '');
  }
}
