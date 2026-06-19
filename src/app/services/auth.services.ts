import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'http://10.20.55.232:8000';

  constructor(private http: HttpClient) {}

  login(
  usuario: string,
  password: string,
  captchaToken: string
): Observable<any> {

  return this.http.post(`${this.apiUrl}/api/auth/login`, {
    usuario,
    password,
    captcha_token: captchaToken
  }).pipe(
    tap((resp: any) => {
      localStorage.setItem('token', resp.access_token);
      localStorage.setItem('usuario', JSON.stringify(resp.usuario));
    })
  );
}

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUsuario(): any {
    const usuario = localStorage.getItem('usuario');

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
  return rol === 'admin' || rol === 'investigador';
}
  estaLogueado(): boolean {
    const token = this.getToken();

    if (!token) {
      return false;
    }

    try {
      const payload = JSON.parse(
        atob(token.split('.')[1])
      );

      const ahora = Math.floor(Date.now() / 1000);

      if (payload.exp <= ahora) {
        this.logout();
        return false;
      }

      return true;

    } catch {
      this.logout();
      return false;
    }
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  }
}