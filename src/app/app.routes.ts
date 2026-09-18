import { Routes } from '@angular/router';

// TODO: reativar authGuard em 'home' e 'abrir-comanda' assim que o login real
// estiver desbloqueado (Supabase com "Confirm email" ligado trava toda sessão
// autenticada agora). Guard removido só pra não travar o fluxo do time
// enquanto isso não é resolvido — ver card "Usar Contextualização" no Trello.
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./Pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./Pages/home/home').then((m) => m.HomePage),
  },
  {
    path: 'abrir-comanda',
    loadComponent: () =>
      import('./Pages/abrir-comanda/abrir-comanda').then((m) => m.AbrirComandaComponent),
  },
  {
    path: 'comanda/:id',
    loadComponent: () => import('./Pages/comanda/comanda').then((m) => m.ComandaPage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
