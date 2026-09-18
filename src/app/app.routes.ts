import { Routes } from '@angular/router';

// TODO: reativar authGuard em home/abrir-comanda/abrir-comanda/local/comanda
// assim que o login real estiver liberado pra todo mundo (Supabase com
// "Confirm email" ligado trava sessão pra quem não tem acesso ao painel).
// Guard removido a pedido do Nathan pra destravar testes e demonstrações
// sem precisar logar. Ver card "Usar Contextualização" no Trello.
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
    path: 'abrir-comanda/local',
    loadComponent: () =>
      import('./Pages/abrir-comanda/local/local').then((m) => m.AbrirComandaLocalComponent),
  },
  {
    path: 'comanda/:id',
    loadComponent: () => import('./Pages/comanda/comanda').then((m) => m.ComandaPage),
  },
  {
    path: 'cardapio/:id',
    loadComponent: () => import('./Pages/cardapio/cardapio').then((m) => m.CardapioPage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
