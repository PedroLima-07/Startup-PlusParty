import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const staffGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const tipo = await authService.buscarTipoAtual().catch(() => null);

  if (tipo === 'funcionario' || tipo === 'gerente') return true;
  if (tipo === 'cliente') return router.parseUrl('/cliente/home');
  return router.parseUrl('/login');
};
