import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class Auth {

  login(usuario: string, password: string): boolean {

    if (usuario === 'admin' && password === '1234') {
      sessionStorage.setItem('logged', 'true');
      sessionStorage.setItem('usuario', usuario);
      return true;
    }

    return false;
  }

  logout() {
    sessionStorage.clear();
  }

  isLogged(): boolean {
    return sessionStorage.getItem('logged') === 'true';
  }

  getUsuario(): string {
    return sessionStorage.getItem('usuario') ?? '';
  }
}