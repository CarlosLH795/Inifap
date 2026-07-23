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
  aud = 0;
  audTitulo = '';
  audMensaje = '';
  audClase = '';
  humedadActualAud: number | null = null;
  pronosticoResumen: any[] = [];
  cargando = true;
  errorCarga = '';
  gddAcumulado = 0;
  vpdActual: number | null = null;
  vpdClase = 'vpd-sin-datos';
  vpdTitulo = 'Datos insuficientes';
  vpdMensaje = 'No fue posible calcular el déficit de presión de vapor.';
  // Contiene la información exacta de cada punto mostrado en la gráfica.
  // Para consultas cortas representa un día; para consultas largas,
  // un bloque semanal o mensual.
  gddSerieGrafica: Array<{
    fechaInicio: string;
    fechaFin: string;
    dias: number;
    gdd: number;
    tmax: number | null;
    tmin: number | null;
  }> = [];

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
    },
    tooltip: {
      callbacks: {
        title: (items) => {
          const punto = this.gddSerieGrafica[items[0]?.dataIndex];

          if (!punto) {
            return String(items[0]?.label ?? '');
          }

          return punto.fechaInicio === punto.fechaFin
            ? punto.fechaInicio
            : `${punto.fechaInicio} al ${punto.fechaFin}`;
        },
        label: (context) => {
          const punto = this.gddSerieGrafica[context.dataIndex];
          const gdd = punto?.gdd ?? Number(context.raw ?? 0);

          return [
            `GDD ${this.cultivoGdd.toUpperCase()}: ${gdd.toFixed(2)}`,
            `Tmax promedio: ${
              punto?.tmax !== null && punto?.tmax !== undefined
                ? punto.tmax.toFixed(2)
                : '-'
            } °C`,
            `Tmin promedio: ${
              punto?.tmin !== null && punto?.tmin !== undefined
                ? punto.tmin.toFixed(2)
                : '-'
            } °C`,
            `Días representados: ${punto?.dias ?? 1}`
          ];
        }
      }
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
          this.actualizarAlertaVpd(
                this.diaActual?.temp,
                this.diaActual?.rh
                  );
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
        this.actualizarAlertaVpd(
            this.diaActual?.temp,
            this.diaActual?.rh
          );
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

      this.gddSerieGrafica = serieGrafica.puntos;

      this.gddChartData = {
        labels: serieGrafica.labels,
        datasets: [
          {
            label: `GDD ${this.cultivoGdd.toUpperCase()}`,
            data: serieGrafica.data,
            tension: 0.2,
            pointRadius: serieGrafica.data.length <= 90 ? 3 : 0,
            pointHoverRadius: 5,
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

  private convertirHumedadWrf(valor: unknown): number | null {
    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
      return null;
    }

    return Number((numero / 100).toFixed(4));
  }

  private calcularAud(
    humedad: number | null,
    pmp: number | null,
    cc: number | null
  ): number | null {
    if (
      humedad === null ||
      pmp === null ||
      cc === null ||
      cc <= pmp
    ) {
      return null;
    }

    const resultado = ((humedad - pmp) / (cc - pmp)) * 100;

    if (!Number.isFinite(resultado)) {
      return null;
    }

    return Number(Math.max(0, resultado).toFixed(1));
  }

  private actualizarAlertaAud(
    humedad: number | null,
    pmp: number | null,
    cc: number | null
  ): void {
    this.humedadActualAud = humedad;

    const audCalculado = this.calcularAud(humedad, pmp, cc);

    if (audCalculado === null) {
      this.aud = 0;
      this.audClase = 'aud-sin-datos';
      this.audTitulo = 'Datos insuficientes';
      this.audMensaje =
        'No fue posible calcular el agua útil disponible para este punto.';
      return;
    }

    this.aud = audCalculado;

    if (this.aud > 100) {
      this.audClase = 'aud-saturado';
      this.audTitulo = 'Suelo saturado';
      this.audMensaje =
        'Existe riesgo de asfixia radicular si esta condición permanece.';
      return;
    }

    if (this.aud >= 50) {
      this.audClase = 'aud-optimo';
      this.audTitulo = 'Zona de confort';
      this.audMensaje =
        'El cultivo dispone de agua útil suficiente en el suelo.';
      return;
    }

    if (this.aud > 0) {
      this.audClase = 'aud-riego';
      this.audTitulo = 'Umbral de riego crítico';
      this.audMensaje =
        'Es necesario regar o vigilar el cultivo ante posible estrés hídrico.';
      return;
    }

    this.audClase = 'aud-estres';
    this.audTitulo = 'Punto de marchitez';
    this.audMensaje =
      'La disponibilidad de agua es prácticamente nula y existe riesgo severo para el cultivo.';
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
      resp.pronostico.map((x: any) =>
        this.convertirHumedadWrf(x.valor)
      );

    const pmpNumero = Number(resp.referencia.pmp);
    const ccNumero = Number(resp.referencia.cc);

    const pmpGrafica: number | null =
      Number.isFinite(pmpNumero)
        ? Number(pmpNumero.toFixed(4))
        : null;

    const ccGrafica: number | null =
      Number.isFinite(ccNumero)
        ? Number(ccNumero.toFixed(4))
        : null;

   const valorActual =
      humedadValores.find(
        (valor): valor is number => valor !== null
      ) ?? null;

    this.actualizarAlertaAud(
      valorActual,
      pmpGrafica,
      ccGrafica
    );

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

  calcularVpd(
  temperatura: unknown,
  humedadRelativa: unknown
): number | null {

  const temp = Number(temperatura);
  const rh = Number(humedadRelativa);

  if (
    !Number.isFinite(temp) ||
    !Number.isFinite(rh) ||
    rh < 0 ||
    rh > 100
  ) {
    return null;
  }

  const presionSaturacion =
    0.6108 *
    Math.exp(
      (17.27 * temp) /
      (temp + 237.3)
    );

  const presionReal =
    presionSaturacion *
    (rh / 100);

  const vpd =
    presionSaturacion -
    presionReal;

  return Number(
    Math.max(0, vpd).toFixed(2)
  );
}


actualizarAlertaVpd(
  temperatura: unknown,
  humedadRelativa: unknown
): void {

  this.vpdActual =
    this.calcularVpd(
      temperatura,
      humedadRelativa
    );

  if (this.vpdActual === null) {
    this.vpdClase = 'vpd-sin-datos';
    this.vpdTitulo = 'Datos insuficientes';
    this.vpdMensaje =
      'No fue posible calcular el déficit de presión de vapor.';
    return;
  }

  if (this.vpdActual < 0.4) {
    this.vpdClase = 'vpd-muy-humedo';
    this.vpdTitulo = 'Humedad muy alta';
    this.vpdMensaje =
      'Existe mayor riesgo de enfermedades de origen fúngico.';
    return;
  }

  if (this.vpdActual < 0.8) {
    this.vpdClase = 'vpd-humedo';
    this.vpdTitulo = 'Ambiente húmedo';
    this.vpdMensaje =
      'La demanda atmosférica de agua es baja.';
    return;
  }

  if (this.vpdActual <= 1.2) {
    this.vpdClase = 'vpd-optimo';
    this.vpdTitulo = 'Rango óptimo';
    this.vpdMensaje =
      'Condiciones favorables para la mayoría de los cultivos.';
    return;
  }

  if (this.vpdActual <= 2.0) {
    this.vpdClase = 'vpd-seco';
    this.vpdTitulo = 'Demanda evaporativa alta';
    this.vpdMensaje =
      'Conviene vigilar el estado hídrico del cultivo.';
    return;
  }

  this.vpdClase = 'vpd-estres';
  this.vpdTitulo = 'Estrés atmosférico';
  this.vpdMensaje =
    'El aire está muy seco y la planta puede cerrar sus estomas.';
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


  agruparSerieGdd(serie: any[]): {
    labels: string[];
    data: number[];
    puntos: Array<{
      fechaInicio: string;
      fechaFin: string;
      dias: number;
      gdd: number;
      tmax: number | null;
      tmin: number | null;
    }>;
  } {
    const total = serie.length;

    // Hasta 90 registros se muestra un punto por día.
    const tamanoGrupo = total <= 90
      ? 1
      : total > 730
        ? 30
        : 7;

    const labels: string[] = [];
    const data: number[] = [];
    const puntos: Array<{
      fechaInicio: string;
      fechaFin: string;
      dias: number;
      gdd: number;
      tmax: number | null;
      tmin: number | null;
    }> = [];

    const promedioValido = (
      bloque: any[],
      campo: 'gdd' | 'tmax' | 'tmin'
    ): number | null => {
      const valores = bloque
        .map(item => Number(item?.[campo]))
        .filter(valor => Number.isFinite(valor));

      if (valores.length === 0) {
        return null;
      }

      const promedio =
        valores.reduce((acumulado, valor) => acumulado + valor, 0)
        / valores.length;

      return Number(promedio.toFixed(2));
    };

    for (let i = 0; i < serie.length; i += tamanoGrupo) {
      const bloque = serie.slice(i, i + tamanoGrupo);

      if (bloque.length === 0) {
        continue;
      }

      const gddPromedio = promedioValido(bloque, 'gdd');

      if (gddPromedio === null) {
        continue;
      }

      const fechaInicio = String(bloque[0].fecha);
      const fechaFin = String(bloque[bloque.length - 1].fecha);
      const tmaxPromedio = promedioValido(bloque, 'tmax');
      const tminPromedio = promedioValido(bloque, 'tmin');

      labels.push(
        tamanoGrupo === 1
          ? fechaInicio
          : `${fechaInicio} - ${fechaFin}`
      );

      data.push(gddPromedio);

      puntos.push({
        fechaInicio,
        fechaFin,
        dias: bloque.length,
        gdd: gddPromedio,
        tmax: tmaxPromedio,
        tmin: tminPromedio
      });
    }

    return {
      labels,
      data,
      puntos
    };
  }

  cambiarProfundidad(): void {
    this.errorCarga = '';
    this.cargarHumedad();
  }

  cambiarVariableHumedad(): void {
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
      this.dibujarTextoPNG(
        ctx,
        `Humedad WRF: ${this.formatoNumero(this.humedadActualAud, 4)} m³/m³`,
        520,
        y
      );
      y += 28;

      this.dibujarTextoPNG(
        ctx,
        `AUD: ${this.formatoNumero(this.aud, 1)}% - ${this.audTitulo}`,
        25,
        y,
        'bold 18px Arial',
        '#1b5e20'
      );
      y += 26;

      this.dibujarTextoPNG(ctx, this.audMensaje, 25, y, '15px Arial');
      y += 35;

      this.dibujarTextoPNG(ctx, 'Fecha', 25, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'Humedad', 200, y, 'bold 16px Arial');
      y += 22;

      this.humedad?.pronostico?.forEach((d: any) => {
        this.dibujarTextoPNG(ctx, String(d.fecha), 25, y);
        const humedadConvertida = this.convertirHumedadWrf(d.valor);
        this.dibujarTextoPNG(
          ctx,
          `${this.formatoNumero(humedadConvertida, 4)} m³/m³`,
          200,
          y
        );
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

      let csv =
        'lat,lon,estado,profundidad,variable,unidad,pmp,cc,fecha,humedad_wrf,aud_porcentaje\n';

      this.humedad?.pronostico?.forEach((x: any) => {
        const humedadConvertida = this.convertirHumedadWrf(x.valor);
        const audFecha = this.calcularAud(
          humedadConvertida,
          Number.isFinite(Number(pmp)) ? Number(pmp) : null,
          Number.isFinite(Number(cc)) ? Number(cc) : null
        );

        csv += `${this.lat},${this.lon},${estado},${this.profundidad},${this.variableHumedad},m3/m3,${pmp},${cc},${x.fecha},${humedadConvertida ?? ''},${audFecha ?? ''}\n`;
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
      pdf.text(
        `Humedad WRF: ${this.formatoNumero(this.humedadActualAud, 4)} m³/m³`,
        150,
        39
      );

      pdf.setFont('helvetica', 'bold');
      pdf.text(
        `AUD: ${this.formatoNumero(this.aud, 1)}% - ${this.audTitulo}`,
        15,
        47
      );
      pdf.setFont('helvetica', 'normal');
      pdf.text(this.audMensaje, 80, 47);

      let y = 58;

      pdf.setFontSize(9);
      pdf.text('Fecha', 15, y);
      pdf.text('Humedad', 55, y);

      y += 6;

      this.humedad?.pronostico?.forEach((d: any) => {
        pdf.text(String(d.fecha), 15, y);
        const humedadConvertida = this.convertirHumedadWrf(d.valor);
        pdf.text(
          `${this.formatoNumero(humedadConvertida, 4)} m³/m³`,
          55,
          y
        );
        y += 6;
      });

      pdf.addImage(img, 'PNG', 90, 58, 185, 110);

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