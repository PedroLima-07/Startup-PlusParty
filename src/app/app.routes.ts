import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./Pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'abrir-comanda',
    loadComponent: () => import('./Pages/abrir-comanda/abrir-comanda').then((m) => m.AbrirComanda),
  },
  {
    path: 'comanda',
    loadComponent: () => import('./Pages/comanda/comanda').then((m) => m.ComandaPage),
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];
