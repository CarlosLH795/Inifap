import { Component, OnInit, ChangeDetectorRef, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { forkJoin, timeout, catchError, of } from 'rxjs';
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
  cultivoGdd: 'maiz' | 'frijol' | 'sorgo' = 'frijol';
  recomendacionRiego = '';
  umbralRiego = 0;
  pronosticoResumen: any[] = [];
  cargando = true;
  errorCarga = '';
  gddAcumulado = 0;
  cargandoHistorico = false;
  errorHistorico = '';

  profundidad = '0_10';
  variableHumedad = 'soilw010';

  fechaInicio = new Date(
  new Date().setDate(new Date().getDate() - 5)
).toLocaleDateString('en-CA');

fechaFin = new Date().toLocaleDateString('en-CA');

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

  layout: {
    padding: {
      top: 10,
      right: 10,
      bottom: 28,
      left: 5
    }
  },

  plugins: {
    legend: {
      display: true,
      position: 'top'
    }
  },

  scales: {
    x: {
      display: true,
      offset: false,

      ticks: {
        display: true,
        autoSkip: true,
        maxTicksLimit: 12,
        maxRotation: 45,
        minRotation: 30,
        padding: 8
      },

      grid: {
        display: true
      }
    },

    y: {
      display: true,
      beginAtZero: true,

      ticks: {
        display: true
      },

      grid: {
        display: true
      }
    }
  }
};

  humedadChartData: ChartData<'bar' | 'line'> = {
    labels: [],
    datasets: [
      {
        label: 'Humedad',
        data: []
      }
    ]
  };

  humedadChartOptions: ChartConfiguration<'bar' | 'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const valor = Number(context.raw ?? 0);
            return `${context.dataset.label}: ${valor.toFixed(4)} m³/m³`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        offset: true,
        ticks: {
          display: true,
          autoSkip: false,
          maxRotation: 45,
          minRotation: 30
        },
        grid: {
          display: true
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Humedad volumétrica (m³/m³)'
        },
        ticks: {
          display: true,
          callback: (value) => Number(value).toFixed(3)
        }
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
  const fecha = new Date('1995-01-01');

  fecha.setFullYear(fecha.getFullYear() - 5);

  return this.formatearFechaInput(fecha);
}

calcularFechaMaximaGdd(): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 4);

  return this.formatearFechaInput(fecha);
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
          this.pronosticoResumen = resp.wrf?.serie?.slice(0, 5).map((d: any) => ({
              fecha: d.fecha,
              tmax: d.variables?.tmax,
              tmin: d.variables?.tmin,
              rain: d.variables?.rain,
              rh: d.variables?.rh
            })) || [];
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
 
const inicio = new Date(this.fechaInicio);
const limite = new Date(inicio);

limite.setFullYear(limite.getFullYear() + 5);

