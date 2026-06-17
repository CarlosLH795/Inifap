import { Component, AfterViewInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';
import { Router } from '@angular/router';
import { Navbar } from '../navbar/navbar';
import { AgroApiService } from '../services/agro-api.services';

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});


@Component({
  selector: 'app-mapa',
  imports: [Navbar],
  templateUrl: './mapa.html',
  styleUrl: './mapa.css'
})
export class Mapa implements AfterViewInit {
  private router = inject(Router);
  private http = inject(HttpClient);
  private agroApi = inject(AgroApiService);
  resultado: any = null;
  map!: L.Map;
  marker?: L.Marker;

  ngAfterViewInit(): void {
    this.map = L.map('map').setView(  [22.5, -102.0],  6);
      setTimeout(() => {
      this.map.invalidateSize();
      }, 200);
    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ).addTo(this.map);

    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
    ).addTo(this.map);

    this.map.on('click', (e: any) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      if (this.marker) {
        this.map.removeLayer(this.marker);
      }

      this.marker = L.marker([lat, lon]).addTo(this.map);
      this.buscarPunto(lat, lon);
    });
  }

 buscarPunto(lat: number, lon: number) {

  this.agroApi.getWrfVigente(lat, lon)
    .subscribe({

      next: (resp: any) => {

        this.resultado = resp;

        const dia0 = resp.serie?.[0];
const vars = dia0?.variables || {};

const popupHtml = `
  <div style="min-width:260px">
    <h3>Pronóstico WRF</h3>

    <b>Fecha:</b> ${dia0?.fecha ?? '-'}<br>
    <b>Tmax:</b> ${vars.tmax ?? '-'}<br>
    <b>Tmin:</b> ${vars.tmin ?? '-'}<br>
    <b>Lluvia:</b> ${vars.rain ?? '-'}<br>
    <b>RH:</b> ${vars.rh ?? '-'}<br>

    <hr>

    <button
      id="btn-dashboard"
      style="
        background:#2e7d32;
        color:white;
        border:none;
        padding:8px;
        border-radius:6px;
        width:100%;
      ">
      Ver Dashboard
    </button>
  </div>
`;

        this.marker?.bindPopup(popupHtml);
        this.marker?.openPopup();

        setTimeout(() => {

          const btn =
            document.getElementById('btn-dashboard');

          if (btn) {

            btn.onclick = () => {

              localStorage.setItem(
                'lat',
                lat.toString()
              );

              localStorage.setItem(
                'lon',
                lon.toString()
              );

              this.router.navigate([
                '/dashboard'
              ]);
            };

          }

        }, 100);

      }

    });

}

  abrirDashboard(data: any) {

  localStorage.setItem(
    'wrf_point',
    JSON.stringify(data)
  );

  this.router.navigate(['/dashboard']);

}
logout() {

  localStorage.clear();

  location.reload();

}
}
