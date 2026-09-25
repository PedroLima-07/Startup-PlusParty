import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { staffGuard } from './guards/staff.guard';

// Navegar pelos bares (discovery, perfil, cardápio em modo visualizar, home)
// não exige login, para demonstrar sem conta. Abrir e usar uma comanda exige.
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
    canActivate: [authGuard],
  },
  {
    path: 'cliente/comanda/:id',
    loadComponent: () => import('./Pages/comanda/comanda').then((m) => m.ComandaPage),
    canActivate: [authGuard],
  },
  {
    path: 'cliente/cardapio/:id',
    loadComponent: () => import('./Pages/cardapio/cardapio').then((m) => m.CardapioPage),
    data: { modo: 'pedir' },
    canActivate: [authGuard],
  },
  {
    path: 'atendente/pedidos',
    loadComponent: () =>
      import('./Pages/atendente-pedidos/atendente-pedidos').then((m) => m.AtendentePedidos),
    canActivate: [staffGuard],
  },
  {
    path: 'atendente/comandas',
    loadComponent: () =>
      import('./Pages/atendente-comandas/atendente-comandas').then((m) => m.AtendenteComandas),
    canActivate: [staffGuard],
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
