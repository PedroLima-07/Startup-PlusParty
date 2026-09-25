import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Para a tela de login: quem já está logado vai direto para a sua tela inicial. */
export const semSessaoGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const tipo = await authService.buscarTipoAtual().catch(() => null);
  if (!tipo) return true;

  return router.parseUrl(authService.telaInicial(tipo));
};
