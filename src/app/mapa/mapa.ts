import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject
} from '@angular/core';

import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { Router } from '@angular/router';

import { Navbar } from '../navbar/navbar';

import {
  AgroApiService,
  PuntoGuardado
} from '../services/agro-api.services';

import {
  AuthService
} from '../services/auth.services';

delete (
  L.Icon.Default.prototype as any
)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',

  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',

  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

@Component({
  selector: 'app-mapa',
  imports: [
    CommonModule,
    Navbar
  ],
  templateUrl: './mapa.html',
  styleUrls: ['./mapa.css']
})
export class Mapa
  implements OnInit, AfterViewInit {

  private router = inject(Router);

  private agroApi =
    inject(AgroApiService);

  private authService =
    inject(AuthService);

  private cdr =
    inject(ChangeDetectorRef);

  resultado: any = null;

  map!: L.Map;

  marker?: L.Marker;

  puntosGuardados: PuntoGuardado[] = [];

  totalPuntosGuardados = 0;

  limitePuntosGuardados = 10;

  cargandoPuntosGuardados = false;

  errorPuntosGuardados = '';

  puedeGestionarPuntos = false;

  ngOnInit(): void {
    this.verificarPermisoPuntos();

    if (this.puedeGestionarPuntos) {
      this.cargarPuntosGuardados();
    }
  }

  ngAfterViewInit(): void {
    this.map = L
      .map('map')
      .setView(
        [22.5, -102.0],
        6
      );

    (window as any).leafletMap =
      this.map;

    (window as any).L = L;

    setTimeout(() => {
      this.map.invalidateSize();
    }, 200);

    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ).addTo(this.map);

    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
    ).addTo(this.map);

    this.map.on(
      'click',
      (evento: L.LeafletMouseEvent) => {

        const lat =
          evento.latlng.lat;

        const lon =
          evento.latlng.lng;

        if (this.marker) {
          this.map.removeLayer(
            this.marker
          );
        }

        this.marker = L
          .marker([lat, lon])
          .addTo(this.map);

        this.buscarPunto(
          lat,
          lon
        );
      }
    );
  }

  // =====================================================
  // PERMISOS
  // =====================================================

  private verificarPermisoPuntos():
    void {

    this.puedeGestionarPuntos =
      this.authService.esAdmin() ||
      this.authService.esInvestigador();
  }

  // =====================================================
  // NORMALIZAR RESPUESTA DE LA API
  // =====================================================

  private obtenerListaPuntos(
    respuesta: any
  ): PuntoGuardado[] {

    if (Array.isArray(respuesta)) {
      return respuesta;
    }

    if (Array.isArray(respuesta?.puntos)) {
      return respuesta.puntos;
    }

    if (Array.isArray(respuesta?.items)) {
      return respuesta.items;
    }

    if (Array.isArray(respuesta?.data)) {
      return respuesta.data;
    }

    return [];
  }

  private actualizarVistaMapa(): void {
    this.cdr.detectChanges();

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 0);
  }

  // =====================================================
  // CONSULTAR PUNTOS GUARDADOS
  // =====================================================

  cargarPuntosGuardados(): void {
    if (!this.puedeGestionarPuntos) {
      return;
    }

    this.cargandoPuntosGuardados = true;

    this.errorPuntosGuardados = '';

    this.agroApi
      .getPuntosGuardados()
      .subscribe({
        next: (respuesta: any) => {
          console.log(
            'RESPUESTA PUNTOS GUARDADOS:',
            respuesta
          );

          const puntos =
            this.obtenerListaPuntos(respuesta);

          this.puntosGuardados = [
            ...puntos
          ];

          this.totalPuntosGuardados =
            Number(
              respuesta?.total ??
              puntos.length
            );

          this.limitePuntosGuardados =
            Number(
              respuesta?.limite ?? 10
            );

          this.cargandoPuntosGuardados =
            false;

          this.actualizarVistaMapa();
        },

        error: error => {
          console.error(
            'Error cargando puntos guardados:',
            error
          );

          this.errorPuntosGuardados =
            error?.error?.detail ??
            'No fue posible cargar los puntos guardados.';

          this.cargandoPuntosGuardados =
            false;

          this.actualizarVistaMapa();
        }
      });
  }

  // =====================================================
  // BUSCAR INFORMACIÓN WRF
  // =====================================================

  buscarPunto(
    lat: number,
    lon: number
  ): void {

    this.agroApi
      .getWrfVigente(lat, lon)
      .subscribe({
        next: (resp: any) => {
          this.resultado = resp;

          const dia0 =
            resp?.serie?.[0];

          const variables =
            dia0?.variables ?? {};

          const botonGuardar =
            this.construirBotonGuardarPunto();

          const popupHtml = `
            <div style="min-width:260px">

              <h3 style="
                margin-top:0;
                margin-bottom:12px;
                color:#17341e;
              ">
                Pronóstico WRF
              </h3>

              <b>Fecha:</b>
              ${dia0?.fecha ?? '-'}
              <br>

              <b>Tmax:</b>
              ${variables.tmax ?? '-'}
              <br>

              <b>Tmin:</b>
              ${variables.tmin ?? '-'}
              <br>

              <b>Lluvia:</b>
              ${variables.rain ?? '-'}
              <br>

              <b>RH:</b>
              ${variables.rh ?? '-'}
              <br>

              <b>Latitud:</b>
              ${lat.toFixed(5)}
              <br>

              <b>Longitud:</b>
              ${lon.toFixed(5)}
              <br>

              <hr style="
                margin:12px 0;
                border:0;
                border-top:1px solid #d6dfd5;
              ">

              <button
                id="btn-dashboard"
                type="button"
                style="
                  background:#2e7d32;
                  color:white;
                  border:none;
                  padding:9px;
                  border-radius:6px;
                  width:100%;
                  font-weight:600;
                  cursor:pointer;
                "
              >
                Ver Dashboard
              </button>

              ${botonGuardar}

            </div>
          `;

          this.marker?.bindPopup(
            popupHtml
          );

          this.marker?.openPopup();

          setTimeout(() => {
            this.configurarBotonesPopup(
              lat,
              lon
            );
          }, 100);
        },

        error: error => {
          console.error(
            'Error consultando el punto:',
            error
          );

          const popupError = `
            <div style="min-width:230px">
              <h3 style="
                color:#b42318;
                margin-top:0;
              ">
                No fue posible consultar el punto
              </h3>

              <p>
                ${
                  error?.error?.detail ??
                  'Ocurrió un error al consultar la información WRF.'
                }
              </p>
            </div>
          `;

          this.marker?.bindPopup(
            popupError
          );

          this.marker?.openPopup();
        }
      });
  }

  private construirBotonGuardarPunto():
    string {

    if (!this.puedeGestionarPuntos) {
      return '';
    }

    const limiteAlcanzado =
      this.totalPuntosGuardados >=
      this.limitePuntosGuardados;

    if (limiteAlcanzado) {
      return `
        <button
          type="button"
          disabled
          title="Ya alcanzaste el límite de puntos guardados"
          style="
            margin-top:8px;
            background:#d1d5db;
            color:#6b7280;
            border:none;
            padding:9px;
            border-radius:6px;
            width:100%;
            font-weight:600;
            cursor:not-allowed;
          "
        >
          Límite de ${this.limitePuntosGuardados} puntos alcanzado
        </button>
      `;
    }

    return `
      <button
        id="btn-guardar-punto"
        type="button"
        style="
          margin-top:8px;
          background:#eaf4df;
          color:#17341e;
          border:1px solid #b8d2b7;
          padding:9px;
          border-radius:6px;
          width:100%;
          font-weight:600;
          cursor:pointer;
        "
      >
        Guardar punto
      </button>
    `;
  }

  private configurarBotonesPopup(
    lat: number,
    lon: number
  ): void {

    const botonDashboard =
      document.getElementById(
        'btn-dashboard'
      );

    if (botonDashboard) {
      botonDashboard.onclick = () => {
        this.abrirDashboardCoordenadas(
          lat,
          lon
        );
      };
    }

    const botonGuardar =
      document.getElementById(
        'btn-guardar-punto'
      );

    if (botonGuardar) {
      botonGuardar.onclick = () => {
        this.solicitarNombrePunto(
          lat,
          lon
        );
      };
    }
  }

  // =====================================================
  // GUARDAR PUNTO
  // =====================================================

  private solicitarNombrePunto(
    lat: number,
    lon: number
  ): void {

    if (!this.puedeGestionarPuntos) {
      return;
    }

    if (
      this.totalPuntosGuardados >=
      this.limitePuntosGuardados
    ) {
      window.alert(
        `Solo puedes guardar hasta ` +
        `${this.limitePuntosGuardados} puntos.`
      );

      return;
    }

    const nombreSugerido =
      `Punto ${this.totalPuntosGuardados + 1}`;

    const nombreIngresado =
      window.prompt(
        'Escribe un nombre para este punto:',
        nombreSugerido
      );

    if (nombreIngresado === null) {
      return;
    }

    const nombre =
      nombreIngresado.trim();

    if (!nombre) {
      window.alert(
        'Debes escribir un nombre para guardar el punto.'
      );

      return;
    }

    if (nombre.length > 100) {
      window.alert(
        'El nombre no puede tener más de 100 caracteres.'
      );

      return;
    }

    this.agroApi
      .crearPuntoGuardado({
        nombre,
        latitud: lat,
        longitud: lon
      })
      .subscribe({
        next: (respuestaCreacion: any) => {
          console.log(
            'RESPUESTA CREAR PUNTO:',
            respuestaCreacion
          );

          this.marker?.closePopup();

          /*
           * Se vuelve a consultar la API en lugar de confiar
           * en la estructura de la respuesta del POST.
           * De esta forma el panel aparece inmediatamente y
           * queda sincronizado con PostgreSQL.
           */
          this.cargarPuntosGuardados();

          const puntoCreado =
            respuestaCreacion?.punto ??
            respuestaCreacion;

          const nombreConfirmacion =
            puntoCreado?.nombre ?? nombre;

          window.alert(
            `El punto "${nombreConfirmacion}" ` +
            'se guardó correctamente.'
          );
        },

        error: error => {
          console.error(
            'Error guardando punto:',
            error
          );

          window.alert(
            error?.error?.detail ??
            'No fue posible guardar el punto.'
          );
        }
      });
  }

  // =====================================================
  // ABRIR PUNTO GUARDADO
  // =====================================================

  irAPuntoGuardado(
    punto: PuntoGuardado
  ): void {

    this.abrirDashboardCoordenadas(
      Number(punto.latitud),
      Number(punto.longitud)
    );
  }

  private abrirDashboardCoordenadas(
    lat: number,
    lon: number
  ): void {

    localStorage.setItem(
      'lat',
      String(lat)
    );

    localStorage.setItem(
      'lon',
      String(lon)
    );

    this.router.navigate([
      '/dashboard'
    ]);
  }

  // =====================================================
  // RENOMBRAR PUNTO
  // =====================================================

  renombrarPuntoGuardado(
    punto: PuntoGuardado,
    evento?: Event
  ): void {

    evento?.stopPropagation();

    const nombreIngresado =
      window.prompt(
        'Escribe el nuevo nombre del punto:',
        punto.nombre
      );

    if (nombreIngresado === null) {
      return;
    }

    const nuevoNombre =
      nombreIngresado.trim();

    if (!nuevoNombre) {
      window.alert(
        'El nombre no puede estar vacío.'
      );

      return;
    }

    if (nuevoNombre === punto.nombre) {
      return;
    }

    if (nuevoNombre.length > 100) {
      window.alert(
        'El nombre no puede tener más de 100 caracteres.'
      );

      return;
    }

    this.agroApi
      .renombrarPuntoGuardado(
        punto.id,
        nuevoNombre
      )
      .subscribe({
        next: () => {
          this.cargarPuntosGuardados();
        },

        error: error => {
          console.error(
            'Error renombrando punto:',
            error
          );

          window.alert(
            error?.error?.detail ??
            'No fue posible renombrar el punto.'
          );
        }
      });
  }

  // =====================================================
  // ELIMINAR PUNTO
  // =====================================================

  eliminarPuntoGuardado(
    punto: PuntoGuardado,
    evento?: Event
  ): void {

    evento?.stopPropagation();

    const confirmar =
      window.confirm(
        `¿Eliminar el punto "${punto.nombre}"?`
      );

    if (!confirmar) {
      return;
    }

    this.agroApi
      .eliminarPuntoGuardado(
        punto.id
      )
      .subscribe({
        next: () => {
          this.cargarPuntosGuardados();
        },

        error: error => {
          console.error(
            'Error eliminando punto:',
            error
          );

          window.alert(
            error?.error?.detail ??
            'No fue posible eliminar el punto.'
          );
        }
      });
  }

  abrirDashboard(
    data: any
  ): void {

    localStorage.setItem(
      'wrf_point',
      JSON.stringify(data)
    );

    this.router.navigate([
      '/dashboard'
    ]);
  }

  logout(): void {
    this.authService.logout();

    location.reload();
  }
}