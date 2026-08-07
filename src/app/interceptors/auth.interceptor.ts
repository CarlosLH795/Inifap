import {
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';
import {
  inject,
  Injector
} from '@angular/core';
import {
  catchError,
  throwError
} from 'rxjs';

import { AuthService } from '../services/auth.services';


export const authInterceptor: HttpInterceptorFn = (
  req,
  next
) => {
  const injector = inject(Injector);
  const token = localStorage.getItem('token');

  let solicitud = req;

  if (token) {
    solicitud = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(solicitud).pipe(
    catchError(
      (error: HttpErrorResponse) => {
        const esSolicitudLogin =
          req.url.includes('/api/auth/login');

        if (
          error.status === 401 &&
          !esSolicitudLogin
        ) {
          // Se obtiene de forma diferida para evitar una
          // dependencia circular HttpClient -> interceptor
          // -> AuthService -> HttpClient.
          const authService = injector.get(
            AuthService
          );

          authService.expirarSesion();
        }

        return throwError(
          () => error
        );
      }
    )
  );
};