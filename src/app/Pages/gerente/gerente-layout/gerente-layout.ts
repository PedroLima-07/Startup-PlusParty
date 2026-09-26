import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { GerenteAuthService } from '../../../services/gerente-auth.service';

@Component({
  selector: 'app-gerente-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './gerente-layout.html',
  styleUrls: ['./gerente-layout.scss']
})
export class GerenteLayout {
  authService = inject(GerenteAuthService);
  router = inject(Router);
  
  tituloPagina = 'Movimento';

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      if (event.urlAfterRedirects.includes('/movimento')) {
        this.tituloPagina = 'Movimento';
      } else if (event.urlAfterRedirects.includes('/postagens')) {
        this.tituloPagina = 'Postagens';
      } else if (event.urlAfterRedirects.includes('/perfil-bar')) {
        this.tituloPagina = 'Perfil do bar';
      }
    });
  }
}
