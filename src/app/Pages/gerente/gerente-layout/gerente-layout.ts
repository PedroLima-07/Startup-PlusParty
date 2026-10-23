import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { EquipeService } from '../../../services/equipe.service';
import { SupabaseService } from '../../../services/supabase.service';
import { Icone } from '../componentes/icone';

/**
 * Telas abertas a partir de outra: no lugar do logo, o topo mostra o título e
 * a seta de voltar. No desktop o topo só aparece nelas (as outras têm o
 * próprio título); `desktop: false` esconde também ali.
 */
const SUBPAGINAS: { rota: string; titulo: string; voltar: string; desktop?: boolean }[] = [
  { rota: '/gerente/movimento/resumo', titulo: 'Resumo da noite', voltar: '/gerente/movimento' },
  // No celular se chega pelo cartão do Movimento; no desktop, pelo menu lateral.
  { rota: '/gerente/divulgar', titulo: 'Divulgar meu bar', voltar: '/gerente/movimento', desktop: false },
  // No desktop é o "Perfil do bar" do menu lateral, sem seta de voltar.
  { rota: '/gerente/configuracoes', titulo: 'Configurações', voltar: '/gerente/movimento', desktop: false },
  { rota: '/gerente/equipe/convite', titulo: 'Convidar atendente', voltar: '/gerente/equipe' },
  // Perfil de um atendente (/gerente/equipe/<id>). Vem depois do convite, que também começa assim.
  // No desktop o perfil abre ao lado da lista da Equipe, que continua na tela.
  { rota: '/gerente/equipe/', titulo: 'Atendente', voltar: '/gerente/equipe', desktop: false },
];

@Component({
  selector: 'app-gerente-layout',
  imports: [Icone, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './gerente-layout.html',
  styleUrls: ['./gerente-layout.scss', './gerente-layout.desktop.scss'],
})
export class GerenteLayout implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
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

  protected readonly tituloNoDesktop = computed(() => {
    const pagina = this.subpagina();
    return pagina !== null && pagina.desktop !== false;
  });

  protected readonly nomeDoBar = signal('');
  protected readonly nomeDoGerente = signal('');

  protected readonly iniciais = computed(() => {
    const partes = this.nomeDoGerente().trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (partes[0][0] + ultima).toUpperCase();
  });

  /** Contador da aba Equipe: gente esperando o gerente responder. */
  protected readonly pedidosPendentes = computed(() => this.equipeService.pendentes().length);

  ngOnInit(): void {
    // Nome do bar e do gerente para o menu lateral do desktop. O perfil já
    // está guardado desde o login; se falhar, o menu só fica sem os nomes.
    void this.authService
      .perfilAtual()
      .then((perfil) => {
        this.nomeDoBar.set(perfil?.estabelecimento?.nome ?? '');
        this.nomeDoGerente.set(perfil?.nome ?? '');
      })
      .catch(() => undefined);

    // Pedido novo de atendente aparece no contador sozinho, em qualquer aba.
    // O contador é um aviso: se a consulta falhar, o resto da área segue igual.
    const atualizarPedidos = () =>
      void this.equipeService.carregarPendentes().catch(() => undefined);
    this.destroyRef.onDestroy(
      this.supabase.escutarMudancas([{ tabela: 'solicitacoes_equipe' }], atualizarPedidos),
    );
    atualizarPedidos();
  }

  protected async sair(): Promise<void> {
    await this.authService.sair();
    await this.router.navigateByUrl('/login');
  }
}
