import { Component, DestroyRef, OnInit, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { EquipeService } from '../../../services/equipe.service';
import { SupabaseService } from '../../../services/supabase.service';
import { Icone } from '../componentes/icone';

/**
 * Telas abertas a partir de outra: no lugar do logo, o topo mostra o título e
 * a seta de voltar.
 */
const SUBPAGINAS = [
  { rota: '/gerente/movimento/resumo', titulo: 'Resumo da noite', voltar: '/gerente/movimento' },
  { rota: '/gerente/configuracoes', titulo: 'Configurações', voltar: '/gerente/movimento' },
];

@Component({
  selector: 'app-gerente-layout',
  imports: [Icone, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './gerente-layout.html',
  styleUrl: './gerente-layout.scss',
})
export class GerenteLayout implements OnInit {
  private router = inject(Router);
  private equipeService = inject(EquipeService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
      map((evento) => evento.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly subpagina = computed(
    () => SUBPAGINAS.find((subpagina) => this.url().startsWith(subpagina.rota)) ?? null,
  );

  /** Contador da aba Equipe: gente esperando o gerente responder. */
  protected readonly pedidosPendentes = computed(() => this.equipeService.pendentes().length);

  ngOnInit(): void {
    // Pedido novo de atendente aparece no contador sozinho, em qualquer aba.
    // O contador é um aviso: se a consulta falhar, o resto da área segue igual.
    const atualizarPedidos = () =>
      void this.equipeService.carregarPendentes().catch(() => undefined);
    this.destroyRef.onDestroy(
      this.supabase.escutarMudancas([{ tabela: 'solicitacoes_equipe' }], atualizarPedidos),
    );
    atualizarPedidos();
  }
}
