import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpParams
} from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PuntoGuardado {
  id: number;
  nombre: string;
  latitud: number;
  longitud: number;
  fecha_creacion: string;
}

export interface RespuestaPuntosGuardados {
  total: number;
  limite: number;
  puntos: PuntoGuardado[];
}

export interface CrearPuntoGuardado {
  nombre: string;
  latitud: number;
  longitud: number;
}

@Injectable({
  providedIn: 'root'
})
export class AgroApiService {

  private apiUrl =
    '/wrf-api';

  constructor(
    private http: HttpClient
  ) {}

  getWrfVigente(
    lat: number,
    lon: number
  ): Observable<any> {

    const params = new HttpParams()
      .set('lat', lat)
      .set('lon', lon);

    return this.http.get(
      `${this.apiUrl}/api/wrf/vigente`,
      { params }
    );
  }

  getGddSerie(
    lat: number,
    lon: number,
    fechaInicio: string,
    fechaFin: string,
    cultivo: 'maiz' | 'frijol' | 'sorgo'
  ): Observable<any> {

    return this.http.get(
      `${this.apiUrl}/api/clima/gdd-serie`,
      {
        params: {
          lat,
          lon,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          cultivo
        }
      }
    );
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
      .set(
        'profundidad_referencia',
        profundidadReferencia
      )
      .set(
        'variable_humedad',
        variableHumedad
      );

    return this.http.get(
      `${this.apiUrl}/api/suelo/humedad-barra`,
      { params }
    );
  }

  // =====================================================
  // PUNTOS GUARDADOS
  // =====================================================

  getPuntosGuardados():
    Observable<RespuestaPuntosGuardados> {

    return this.http.get<RespuestaPuntosGuardados>(
      `${this.apiUrl}/api/puntos-guardados`
    );
  }

  crearPuntoGuardado(
    datos: CrearPuntoGuardado
  ): Observable<PuntoGuardado> {

    return this.http.post<PuntoGuardado>(
      `${this.apiUrl}/api/puntos-guardados`,
      datos
    );
  }

  renombrarPuntoGuardado(
    puntoId: number,
    nombre: string
  ): Observable<PuntoGuardado> {

    return this.http.put<PuntoGuardado>(
      `${this.apiUrl}/api/puntos-guardados/${puntoId}`,
      { nombre }
    );
  }

  eliminarPuntoGuardado(
    puntoId: number
  ): Observable<{
    id: number;
    mensaje: string;
  }> {

    return this.http.delete<{
      id: number;
      mensaje: string;
    }>(
      `${this.apiUrl}/api/puntos-guardados/${puntoId}`
    );
  }
}