import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AgroApiService {

  private apiUrl = 'http://10.20.55.232:8000';

  constructor(private http: HttpClient) {}

  getWrfVigente(lat: number, lon: number): Observable<any> {
    const params = new HttpParams()
      .set('lat', lat)
      .set('lon', lon);

    return this.http.get(`${this.apiUrl}/api/wrf/vigente`, { params });
  }

  getGddSerie(
  lat: number,
  lon: number,
  fechaInicio: string,
  fechaFin: string,
  cultivo: 'maiz' | 'frijol' | 'sorgo'
) {
  return this.http.get(`${this.apiUrl}/api/clima/gdd-serie`, {
    params: {
      lat,
      lon,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      cultivo
    }
  });
}

  getHumedadBarra(
    lat: number,
    lon: number,
    profundidadReferencia: string,
    variableHumedad: string
  ): Observable<any> {
    const params = new HttpParams()
      .set('lat', lat)
      .set('lon', lon)
      .set('profundidad_referencia', profundidadReferencia)
      .set('variable_humedad', variableHumedad);

    return this.http.get(`${this.apiUrl}/api/suelo/humedad-barra`, { params });
  }
}