import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { GerenteAuthService } from '../services/gerente-auth.service';

export const gerenteGuard: CanActivateFn = (route, state) => {
  const authService = inject(GerenteAuthService);
  const router = inject(Router);

  if (authService.logado()) {
    return true;
  }

  return router.parseUrl('/login-gerente');
};
