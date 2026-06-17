import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { forkJoin, timeout, catchError, of, finalize } from 'rxjs';
import jsPDF from 'jspdf';
import { Navbar } from '../navbar/navbar';
import { AgroApiService } from '../services/agro-api.services';

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

  lat!: number;
  lon!: number;

  fechaPronostico = '';

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
    scales: {
      y: {
        min: 0,
        max: 1
      }
    }
  };

  descargarGraficaPNG(tipo: 'humedad' | 'gdd'): void {
  const chart =
    tipo === 'humedad'
      ? this.humedadChart?.chart
      : this.gddChart?.chart;

  if (!chart) return;

  const link = document.createElement('a');
  link.href = chart.toBase64Image();
  link.download = tipo === 'humedad'
    ? 'humedad_suelo.png'
    : 'historico_gdd.png';

  link.click();
}

descargarCSV(tipo: 'humedad' | 'gdd'): void {
  let csv = '';
  let nombre = '';

  if (tipo === 'humedad') {
    csv = 'fecha,valor\n';

    this.humedad?.pronostico?.forEach((x: any) => {
      csv += `${x.fecha},${x.valor}\n`;
    });

    nombre = 'humedad_suelo.csv';
  }

  if (tipo === 'gdd') {
    csv = 'fecha,gdd\n';

    this.historico?.serie?.forEach((x: any) => {
      csv += `${x.fecha},${x.gdd}\n`;
    });

    nombre = 'historico_gdd.csv';
  }

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = nombre;
  link.click();

  window.URL.revokeObjectURL(url);
}

descargarPDF(tipo: 'humedad' | 'gdd'): void {
  const chart =
    tipo === 'humedad'
      ? this.humedadChart?.chart
      : this.gddChart?.chart;

  if (!chart) return;

  const img = chart.toBase64Image();
  const pdf = new jsPDF('landscape', 'mm', 'a4');

  const titulo = tipo === 'humedad'
    ? 'Reporte de Humedad de Suelo'
    : 'Reporte Histórico GDD';

  pdf.setFontSize(16);
  pdf.text(titulo, 15, 15);

  pdf.setFontSize(10);
  pdf.text(`Lat: ${this.lat}`, 15, 23);
  pdf.text(`Lon: ${this.lon}`, 15, 29);
  pdf.text(`Fecha pronóstico: ${this.fechaPronostico || '-'}`, 15, 35);

  if (tipo === 'humedad') {
    pdf.text(`Profundidad: ${this.profundidad}`, 15, 41);
    pdf.text(`Variable: ${this.variableHumedad}`, 15, 47);
    pdf.text(`Estado: ${this.humedad?.estado?.nombre || '-'}`, 15, 53);
  }

  if (tipo === 'gdd') {
    pdf.text(`Fecha inicio: ${this.fechaInicio}`, 15, 41);
    pdf.text(`Fecha fin: ${this.fechaFin}`, 15, 47);
  }

  pdf.addImage(img, 'PNG', 15, 60, 260, 120);

  pdf.save(
    tipo === 'humedad'
      ? 'reporte_humedad_suelo.pdf'
      : 'reporte_historico_gdd.pdf'
  );
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
}