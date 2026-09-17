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
    path: 'comanda/:id',
    loadComponent: () => import('./Pages/comanda/comanda').then((m) => m.ComandaPage),
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];
