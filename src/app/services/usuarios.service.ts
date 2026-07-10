import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class UsuariosService {

  private http = inject(HttpClient);
  private apiUrl = 'https://clima.inifap.gob.mx/wrf-api/api/admin/usuarios';

  listar() {
  return this.http.get<any[]>(this.apiUrl, {
    params: {
      t: Date.now()
    }
  });
}

  crear(data: any) {
    return this.http.post(this.apiUrl, data);
  }

  actualizar(id: number, data: any) {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  cambiarPassword(id: number, password: string) {
    return this.http.put(`${this.apiUrl}/${id}/password`, {
      password
    });
  }
}