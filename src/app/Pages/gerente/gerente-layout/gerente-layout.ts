import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';

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

  protected readonly nomeEstabelecimento = signal('');
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
        }
      });
  }

  async ngOnInit(): Promise<void> {
    const nome = await this.authService.buscarNomeEstabelecimentoAtual().catch(() => null);
    this.nomeEstabelecimento.set(nome ?? '');
  }
}