if (new Date(this.fechaFin) > limite) {

    this.errorHistorico =
      'El rango entre las fechas no puede ser mayor a 5 años.';

    return;
}
  this.gddAcumulado = 0;
  this.cargandoHistorico = true;
  this.errorHistorico = '';
  this.historico = null;

  this.agroApi
    .getGddSerie(
      this.lat,
      this.lon,
      this.fechaInicio,
      this.fechaFin,
      this.cultivoGdd
    )
    .pipe(
      timeout(120000),
      catchError(err => {
        console.error('Error histórico GDD:', err);
        this.errorHistorico = 'No se pudo cargar el histórico GDD.';
        return of(null);
      })
    )
    .subscribe((resp: any) => {
      this.cargandoHistorico = false;

      if (!resp || !Array.isArray(resp.serie) || resp.serie.length === 0) {
        this.errorHistorico = 'No hay datos GDD para la consulta.';
        return;
      }

      this.historico = resp;
      this.gddAcumulado = resp.serie.reduce(
  (acumulado: number, item: any) =>
    acumulado + Number(item.gdd || 0),
  0
);
      const serieGrafica = this.agruparSerieGdd(resp.serie);

      this.gddChartData = {
        labels: serieGrafica.labels,
        datasets: [
          {
            label: `GDD ${this.cultivoGdd.toUpperCase()}`,
            data: serieGrafica.data,
            tension: 0.2,
            pointRadius: serieGrafica.data.length <= 90 ? 3 : 0,
            borderWidth: 2
          }
        ]
      };

      setTimeout(() => {
        this.cdr.detectChanges();
        this.gddChart?.update();
      }, 0);
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
    if (
      !resp ||
      !Array.isArray(resp.pronostico) ||
      !resp.referencia
    ) {
      return;
    }

    const labels: string[] = resp.pronostico.map(
      (x: any) => String(x.fecha)
    );

    const humedadValores: Array<number | null> =
      resp.pronostico.map((x: any) => {
        const valor = Number(x.valor);
        return Number.isFinite(valor) ? valor : null;
      });

    const pmpNumero = Number(resp.referencia.pmp);
    const ccNumero = Number(resp.referencia.cc);

    const pmpGrafica: number | null =
      Number.isFinite(pmpNumero) ? pmpNumero : null;

    const ccGrafica: number | null =
      Number.isFinite(ccNumero) ? ccNumero : null;

    this.umbralRiego =
      pmpGrafica !== null && ccGrafica !== null
        ? (pmpGrafica + ccGrafica) / 2
        : 0;

    const valorActual = humedadValores.find(
      (valor): valor is number => valor !== null
    );

    this.recomendacionRiego =
      valorActual !== undefined &&
      valorActual < this.umbralRiego
        ? 'Regar'
        : 'No regar';

    const valoresEscala: number[] = [
      ...humedadValores.filter(
        (valor): valor is number => valor !== null
      ),
      ...(pmpGrafica !== null ? [pmpGrafica] : []),
      ...(ccGrafica !== null ? [ccGrafica] : [])
    ];

    if (valoresEscala.length === 0) {
      return;
    }

    const minValor = Math.min(...valoresEscala);
    const maxValor = Math.max(...valoresEscala);
    const diferencia = maxValor - minValor;
    const margen = diferencia > 0 ? diferencia * 0.12 : 0.01;
    const unidad = resp.unidad || 'm³/m³';

    this.humedadChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      layout: {
        padding: {
          top: 4,
          right: 8,
          bottom: 8,
          left: 4
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: (context: any) => {
              const valor = Number(context.parsed.y);
              return `${context.dataset.label}: ${valor.toFixed(4)} ${unidad}`;
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          offset: true,
          ticks: {
            display: true,
            autoSkip: false,
            maxRotation: 45,
            minRotation: 30,
            padding: 8
          },
          grid: {
            display: true
          }
        },
        y: {
          display: true,
          suggestedMin: Math.max(0, minValor - margen),
          suggestedMax: maxValor + margen,
          title: {
            display: true,
            text: `Humedad volumétrica (${unidad})`
          },
          ticks: {
            callback: (value: any) => Number(value).toFixed(3)
          },
          grid: {
            display: true
          }
        }
      }
    };

    this.humedadChartData = {
      labels,
      datasets: [
        {
          type: 'bar',
          label: this.variableHumedad,
          data: humedadValores,
          order: 3,
          backgroundColor: '#96caf5',
          borderColor: '#96c7ee',
          borderWidth: 1
        },
        {
          type: 'line',
          label: 'PMP',
          data: labels.map(() => pmpGrafica),
          borderColor: '#ff4f75',
          backgroundColor: 'rgba(255, 79, 117, 0.20)',
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 3,
          tension: 0,
          spanGaps: true,
          order: 1
        },
        {
          type: 'line',
          label: 'CC',
          data: labels.map(() => ccGrafica),
          borderColor: '#ff9f40',
          backgroundColor: 'rgba(255, 159, 64, 0.20)',
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 3,
          tension: 0,
          spanGaps: true,
          order: 2
        }
      ]
    };
  }

  obtenerVelocidadViento(u: number, v: number): number {
  return Math.sqrt(u * u + v * v);
}

obtenerDireccionViento(u: number, v: number): string {

  const angulo = (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;

  const direcciones = [
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SO',
    'O',
    'NO'
  ];

  return direcciones[Math.round(angulo / 45) % 8];
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

  private readonly variablePorProfundidad: Record<string, string> = {
  '0_10': 'soilw010',
  '10_40': 'soilw1040'
};


  cambiarProfundidad(): void {
  const variable = this.variablePorProfundidad[this.profundidad];

  if (!variable) {
    this.errorCarga =
      `No existe una variable WRF disponible para la profundidad ${this.profundidad.replace('_', '-')} cm.`;

    this.humedad = null;

    this.humedadChartData = {
      labels: [],
      datasets: []
    };

    this.humedadChart?.update();
    return;
  }

  this.variableHumedad = variable;
  this.errorCarga = '';

  this.cargarHumedad();
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

      this.dibujarTextoPNG(ctx, `PMP: ${this.formatoNumero(pmp, 4)} m³/m³`, 25, y);
      this.dibujarTextoPNG(ctx, `CC: ${this.formatoNumero(cc, 4)} m³/m³`, 300, y);
      this.dibujarTextoPNG(ctx, `Umbral medio: ${this.formatoNumero(this.umbralRiego, 4)} m³/m³`, 520, y);
      y += 28;

      this.dibujarTextoPNG(ctx, `Recomendación: ${this.recomendacionRiego}`, 25, y, '18px Arial', '#1b5e20');
      y += 35;

      this.dibujarTextoPNG(ctx, 'Fecha', 25, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'Humedad', 200, y, 'bold 16px Arial');
      y += 22;

      this.humedad?.pronostico?.forEach((d: any) => {
        this.dibujarTextoPNG(ctx, String(d.fecha), 25, y);
        this.dibujarTextoPNG(ctx, `${this.formatoNumero(d.valor, 4)} m³/m³`, 200, y);
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
      y += 28;

      this.dibujarTextoPNG(
        ctx,
        `GDD acumulado: ${this.formatoNumero(this.gddAcumulado, 2)}`,
        25,
        y,
        'bold 18px Arial',
        '#1b5e20'
      );
      this.dibujarTextoPNG(
        ctx,
        `Cultivo: ${this.cultivoGdd.toUpperCase()}`,
        300,
        y
      );
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

      let csv = 'lat,lon,estado,profundidad,variable,unidad,pmp,cc,fecha,humedad\n';

      this.humedad?.pronostico?.forEach((x: any) => {
        csv += `${this.lat},${this.lon},${estado},${this.profundidad},${this.variableHumedad},m3/m3,${pmp},${cc},${x.fecha},${x.valor}\n`;
      });

      this.descargarBlob(
        csv,
        'humedad_suelo.csv',
        'text/csv;charset=utf-8;'
      );

      return;
    }

    if (tipo === 'gdd') {
      let csv = '';
      csv += `gdd_acumulado,${this.gddAcumulado.toFixed(2)}\n`;
      csv += `fecha_inicio,${this.fechaInicio}\n`;
      csv += `fecha_fin,${this.fechaFin}\n`;
      csv += `cultivo,${this.cultivoGdd.toUpperCase()}\n`;
      csv += '\n';
      csv += 'lat,lon,fecha,tmax,tmin,gdd\n';

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

      pdf.text(`PMP: ${this.formatoNumero(pmp, 4)} m³/m³`, 15, 39);
      pdf.text(`CC: ${this.formatoNumero(cc, 4)} m³/m³`, 80, 39);
      pdf.text(`Umbral medio: ${this.formatoNumero(this.umbralRiego, 4)} m³/m³`, 150, 39);
      pdf.text(`Recomendación: ${this.recomendacionRiego}`, 220, 39);

      let y = 50;

      pdf.setFontSize(9);
      pdf.text('Fecha', 15, y);
      pdf.text('Humedad', 55, y);

      y += 6;

      this.humedad?.pronostico?.forEach((d: any) => {
        pdf.text(String(d.fecha), 15, y);
        pdf.text(`${this.formatoNumero(d.valor, 4)} m³/m³`, 55, y);
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

pdf.setFont('helvetica', 'bold');
pdf.setTextColor(27, 94, 32);
pdf.setFontSize(14);
pdf.text(`GDD acumulado: ${this.gddAcumulado.toFixed(2)}`, 15, 40);

pdf.setFont('helvetica', 'normal');
pdf.setTextColor(0, 0, 0);
pdf.setFontSize(10);
pdf.text(`Cultivo: ${this.cultivoGdd.toUpperCase()}`, 15, 48);
pdf.text(`Total registros: ${totalDias}`, 15, 56);
pdf.text(`GDD promedio: ${promedio.toFixed(2)}`, 15, 64);
pdf.text(`GDD mínimo: ${minGdd.toFixed(2)}`, 15, 72);
pdf.text(`GDD máximo: ${maxGdd.toFixed(2)}`, 15, 80);

      pdf.addImage(
  img,
  'PNG',
  70,
  85,
  200,
  100
);

      pdf.save('reporte_historico_gdd.pdf');
    }
  }
}