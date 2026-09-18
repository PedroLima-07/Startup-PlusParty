import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  const {
    data: { user },
  } = await supabase.client.auth.getUser();

  if (user) return true;

  return router.parseUrl('/login');
};
