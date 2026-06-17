import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class UsuariosService {

  private http = inject(HttpClient);
  private apiUrl = 'http://10.20.55.232:8000/api/admin/usuarios';

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