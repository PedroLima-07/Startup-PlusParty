import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EquipeService } from '../services/equipe.service';

/** Para a tela de login: quem já está logado vai direto para a sua tela inicial. */
export const semSessaoGuard: CanActivateFn = async () => {
  const equipeService = inject(EquipeService);
  const router = inject(Router);

  const telaInicial = await equipeService.telaInicial().catch(() => null);
  return telaInicial ? router.parseUrl(telaInicial) : true;
};
