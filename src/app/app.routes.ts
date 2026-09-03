import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Mapa } from './mapa/mapa';
import { DashboardComponent } from './dashboard/dashboard.component';
import { adminGuard } from './admin-guards';
import { UsuariosAdmin } from './usuarios-admin/usuarios-admin';
import { authGuard } from './auth-guard';
import { AcercaDe } from './acerca-de/acerca-de';

export const routes: Routes = [
  {
    path: 'login',
    component: Login,
  },

  {
    path: '',
    component: Mapa,
    canActivate: [authGuard],
  },

  {
    path: 'acerca-de',
    component: AcercaDe,
    canActivate: [authGuard],
  },

  {
    path: 'admin/usuarios',
    component: UsuariosAdmin,
    canActivate: [adminGuard],
  },

  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
  },

  {
    path: '**',
    redirectTo: '',
  },
];