import { Component, OnInit, ChangeDetectorRef, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { forkJoin, timeout, catchError, of, finalize } from 'rxjs';
import jsPDF from 'jspdf';

import { Navbar } from '../navbar/navbar';
import { AgroApiService } from '../services/agro-api.services';
import { AuthService } from '../services/auth.services';

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule,
    DecimalPipe,
    FormsModule,
    BaseChartDirective,
    Navbar
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {

  @ViewChild('gddChart')
  gddChart?: BaseChartDirective;

  @ViewChild('humedadChart')
  humedadChart?: BaseChartDirective;

  public authService = inject(AuthService);

  lat!: number;
  lon!: number;

  fechaPronostico = '';
  fechaHoy = this.formatearFechaInput(new Date());
  fechaMinimaGdd = this.calcularFechaMinimaGdd();
  fechaMaximaGdd = this.calcularFechaMaximaGdd();
  wrf: any;
  diaActual: any;
  historico: any;
  humedad: any;

  recomendacionRiego = '';
  umbralRiego = 0;

  cargando = true;
  errorCarga = '';

  cargandoHistorico = false;
  errorHistorico = '';

  profundidad = '0_5';
  variableHumedad = 'soilw010';

  fechaInicio = '2026-06-11';
  fechaFin = '2026-06-15';

  gddChartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        label: 'GDD',
        data: [],
        tension: 0.2,
        pointRadius: 3,
        borderWidth: 2
      }
    ]
  };

  gddChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        display: true
      }
    },
    scales: {
      x: {
        display: true
      },
      y: {
        display: true
      }
    }
  };

  humedadChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        label: 'Humedad',
        data: []
      }
    ]
  };

  humedadChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      y: {
        min: 0,
        max: 1
      }
    }
  };

  formatearFechaInput(fecha: Date): string {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

calcularFechaMinimaGdd(): string {
  const fecha = new Date();

  fecha.setFullYear(fecha.getFullYear() - 5);

  return this.formatearFechaInput(fecha);
}

calcularFechaMaximaGdd(): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 4);

  return this.formatearFechaInput(fecha);
}

