import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'comanda/:id',
    loadComponent: () => import('./Pages/comanda/comanda').then((m) => m.ComandaPage),
  },
];
