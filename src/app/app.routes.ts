import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./Pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./Pages/home/home').then((m) => m.HomePage),
    canActivate: [authGuard],
  },
  {
    path: 'abrir-comanda',
    loadComponent: () =>
      import('./Pages/abrir-comanda/abrir-comanda').then((m) => m.AbrirComandaComponent),
    canActivate: [authGuard],
  },
  {
    path: 'abrir-comanda/local',
    loadComponent: () =>
      import('./Pages/abrir-comanda/local/local').then((m) => m.AbrirComandaLocalComponent),
    canActivate: [authGuard],
  },
  {
    path: 'comanda/:id',
    loadComponent: () => import('./Pages/comanda/comanda').then((m) => m.ComandaPage),
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
