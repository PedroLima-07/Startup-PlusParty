import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Sem sessão, manda para o login lembrando a página pedida, para voltar depois. */
export const authGuard: CanActivateFn = async (_rota, estado) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (await authService.usuarioAtual()) return true;

  return router.createUrlTree(['/login'], { queryParams: { voltar: estado.url } });
};