validarRangoGdd(): boolean {

  if (this.fechaInicio < this.fechaMinimaGdd) {

    this.fechaInicio = this.fechaMinimaGdd;

    this.errorHistorico =
      `La fecha inicio no puede ser menor a ${this.fechaMinimaGdd}`;

    return false;
  }

  if (this.fechaFin > this.fechaMaximaGdd) {

    this.fechaFin = this.fechaMaximaGdd;

    this.errorHistorico =
      `La fecha fin no puede ser mayor a ${this.fechaMaximaGdd}`;

    return false;
  }

  if (this.fechaInicio > this.fechaFin) {

    this.errorHistorico =
      'La fecha inicio no puede ser mayor que la fecha fin';

    return false;
  }

  return true;
}

  constructor(
    private router: Router,
    private agroApi: AgroApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.lat = Number(localStorage.getItem('lat'));
    this.lon = Number(localStorage.getItem('lon'));

    if (!this.lat || !this.lon) {
      this.router.navigate(['/']);
      return;
    }

    this.cargarInicial();
  }

  puedeDescargar(): boolean {
    return this.authService.puedeDescargar();
  }

  volverMapa(): void {
    this.router.navigate(['/']);
  }

  cargarInicial(): void {
    this.cargando = true;
    this.errorCarga = '';

    forkJoin({
      wrf: this.agroApi.getWrfVigente(this.lat, this.lon).pipe(
        timeout(15000),
        catchError(err => {
          console.error('Error WRF:', err);
          return of(null);
        })
      ),
      humedad: this.agroApi.getHumedadBarra(
        this.lat,
        this.lon,
        this.profundidad,
        this.variableHumedad
      ).pipe(
        timeout(15000),
        catchError(err => {
          console.error('Error humedad:', err);
          return of(null);
        })
      )
    }).subscribe({
      next: (resp: any) => {
        console.log('RESP DASHBOARD:', resp);

        if (resp.wrf) {
          this.wrf = resp.wrf;
          this.diaActual = resp.wrf?.serie?.[0]?.variables;

          const fecha = resp.wrf?.serie?.[0]?.fecha;
          if (fecha) {
            this.fechaPronostico = fecha;
          }
        }

        if (resp.humedad) {
          this.humedad = resp.humedad;
          this.actualizarGraficaHumedad(resp.humedad);
        }

        if (!resp.wrf || !resp.humedad) {
          this.errorCarga = 'Algunos datos no pudieron cargarse.';
        }

        this.cargando = false;

        setTimeout(() => {
          this.cdr.detectChanges();
          this.humedadChart?.update();
        }, 0);
      },
      error: (err) => {
        console.error('Error general dashboard:', err);
        this.errorCarga = 'No se pudo cargar la información.';
        this.cargando = false;
      }
    });
  }

  cargarWrf(): void {
    this.agroApi.getWrfVigente(this.lat, this.lon).subscribe({
      next: (resp: any) => {
        this.wrf = resp;
        this.diaActual = resp?.serie?.[0]?.variables;
      },
      error: (err) => {
        console.error('Error cargando WRF:', err);
      }
    });
  }

  cargarHistorico(): void {
     if (!this.validarRangoGdd()) {
    return;
  }

  this.cargandoHistorico = true;
  this.errorHistorico = '';

  

    this.agroApi
      .getGddSerie(this.lat, this.lon, this.fechaInicio, this.fechaFin)
      .pipe(
        timeout(60000),
        catchError(err => {
          console.error('Error histórico GDD:', err);
          this.errorHistorico = 'No se pudo cargar el histórico GDD.';
          return of(null);
        }),
        finalize(() => {
          this.cargandoHistorico = false;

          setTimeout(() => {
            this.cdr.detectChanges();
            this.gddChart?.update();
          }, 0);
        })
      )
      .subscribe((resp: any) => {
        console.log('RESP HISTORICO:', resp);

        if (!resp || !resp.serie) {
          return;
        }

        const serieGrafica = this.agruparSerieGdd(resp.serie);

        this.historico = resp;

        this.gddChartData = {
          labels: serieGrafica.labels,
          datasets: [
            {
              label: 'GDD',
              data: serieGrafica.data,
              tension: 0.2,
              pointRadius: serieGrafica.data.length <= 90 ? 3 : 0,
              borderWidth: 2
            }
          ]
        };
      });
  }

  cargarHumedad(): void {
    this.agroApi
      .getHumedadBarra(
        this.lat,
        this.lon,
        this.profundidad,
        this.variableHumedad
      )
      .subscribe({
        next: (resp: any) => {
          this.humedad = resp;
          this.actualizarGraficaHumedad(resp);

          setTimeout(() => {
            this.cdr.detectChanges();
            this.humedadChart?.update();
          }, 0);
        },
        error: (err) => {
          console.error('Error cargando humedad:', err);
        }
      });
  }

  actualizarGraficaHumedad(resp: any): void {
    if (!resp || !resp.pronostico || !resp.referencia) {
      return;
    }

    const labels = resp.pronostico.map((x: any) => x.fecha);
    const humedadValores = resp.pronostico.map((x: any) => x.valor);

    const pmp = resp.referencia.pmp;
    const cc = resp.referencia.cc;

    this.umbralRiego = (pmp + cc) / 2;

    const valorActual = humedadValores[0];

    if (valorActual < this.umbralRiego) {
      this.recomendacionRiego = 'Regar';
    } else {
      this.recomendacionRiego = 'No regar';
    }

    const valoresValidos = humedadValores.filter(
      (x: any) => x !== null && x !== undefined
    );

    const minValor = Math.min(pmp, ...valoresValidos);
    const maxValor = Math.max(cc, ...valoresValidos);
    const margen = Math.abs(maxValor - minValor) * 0.08 || 0.1;

    this.humedadChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        y: {
          min: minValor - margen,
          max: maxValor + margen,
          title: {
            display: true,
            text: 'Humedad de suelo'
          }
        }
      }
    };

    this.humedadChartData = {
      labels,
      datasets: [
        {
          label: this.variableHumedad,
          data: humedadValores
        }
      ]
    };
  }

  agruparSerieGdd(serie: any[]): { labels: string[]; data: number[] } {
    const total = serie.length;

    if (total <= 90) {
      return {
        labels: serie.map(x => x.fecha),
        data: serie.map(x => x.gdd)
      };
    }

    const grupo = total > 730 ? 30 : 7;

    const labels: string[] = [];
    const data: number[] = [];

    for (let i = 0; i < serie.length; i += grupo) {
      const bloque = serie.slice(i, i + grupo);

      const valores = bloque
        .map(x => x.gdd)
        .filter(x => x !== null && x !== undefined);

      if (valores.length === 0) {
        continue;
      }

      const promedio =
        valores.reduce((a: number, b: number) => a + b, 0) / valores.length;

      labels.push(bloque[0].fecha);
      data.push(Number(promedio.toFixed(2)));
    }

    return {
      labels,
      data
    };
  }

  private getEstadoHumedad(): string {
    const estado = this.humedad?.estado;

    if (!estado) {
      return '-';
    }

    if (typeof estado === 'string') {
      return estado;
    }

    return estado.nombre || estado.nom_ent || estado.estado || '-';
  }

  private formatoNumero(valor: any, decimales = 2): string {
    if (valor === null || valor === undefined || valor === '') {
      return '-';
    }

    const numero = Number(valor);

    if (Number.isNaN(numero)) {
      return String(valor);
    }

    return numero.toFixed(decimales);
  }

  private descargarBlob(contenido: string, nombreArchivo: string, tipo: string): void {
    const blob = new Blob([contenido], {
      type: tipo
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = nombreArchivo;
    link.click();

    window.URL.revokeObjectURL(url);
  }

  private dibujarTextoPNG(
    ctx: CanvasRenderingContext2D,
    texto: string,
    x: number,
    y: number,
    font = '16px Arial',
    color = 'black'
  ): void {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(texto, x, y);
  }

  descargarGraficaPNG(tipo: 'humedad' | 'gdd'): void {
    if (!this.puedeDescargar()) {
      return;
    }

    const chart =
      tipo === 'humedad'
        ? this.humedadChart?.chart
        : this.gddChart?.chart;

    if (!chart) {
      return;
    }

    const original = chart.canvas;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    const ancho = Math.max(original.width, 1100);
    const altoInfo = tipo === 'humedad'
      ? 360
      : Math.min(520, 210 + ((this.historico?.serie?.length || 0) * 22));

    canvas.width = ancho;
    canvas.height = original.height + altoInfo + 40;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let y = 35;

    if (tipo === 'humedad') {
      const pmp = this.humedad?.referencia?.pmp;
      const cc = this.humedad?.referencia?.cc;

      this.dibujarTextoPNG(ctx, 'Reporte de Humedad de Suelo', 25, y, '24px Arial');
      y += 35;

      this.dibujarTextoPNG(ctx, `Lat: ${this.lat}`, 25, y);
      this.dibujarTextoPNG(ctx, `Lon: ${this.lon}`, 300, y);
      y += 28;

      this.dibujarTextoPNG(ctx, `Estado: ${this.getEstadoHumedad()}`, 25, y);
      y += 28;

      this.dibujarTextoPNG(ctx, `Profundidad: ${this.profundidad}`, 25, y);
      this.dibujarTextoPNG(ctx, `Variable: ${this.variableHumedad}`, 300, y);
      y += 28;

      this.dibujarTextoPNG(ctx, `PMP: ${this.formatoNumero(pmp, 4)}`, 25, y);
      this.dibujarTextoPNG(ctx, `CC: ${this.formatoNumero(cc, 4)}`, 300, y);
      this.dibujarTextoPNG(ctx, `Umbral medio: ${this.formatoNumero(this.umbralRiego, 4)}`, 520, y);
      y += 28;

      this.dibujarTextoPNG(ctx, `Recomendación: ${this.recomendacionRiego}`, 25, y, '18px Arial', '#1b5e20');
      y += 35;

      this.dibujarTextoPNG(ctx, 'Fecha', 25, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'Humedad', 200, y, 'bold 16px Arial');
      y += 22;

      this.humedad?.pronostico?.forEach((d: any) => {
        this.dibujarTextoPNG(ctx, String(d.fecha), 25, y);
        this.dibujarTextoPNG(ctx, this.formatoNumero(d.valor, 2), 200, y);
        y += 22;
      });

    } else {
      this.dibujarTextoPNG(ctx, 'Reporte Histórico GDD', 25, y, '24px Arial');
      y += 35;

      this.dibujarTextoPNG(ctx, `Lat: ${this.lat}`, 25, y);
      this.dibujarTextoPNG(ctx, `Lon: ${this.lon}`, 300, y);
      y += 28;

      this.dibujarTextoPNG(ctx, `Fecha inicio: ${this.fechaInicio}`, 25, y);
      this.dibujarTextoPNG(ctx, `Fecha fin: ${this.fechaFin}`, 300, y);
      y += 35;

      this.dibujarTextoPNG(ctx, 'Fecha', 25, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'Tmax', 180, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'Tmin', 300, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'GDD', 420, y, 'bold 16px Arial');
      y += 22;

      const serie = this.historico?.serie || [];
      const maxFilas = 14;

      serie.slice(0, maxFilas).forEach((d: any) => {
        this.dibujarTextoPNG(ctx, String(d.fecha), 25, y);
        this.dibujarTextoPNG(ctx, this.formatoNumero(d.tmax, 2), 180, y);
        this.dibujarTextoPNG(ctx, this.formatoNumero(d.tmin, 2), 300, y);
        this.dibujarTextoPNG(ctx, this.formatoNumero(d.gdd, 2), 420, y);
        y += 22;
      });

      if (serie.length > maxFilas) {
        this.dibujarTextoPNG(ctx, `... ${serie.length - maxFilas} registros adicionales en CSV/PDF`, 25, y);
        y += 28;
      }
    }

    ctx.drawImage(
      original,
      0,
      y + 20,
      original.width,
      original.height
    );

    const link = document.createElement('a');

    link.href = canvas.toDataURL('image/png');
    link.download =
      tipo === 'humedad'
        ? 'humedad_suelo.png'
        : 'historico_gdd.png';

    link.click();
  }

  descargarCSV(tipo: 'humedad' | 'gdd'): void {
    if (!this.puedeDescargar()) {
      return;
    }

    if (tipo === 'humedad') {
      const pmp = this.humedad?.referencia?.pmp ?? '';
      const cc = this.humedad?.referencia?.cc ?? '';
      const estado = this.getEstadoHumedad();

      let csv = 'lat,lon,estado,pmp,cc,fecha,humedad\n';

      this.humedad?.pronostico?.forEach((x: any) => {
        csv += `${this.lat},${this.lon},${estado},${pmp},${cc},${x.fecha},${x.valor}\n`;
      });

      this.descargarBlob(
        csv,
        'humedad_suelo.csv',
        'text/csv;charset=utf-8;'
      );

      return;
    }

    if (tipo === 'gdd') {
      let csv = 'lat,lon,fecha,tmax,tmin,gdd\n';

      this.historico?.serie?.forEach((x: any) => {
        csv += `${this.lat},${this.lon},${x.fecha},${x.tmax},${x.tmin},${x.gdd}\n`;
      });

      this.descargarBlob(
        csv,
        'historico_gdd.csv',
        'text/csv;charset=utf-8;'
      );
    }
  }

  descargarPDF(tipo: 'humedad' | 'gdd'): void {
    if (!this.puedeDescargar()) {
      return;
    }

    const chart =
      tipo === 'humedad'
        ? this.humedadChart?.chart
        : this.gddChart?.chart;

    if (!chart) {
      return;
    }

    const img = chart.toBase64Image();
    const pdf = new jsPDF('landscape', 'mm', 'a4');

    pdf.setFontSize(16);

    if (tipo === 'humedad') {
      const pmp = this.humedad?.referencia?.pmp;
      const cc = this.humedad?.referencia?.cc;

      pdf.text('Reporte de Humedad de Suelo', 15, 15);

      pdf.setFontSize(10);
      pdf.text(`Lat: ${this.lat}`, 15, 25);
      pdf.text(`Lon: ${this.lon}`, 80, 25);
      pdf.text(`Fecha pronóstico: ${this.fechaPronostico || '-'}`, 150, 25);

      pdf.text(`Estado: ${this.getEstadoHumedad()}`, 15, 32);
      pdf.text(`Profundidad: ${this.profundidad}`, 80, 32);
      pdf.text(`Variable: ${this.variableHumedad}`, 150, 32);

      pdf.text(`PMP: ${this.formatoNumero(pmp, 4)}`, 15, 39);
      pdf.text(`CC: ${this.formatoNumero(cc, 4)}`, 80, 39);
      pdf.text(`Umbral medio: ${this.formatoNumero(this.umbralRiego, 4)}`, 150, 39);
      pdf.text(`Recomendación: ${this.recomendacionRiego}`, 220, 39);

      let y = 50;

      pdf.setFontSize(9);
      pdf.text('Fecha', 15, y);
      pdf.text('Humedad', 55, y);

      y += 6;

      this.humedad?.pronostico?.forEach((d: any) => {
        pdf.text(String(d.fecha), 15, y);
        pdf.text(this.formatoNumero(d.valor, 2), 55, y);
        y += 6;
      });

      pdf.addImage(img, 'PNG', 90, 48, 185, 115);

      pdf.save('reporte_humedad_suelo.pdf');
      return;
    }

    if (tipo === 'gdd') {
      pdf.text('Reporte Histórico GDD', 15, 15);

      pdf.setFontSize(10);
      pdf.text(`Lat: ${this.lat}`, 15, 25);
      pdf.text(`Lon: ${this.lon}`, 80, 25);
      pdf.text(`Fecha inicio: ${this.fechaInicio}`, 150, 25);
      pdf.text(`Fecha fin: ${this.fechaFin}`, 220, 25);

     const serie = this.historico?.serie || [];

const totalDias = serie.length;

const promedio =
  totalDias > 0
    ? serie.reduce(
        (a: number, b: any) => a + Number(b.gdd || 0),
        0
      ) / totalDias
    : 0;

const maxGdd =
  totalDias > 0
    ? Math.max(...serie.map((x: any) => Number(x.gdd || 0)))
    : 0;

const minGdd =
  totalDias > 0
    ? Math.min(...serie.map((x: any) => Number(x.gdd || 0)))
    : 0;

pdf.text(`Total registros: ${totalDias}`, 15, 40);
pdf.text(`GDD promedio: ${promedio.toFixed(2)}`, 15, 48);
pdf.text(`GDD mínimo: ${minGdd.toFixed(2)}`, 15, 56);
pdf.text(`GDD máximo: ${maxGdd.toFixed(2)}`, 15, 64);

      pdf.addImage(
  img,
  'PNG',
  70,
  75,
  200,
  110
);

      pdf.save('reporte_historico_gdd.pdf');
    }
  }
}