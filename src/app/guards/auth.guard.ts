import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

/** Sem sessão, manda para o login lembrando a página pedida, para voltar depois. */
export const authGuard: CanActivateFn = async (_rota, estado) => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  const {
    data: { user },
  } = await supabase.client.auth.getUser();

  if (user) return true;

  return router.createUrlTree(['/login'], { queryParams: { voltar: estado.url } });
};
