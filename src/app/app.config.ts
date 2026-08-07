import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideHttpClient,
  withInterceptors
} from '@angular/common/http';
import {
  provideCharts,
  withDefaultRegisterables
} from 'ng2-charts';

import { routes } from './app.routes';
import {
  authInterceptor
} from './interceptors/auth.interceptor';
import {
  AuthService
} from './services/auth.services';


export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAppInitializer(() => {
      inject(AuthService).inicializarSesion();
    }),
    provideHttpClient(
      withInterceptors([
        authInterceptor
      ])
    ),
    provideCharts(
      withDefaultRegisterables()
    )
  ]
};