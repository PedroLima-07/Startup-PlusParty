import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class GerenteAuthService {
  logado = signal<boolean>(false);
  estabelecimentoId = signal<string | null>(null);
  nomeGerente = signal<string | null>(null);

  constructor(private router: Router) {}

  login(email: string, senha: string): void {
    // TODO: integrar Supabase Auth
    this.logado.set(true);
    this.estabelecimentoId.set('mock-id');
    this.nomeGerente.set('Gerente de Teste');
    this.router.navigate(['/gerente/movimento']);
  }

  logout(): void {
    // TODO: integrar Supabase Auth
    this.logado.set(false);
    this.estabelecimentoId.set(null);
    this.nomeGerente.set(null);
    this.router.navigate(['/login-gerente']);
  }
}
