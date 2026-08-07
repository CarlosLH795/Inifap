import {
  Injectable,
  NgZone
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'https://clima.inifap.gob.mx/wrf-api';

  private temporizadorSesion:
    ReturnType<typeof setTimeout> |
    null = null;

  private procesandoExpiracion = false;


  constructor(
    private http: HttpClient,
    private router: Router,
    private ngZone: NgZone
  ) {}


  inicializarSesion(): void {
    const token = this.getToken();

    if (token) {
      this.programarExpiracion(token);
    }
  }


  login(
    usuario: string,
    password: string,
    captchaToken: string
  ): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/api/auth/login`,
      {
        usuario,
        password,
        captcha_token: captchaToken
      }
    ).pipe(
      tap((resp: any) => {
        const token = String(
          resp?.access_token ?? ''
        );

        if (!token) {
          throw new Error(
            'La API no devolvió un token de acceso.'
          );
        }

        localStorage.setItem(
          'token',
          token
        );

        localStorage.setItem(
          'usuario',
          JSON.stringify(resp.usuario)
        );

        sessionStorage.removeItem(
          'mensaje_sesion'
        );

        this.procesandoExpiracion = false;
        this.programarExpiracion(token);
      })
    );
  }


  getToken(): string | null {
    return localStorage.getItem('token');
  }


  getUsuario(): any {
    const usuario = localStorage.getItem(
      'usuario'
    );

    if (!usuario) {
      return null;
    }

    try {
      return JSON.parse(usuario);
    } catch {
      return null;
    }
  }


  getRol(): string | null {
    const usuario = this.getUsuario();
    return usuario?.rol || null;
  }


  esAdmin(): boolean {
    return this.getRol() === 'admin';
  }


  esInvestigador(): boolean {
    return this.getRol() === 'investigador';
  }


  esUsuario(): boolean {
    return this.getRol() === 'usuario';
  }


  puedeDescargar(): boolean {
    const rol = this.getRol();

    return (
      rol === 'admin' ||
      rol === 'investigador'
    );
  }


  estaLogueado(): boolean {
    const token = this.getToken();

    if (!token) {
      return false;
    }

    const expiracion = this.obtenerExpiracion(
      token
    );

    if (!expiracion) {
      this.logout();
      return false;
    }

    if (expiracion <= Date.now()) {
      this.expirarSesion();
      return false;
    }

    return true;
  }


  logout(): void {
    this.cancelarTemporizador();

    localStorage.removeItem('token');
    localStorage.removeItem('usuario');

    this.procesandoExpiracion = false;
  }


  expirarSesion(): void {
    if (this.procesandoExpiracion) {
      return;
    }

    this.procesandoExpiracion = true;
    this.cancelarTemporizador();

    localStorage.removeItem('token');
    localStorage.removeItem('usuario');

    sessionStorage.setItem(
      'mensaje_sesion',
      'Tu sesión expiró. Inicia sesión nuevamente.'
    );

    this.ngZone.run(() => {
      this.router.navigate(
        ['/login'],
        {
          replaceUrl: true
        }
      ).finally(() => {
        this.procesandoExpiracion = false;
      });
    });
  }


  private programarExpiracion(
    token: string
  ): void {
    this.cancelarTemporizador();

    const expiracion = this.obtenerExpiracion(
      token
    );

    if (!expiracion) {
      this.expirarSesion();
      return;
    }

    const tiempoRestante =
      expiracion - Date.now();

    if (tiempoRestante <= 0) {
      this.expirarSesion();
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.temporizadorSesion = setTimeout(
        () => {
          this.expirarSesion();
        },
        tiempoRestante
      );
    });
  }


  private cancelarTemporizador(): void {
    if (!this.temporizadorSesion) {
      return;
    }

    clearTimeout(
      this.temporizadorSesion
    );

    this.temporizadorSesion = null;
  }


  private obtenerExpiracion(
    token: string
  ): number | null {
    try {
      const partes = token.split('.');

      if (partes.length !== 3) {
        return null;
      }

      let base64 = partes[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');

      const relleno =
        (4 - (base64.length % 4)) % 4;

      base64 += '='.repeat(relleno);

      const textoBinario = atob(base64);

      const textoJson = decodeURIComponent(
        Array.from(textoBinario)
          .map(
            caracter =>
              '%' + caracter
                .charCodeAt(0)
                .toString(16)
                .padStart(2, '0')
          )
          .join('')
      );

      const payload = JSON.parse(
        textoJson
      );

      const exp = Number(payload?.exp);

      if (!Number.isFinite(exp)) {
        return null;
      }

      return exp * 1000;

    } catch {
      return null;
    }
  }
}