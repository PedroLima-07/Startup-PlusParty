import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Área do gerente: só perfis do tipo gerente. Os demais vão para a própria tela inicial. */
export const gerenteGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const tipo = await authService.buscarTipoAtual().catch(() => null);

  if (tipo === 'gerente') return true;
  if (tipo) return router.parseUrl(authService.telaInicial(tipo));
  return router.parseUrl('/login');
};
