import { Routes } from '@angular/router';

// TODO: reativar authGuard nas rotas /cliente/* assim que o login real
// estiver liberado pra todo mundo (Supabase com "Confirm email" ligado
// trava sessão pra quem não tem acesso ao painel). Guard removido a
// pedido do Nathan pra destravar testes e demonstrações sem precisar
// logar. Ver card "Usar Contextualização" no Trello.
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./Pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'cliente/discovery',
    loadComponent: () => import('./Pages/discovery/discovery').then((m) => m.DiscoveryPage),
  },
  {
    path: 'cliente/estabelecimento/:id',
    loadComponent: () =>
      import('./Pages/estabelecimento/estabelecimento').then((m) => m.EstabelecimentoPage),
  },
  {
    path: 'cliente/estabelecimento/:id/cardapio',
    loadComponent: () => import('./Pages/cardapio/cardapio').then((m) => m.CardapioPage),
    data: { modo: 'visualizar' },
  },
  {
    path: 'cliente/home',
    loadComponent: () => import('./Pages/home/home').then((m) => m.HomePage),
  },
  {
    path: 'cliente/abrir-comanda/:id',
    loadComponent: () =>
      import('./Pages/abrir-comanda/local/local').then((m) => m.AbrirComandaLocalComponent),
  },
  {
    path: 'cliente/comanda/:id',
    loadComponent: () => import('./Pages/comanda/comanda').then((m) => m.ComandaPage),
  },
  {
    path: 'cliente/cardapio/:id',
    loadComponent: () => import('./Pages/cardapio/cardapio').then((m) => m.CardapioPage),
    data: { modo: 'pedir' },
  },
  {
    path: 'cliente',
    redirectTo: 'cliente/discovery',
    pathMatch: 'full',
  },
  {
    path: '',
    redirectTo: 'cliente/discovery',
    pathMatch: 'full',
  },
];
