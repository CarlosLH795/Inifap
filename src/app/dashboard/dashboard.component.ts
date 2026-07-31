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
  usoSuelo: {
  clave: string | null;
  descripcion: string;
  grupo: string;
  area_ha?: number | null;
  fuente?: string;
} | null = null;
  historico: any;
  humedad: any;
  et0Metodo = '';
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
  et0Actual: number | null = null;
  et0HargreavesActual: number | null = null;
  aporteAerodinamicoActual: number | null = null;
  viento2mActual: number | null = null;
  radiacionExtraterrestreActual: number | null = null;
  et0Titulo = 'ET₀ no disponible';
  et0Mensaje = 'No fue posible calcular la evapotranspiración de referencia.';

  /*
   * CAMBIO RÁPIDO DEL MÉTODO MOSTRADO
   * true  = Hargreaves + aporte aerodinámico experimental
   * false = Hargreaves–Samani original
   *
   * Para regresar a mostrar solamente Hargreaves, cambia true por false.
   */
  private readonly USAR_ET0_AJUSTADA_EXPERIMENTAL = true;
  pronosticoVpd: Array<{
  fecha: string;
  valor: number | null;
  titulo: string;
  clase: string;
}> = [];

pronosticoEt0: Array<{
  fecha: string;
  valor: number | null;
  titulo: string;
  clase: string;
}> = [];
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
      bottom: 85,
      left: 8
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
    maxTicksLimit: 6,
    maxRotation: 45,
    minRotation: 45,
    padding: 12
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
          this.usoSuelo = resp.wrf?.uso_suelo ?? null;
          this.diaActual = resp.wrf?.serie?.[0]?.variables;
          const primerDia = resp.wrf?.serie?.[0];

              this.actualizarEt0Actual(
                primerDia?.fecha,
                primerDia?.variables
              );
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
          this.actualizarPronosticosAtmosfericos(
            resp.wrf?.serie ?? []
          );
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
        this.usoSuelo = resp?.uso_suelo ?? null;
        this.diaActual = resp?.serie?.[0]?.variables;
        this.actualizarPronosticosAtmosfericos(
          resp?.serie ?? []
        );
        const primerDia = resp?.serie?.[0];

            this.actualizarAlertaVpd(
              primerDia?.variables?.temp,
              primerDia?.variables?.rh
            );

            this.actualizarEt0Actual(
              primerDia?.fecha,
              primerDia?.variables
            );
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

  private obtenerContextoAudPorDescripcion(
    aud: number
  ): string {
    const descripcion =
      this.usoSuelo?.descripcion
        ?.trim()
        .toUpperCase()
      ?? '';

    const grupo =
      this.usoSuelo?.grupo
        ?.trim()
        .toLowerCase()
      ?? '';

    if (!descripcion && !grupo) {
      return '';
    }

    const esOptimo = aud >= 80;
    const esConfort = aud >= 50 && aud < 80;
    const esAgotamiento = aud >= 20 && aud < 50;

    // =====================================================
    // CULTIVOS AGRÍCOLAS
    // =====================================================
    if (
      grupo === 'agricultura' ||
      descripcion.includes('AGRICULTURA') ||
      descripcion.includes('CULTIVO') ||
      descripcion.includes('MAÍZ') ||
      descripcion.includes('MAIZ') ||
      descripcion.includes('SORGO') ||
      descripcion.includes('TRIGO') ||
      descripcion.includes('FRIJOL')
    ) {
      if (esOptimo) {
        return (
          'Máxima transpiración y fotosíntesis. Existe riesgo de asfixia ' +
          'radicular únicamente si el suelo se mantiene en 100% durante demasiado tiempo.'
        );
      }

      if (esConfort) {
        return (
          'Los estomas comienzan a cerrarse parcialmente. Cultivos como maíz, ' +
          'sorgo y trigo no presentan afectación.'
        );
      }

      if (esAgotamiento) {
        return (
          'La pérdida inmediata de rendimiento puede ocurrir durante la floración. ' +
          'El cierre estomático detiene el crecimiento.'
        );
      }

      return (
        'Existe riesgo de marchitez, muerte del tejido e interrupción del ' +
        'crecimiento si esta condición persiste.'
      );
    }

    // =====================================================
    // PASTIZALES
    // =====================================================
    if (
      grupo === 'pastizal' ||
      descripcion.includes('PASTIZAL') ||
      descripcion.includes('PRADERA')
    ) {
      if (esOptimo) {
        return (
          'El pastizal presenta alto crecimiento vegetativo y acumulación de materia seca.'
        );
      }

      if (esConfort) {
        return (
          'La capacidad de pastoreo se mantiene sostenida y el desarrollo de raíces es estable.'
        );
      }

      if (esAgotamiento) {
        return (
          'Los pastos comienzan a amarillear y disminuye la generación de biomasa.'
        );
      }

      return (
        'La biomasa aérea se seca y las coronas permanecen vivas en espera de lluvia.'
      );
    }

    // =====================================================
    // BOSQUES Y SELVAS
    // =====================================================
    if (
      grupo === 'bosque' ||
      grupo === 'selva' ||
      descripcion.includes('BOSQUE') ||
      descripcion.includes('SELVA') ||
      descripcion.includes('PINO') ||
      descripcion.includes('ENCINO') ||
      descripcion.includes('OYAMEL') ||
      descripcion.includes('CEDRO')
    ) {
      if (esOptimo) {
        return (
          'Se favorece un alto flujo de savia y la recarga de agua en horizontes profundos.'
        );
      }

      if (esConfort) {
        return (
          'Los árboles extraen agua de horizontes menos profundos sin presentar estrés importante.'
        );
      }

      if (esAgotamiento) {
        return (
          'Los árboles caducifolios pueden perder hojas, las coníferas reducen el ' +
          'flujo de resina y aumenta la vulnerabilidad a plagas.'
        );
      }

      return (
        'Se activa la extracción profunda de raíces. Aumenta el riesgo de falla ' +
        'hidráulica, desprendimientos e incendios forestales.'
      );
    }

    // =====================================================
    // ZONAS COSTERAS
    // =====================================================
    if (
      grupo === 'costero' ||
      descripcion.includes('MANGLAR') ||
      descripcion.includes('DUNA') ||
      descripcion.includes('HALÓFILA') ||
      descripcion.includes('HALOFILA') ||
      descripcion.includes('COSTERA') ||
      descripcion.includes('COSTERO')
    ) {
      if (esOptimo) {
        return (
          'La alta entrada de agua dulce ayuda a reducir la acumulación de salinidad mareal.'
        );
      }

      if (esConfort) {
        return (
          'Se mantiene un balance normal entre agua dulce y salada para manglares y halófitas.'
        );
      }

      if (esAgotamiento) {
        return (
          'La baja entrada de agua dulce concentra la sal. Sólo las halófitas ' +
          'altamente especializadas permanecen activas.'
        );
      }

      return (
        'La costra de sal se eleva y la vegetación puede desecarse debido a la ósmosis inversa.'
      );
    }

    return '';
  }

  private agregarContextoAud(
    clasificacion: {
      titulo: string;
      clase: string;
      mensaje: string;
    },
    aud: number
  ): {
    titulo: string;
    clase: string;
    mensaje: string;
  } {
    const contexto = this.obtenerContextoAudPorDescripcion(aud);

    if (!contexto) {
      return clasificacion;
    }

    return {
      ...clasificacion,
      mensaje: `${clasificacion.mensaje} ${contexto}`
    };
  }

  private clasificarAudValor(
    aud: number | null
  ): {
    titulo: string;
    clase: string;
    mensaje: string;
  } {
    if (aud === null) {
      return {
        titulo: 'Datos insuficientes',
        clase: 'aud-sin-datos',
        mensaje:
          'No fue posible calcular el agua útil disponible para este punto.'
      };
    }

    if (aud > 100) {
      return {
        titulo: 'Suelo saturado',
        clase: 'aud-saturado',
        mensaje:
          'Existe riesgo de asfixia radicular si esta condición permanece.'
      };
    }

    if (aud >= 80) {
      return this.agregarContextoAud({
        titulo: 'Condición óptima',
        clase: 'aud-optimo',
        mensaje:
          'La disponibilidad de agua se encuentra en un nivel óptimo.'
      }, aud);
    }

    if (aud >= 50) {
      return this.agregarContextoAud({
        titulo: 'Zona de confort',
        clase: 'aud-optimo',
        mensaje:
          'La reserva de agua útil permite mantener la actividad de la vegetación.'
      }, aud);
    }

    if (aud >= 20) {
      return this.agregarContextoAud({
        titulo: 'Agotamiento permitido',
        clase: 'aud-riego',
        mensaje:
          'La disponibilidad de agua comienza a limitar el crecimiento.'
      }, aud);
    }

    return this.agregarContextoAud({
      titulo: 'Sequía severa',
      clase: 'aud-estres',
      mensaje:
        'La reserva de agua útil es crítica y existe riesgo de marchitamiento.'
    }, aud);
  }

  private actualizarAlertaAud(
    humedad: number | null,
    pmp: number | null,
    cc: number | null
  ): void {
    this.humedadActualAud = humedad;

    const audCalculado = this.calcularAud(humedad, pmp, cc);
    const clasificacion = this.clasificarAudValor(audCalculado);

    this.aud = audCalculado ?? 0;
    this.audClase = clasificacion.clase;
    this.audTitulo = clasificacion.titulo;
    this.audMensaje = clasificacion.mensaje;
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
          bottom: 10,
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
                autoSkip: true,
                maxTicksLimit: 5,
                maxRotation: 45,
                minRotation: 45,
                padding: 12
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
          label: this.obtenerNombreVariableHumedad(),
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


private clasificarVpdValor(vpd: number | null): {
  titulo: string;
  clase: string;
  mensaje: string;
} {
  if (vpd === null) {
    return {
      titulo: 'Sin datos',
      clase: 'vpd-sin-datos',
      mensaje: 'No fue posible calcular el VPD.'
    };
  }

  if (vpd < 0.4) {
    return {
      titulo: 'Muy húmedo',
      clase: 'vpd-muy-humedo',
      mensaje: 'Mayor riesgo de enfermedades fúngicas.'
    };
  }

  if (vpd < 0.8) {
    return {
      titulo: 'Ambiente húmedo',
      clase: 'vpd-humedo',
      mensaje: 'La demanda atmosférica es baja.'
    };
  }

  if (vpd <= 1.2) {
    return {
      titulo: 'Rango óptimo',
      clase: 'vpd-optimo',
      mensaje: 'Condiciones favorables para el cultivo.'
    };
  }

  if (vpd <= 2.0) {
    return {
      titulo: 'Demanda alta',
      clase: 'vpd-seco',
      mensaje: 'Conviene vigilar el estado hídrico.'
    };
  }

  return {
    titulo: 'Estrés atmosférico',
    clase: 'vpd-estres',
    mensaje: 'El aire está muy seco.'
  };
}


private obtenerContextoEtpPorDescripcion(
  etp: number
): string {
  const descripcion =
    this.usoSuelo?.descripcion
      ?.trim()
      .toUpperCase()
    ?? '';

  if (!descripcion) {
    return '';
  }

  const esBaja = etp < 2;
  const esModerada = etp >= 2 && etp <= 5;
  const esAlta = etp > 5 && etp <= 8;

  // =====================================================
  // AGRICULTURA DE TEMPORAL
  // =====================================================
  if (descripcion.includes('TEMPORAL')) {
    if (esBaja) {
      return (
        'En agricultura de temporal, la baja demanda atmosférica ayuda a ' +
        'conservar por más tiempo la humedad almacenada por las lluvias.'
      );
    }

    if (esModerada) {
      return (
        'En agricultura de temporal, la disponibilidad de agua depende de la ' +
        'lluvia reciente y de la humedad almacenada en el suelo.'
      );
    }

    if (esAlta) {
      return (
        'En agricultura de temporal, si no ocurren lluvias en los próximos días, ' +
        'el agua útil del suelo puede disminuir rápidamente.'
      );
    }

    return (
      'En agricultura de temporal, esta demanda extrema puede provocar estrés ' +
      'hídrico y marchitez rápida si no se presentan lluvias.'
    );
  }

  // =====================================================
  // AGRICULTURA DE RIEGO
  // =====================================================
  if (descripcion.includes('RIEGO')) {
    if (esBaja) {
      return (
        'En agricultura de riego, conviene evitar aplicaciones excesivas para ' +
        'reducir el riesgo de saturación o encharcamiento.'
      );
    }

    if (esModerada) {
      return (
        'En agricultura de riego, la lámina y frecuencia deben ajustarse con la ' +
        'humedad del suelo y la etapa fenológica del cultivo.'
      );
    }

    if (esAlta) {
      return (
        'En agricultura de riego, puede ser necesario aumentar la frecuencia de ' +
        'riego según el agua útil disponible y la etapa del cultivo.'
      );
    }

    return (
      'En agricultura de riego, la demanda extrema requiere vigilancia continua ' +
      'de la humedad del suelo para evitar pérdidas de rendimiento.'
    );
  }

  // =====================================================
  // AGRICULTURA DE HUMEDAD
  // =====================================================
  if (
    descripcion.includes('AGRICULTURA DE HUMEDAD') ||
    descripcion.includes('HUMEDAD ANUAL') ||
    descripcion.includes('HUMEDAD PERMANENTE') ||
    descripcion.includes('HUMEDAD SEMIPERMANENTE')
  ) {
    if (esBaja) {
      return (
        'En agricultura de humedad, la demanda reducida favorece la permanencia ' +
        'del agua en el perfil, aunque debe vigilarse el exceso de humedad.'
      );
    }

    if (esModerada) {
      return (
        'En agricultura de humedad, la condición es compatible con una pérdida ' +
        'gradual de agua mientras exista suficiente reserva en el suelo.'
      );
    }

    if (esAlta) {
      return (
        'En agricultura de humedad, una demanda alta puede reducir con rapidez ' +
        'las reservas superficiales y aumentar el estrés del cultivo.'
      );
    }

    return (
      'En agricultura de humedad, la demanda extrema puede agotar rápidamente ' +
      'las reservas disponibles y afectar el desarrollo del cultivo.'
    );
  }

  // =====================================================
  // PASTIZALES
  // =====================================================
  if (
    descripcion.includes('PASTIZAL') ||
    descripcion.includes('PRADERA')
  ) {
    if (etp < 4) {
      return (
        'En pastizales, la humedad superficial puede conservarse por más tiempo, ' +
        'favoreciendo el crecimiento y la calidad del forraje.'
      );
    }

    if (etp <= 8) {
      return (
        'En pastizales, la humedad de los primeros centímetros puede agotarse ' +
        'rápidamente, reduciendo el crecimiento y la calidad del forraje.'
      );
    }

    return (
      'En pastizales, existe riesgo severo de desecación, pérdida de forraje y ' +
      'mayor exposición del suelo a procesos de erosión.'
    );
  }

  // =====================================================
  // BOSQUES
  // =====================================================
  if (
    descripcion.includes('BOSQUE') ||
    descripcion.includes('PINO') ||
    descripcion.includes('ENCINO') ||
    descripcion.includes('OYAMEL') ||
    descripcion.includes('CEDRO') ||
    descripcion.includes('TÁSCATE') ||
    descripcion.includes('TASCATE')
  ) {
    const tipoBosque =
      descripcion.includes('PINO')
        ? 'bosque de pino'
        : descripcion.includes('ENCINO')
          ? 'bosque de encino'
          : descripcion.includes('OYAMEL')
            ? 'bosque de oyamel'
            : 'bosque';

    if (esBaja) {
      return (
        `En ${tipoBosque}, la demanda baja favorece la conservación de humedad, ` +
        'la infiltración y la recarga del suelo.'
      );
    }

    if (esModerada) {
      return (
        `En ${tipoBosque}, la vegetación puede mantener una transpiración normal ` +
        'si existe suficiente agua en el perfil del suelo.'
      );
    }

    if (esAlta) {
      return (
        `En ${tipoBosque}, una demanda elevada y sostenida puede incrementar el ` +
        'estrés hídrico y el secado del combustible vegetal.'
      );
    }

    return (
      `En ${tipoBosque}, la presión hídrica extrema puede agotar reservas profundas ` +
      'y aumentar el riesgo de estrés severo e incendios.'
    );
  }

  // =====================================================
  // SELVAS
  // =====================================================
  if (descripcion.includes('SELVA')) {
    if (esBaja) {
      return (
        'En selvas, la demanda baja favorece la conservación de humedad y el ' +
        'funcionamiento normal de la vegetación.'
      );
    }

    if (esModerada) {
      return (
        'En selvas, la vegetación puede mantener una alta actividad fisiológica ' +
        'mientras exista suficiente humedad en el suelo.'
      );
    }

    if (esAlta) {
      return (
        'En selvas, una demanda alta incrementa la transpiración y puede iniciar ' +
        'estrés hídrico si disminuye la humedad del suelo.'
      );
    }

    return (
      'En selvas, una demanda extrema puede ocasionar estrés fisiológico severo ' +
      'si las reservas de agua del suelo son insuficientes.'
    );
  }

  // =====================================================
  // ZONAS COSTERAS
  // =====================================================
  if (
    descripcion.includes('MANGLAR') ||
    descripcion.includes('DUNA') ||
    descripcion.includes('HALÓFILA') ||
    descripcion.includes('HALOFILA') ||
    descripcion.includes('COSTERA')
  ) {
    if (etp < 2.5) {
      return (
        'En zonas costeras, la humedad marina mantiene una demanda atmosférica ' +
        'reducida y ayuda a limitar las pérdidas de agua.'
      );
    }

    if (etp <= 4.5) {
      return (
        'En zonas costeras, la humedad relativa y la brisa marina amortiguan ' +
        'la evaporación potencial.'
      );
    }

    if (etp <= 6) {
      return (
        'En zonas costeras, la demanda está por encima del rango habitual y ' +
        'conviene vigilar la humedad del suelo y la vegetación.'
      );
    }

    return (
      'En zonas costeras, esta demanda alta puede estar asociada con vientos ' +
      'continentales cálidos y secos que elevan rápidamente el estrés vegetal.'
    );
  }

  // =====================================================
  // MATORRALES Y MEZQUITALES
  // =====================================================
  if (
    descripcion.includes('MATORRAL') ||
    descripcion.includes('MEZQUITAL') ||
    descripcion.includes('CHAPARRAL')
  ) {
    if (esBaja) {
      return (
        'En matorrales y mezquitales, la demanda baja permite conservar por más ' +
        'tiempo la humedad disponible en el suelo.'
      );
    }

    if (esModerada) {
      return (
        'La vegetación xerófila suele tolerar esta demanda, siempre que exista ' +
        'humedad suficiente en el perfil del suelo.'
      );
    }

    if (esAlta) {
      return (
        'Aunque la vegetación está adaptada a condiciones secas, una demanda alta ' +
        'acelera el secado superficial y aumenta el estrés hídrico.'
      );
    }

    return (
      'La demanda extrema puede provocar desecación intensa del suelo y aumentar ' +
      'el riesgo de pérdida de cobertura vegetal.'
    );
  }

  // =====================================================
  // CUERPOS DE AGUA Y ACUICULTURA
  // =====================================================
  if (
    descripcion.includes('CUERPO DE AGUA') ||
    descripcion.includes('ACUÍCOLA') ||
    descripcion.includes('ACUICOLA') ||
    descripcion.includes('LAGUNA') ||
    descripcion.includes('PRESA')
  ) {
    return (
      etp > 5
        ? 'En superficies acuáticas, una ETP elevada favorece mayores pérdidas por evaporación.'
        : 'En superficies acuáticas, la ETP representa la demanda atmosférica y no el consumo directo del cuerpo de agua.'
    );
  }

  // =====================================================
  // ZONAS URBANAS
  // =====================================================
  if (
    descripcion.includes('ASENTAMIENTO') ||
    descripcion.includes('URBANO')
  ) {
    return (
      'En zonas urbanas, la ETP representa la demanda atmosférica de referencia; ' +
      'el efecto real depende de la cobertura vegetal y las superficies impermeables.'
    );
  }

  // =====================================================
  // SIN VEGETACIÓN
  // =====================================================
  if (
    descripcion.includes('SIN VEGETACIÓN') ||
    descripcion.includes('SIN VEGETACION') ||
    descripcion.includes('DESPROVISTO')
  ) {
    return (
      etp > 5
        ? 'En superficies sin vegetación, la demanda elevada acelera la desecación del suelo y puede favorecer procesos de erosión.'
        : 'En superficies sin vegetación, la ETP describe principalmente la pérdida potencial de humedad desde el suelo expuesto.'
    );
  }

  return '';
}

private agregarContextoEtp(
  clasificacion: {
    titulo: string;
    clase: string;
    mensaje: string;
  },
  etp: number
): {
  titulo: string;
  clase: string;
  mensaje: string;
} {
  const contexto = this.obtenerContextoEtpPorDescripcion(etp);

  if (!contexto) {
    return clasificacion;
  }

  return {
    ...clasificacion,
    mensaje: `${clasificacion.mensaje} ${contexto}`
  };
}

private clasificarEt0Valor(
  et0: number | null
): {
  titulo: string;
  clase: string;
  mensaje: string;
} {
  if (et0 === null) {
    return {
      titulo: 'Sin datos',
      clase: 'et0-sin-datos',
      mensaje:
        'No fue posible calcular la evapotranspiración potencial.'
    };
  }

  const grupo =
    this.usoSuelo?.grupo
      ?.trim()
      .toLowerCase()
    ?? 'otro';

  switch (grupo) {
    // =====================================================
    // CULTIVOS AGRÍCOLAS
    // =====================================================
    case 'agricultura':
      if (et0 < 2) {
        return this.agregarContextoEtp({
          titulo: 'ETP baja',
          clase: 'et0-baja',
          mensaje:
            'El consumo potencial de agua es mínimo.'
        }, et0);
      }

      if (et0 <= 5) {
        return this.agregarContextoEtp({
          titulo: 'ETP moderada',
          clase: 'et0-moderada',
          mensaje:
            'La demanda atmosférica se encuentra en un rango favorable para muchos cultivos.'
        }, et0);
      }

      if (et0 <= 8) {
        return this.agregarContextoEtp({
          titulo: 'ETP alta',
          clase: 'et0-alta',
          mensaje:
            'La demanda de agua es elevada.'
        }, et0);
      }

      return this.agregarContextoEtp({
        titulo: 'ETP extrema',
        clase: 'et0-muy-alta',
        mensaje:
          'La demanda atmosférica es extrema y puede causar marchitez rápida.'
      }, et0);

    // =====================================================
    // PASTIZALES
    // =====================================================
    case 'pastizal':
      if (et0 < 4) {
        return this.agregarContextoEtp({
          titulo: 'ETP baja a moderada',
          clase: 'et0-moderada',
          mensaje:
            'La pérdida potencial de agua se mantiene en un rango relativamente favorable.'
        }, et0);
      }

      if (et0 <= 5) {
        return this.agregarContextoEtp({
          titulo: 'Transición a demanda alta',
          clase: 'et0-alta',
          mensaje:
            'La demanda atmosférica comienza a reducir la humedad superficial.'
        }, et0);
      }

      if (et0 <= 8) {
        return this.agregarContextoEtp({
          titulo: 'ETP alta',
          clase: 'et0-alta',
          mensaje:
            'La pérdida potencial de agua es elevada.'
        }, et0);
      }

      return this.agregarContextoEtp({
        titulo: 'ETP extrema',
        clase: 'et0-muy-alta',
        mensaje:
          'La demanda atmosférica es extrema.'
      }, et0);

    // =====================================================
    // BOSQUES Y SELVAS
    // =====================================================
    case 'bosque':
    case 'selva':
      if (et0 < 2) {
        return this.agregarContextoEtp({
          titulo: 'ETP baja',
          clase: 'et0-baja',
          mensaje:
            'La demanda atmosférica es reducida.'
        }, et0);
      }

      if (et0 <= 5) {
        return this.agregarContextoEtp({
          titulo: 'ETP moderada',
          clase: 'et0-moderada',
          mensaje:
            'La demanda atmosférica permite una actividad vegetal normal.'
        }, et0);
      }

      if (et0 <= 8) {
        return this.agregarContextoEtp({
          titulo: 'ETP alta',
          clase: 'et0-alta',
          mensaje:
            'La demanda atmosférica es elevada.'
        }, et0);
      }

      return this.agregarContextoEtp({
        titulo: 'ETP extrema',
        clase: 'et0-muy-alta',
        mensaje:
          'La presión hídrica es extrema.'
      }, et0);

    // =====================================================
    // ZONAS COSTERAS
    // =====================================================
    case 'costero':
      if (et0 < 2.5) {
        return this.agregarContextoEtp({
          titulo: 'ETP costera baja',
          clase: 'et0-baja',
          mensaje:
            'La demanda atmosférica es reducida para una zona costera.'
        }, et0);
      }

      if (et0 <= 4.5) {
        return this.agregarContextoEtp({
          titulo: 'ETP costera moderada',
          clase: 'et0-moderada',
          mensaje:
            'La demanda se encuentra dentro del rango costero habitual.'
        }, et0);
      }

      if (et0 <= 6) {
        return this.agregarContextoEtp({
          titulo: 'ETP costera elevada',
          clase: 'et0-alta',
          mensaje:
            'La demanda supera el rango costero habitual.'
        }, et0);
      }

      return this.agregarContextoEtp({
        titulo: 'ETP costera alta',
        clase: et0 > 8 ? 'et0-muy-alta' : 'et0-alta',
        mensaje:
          'La demanda atmosférica es inusualmente alta para una zona costera.'
      }, et0);

    // =====================================================
    // RESTO DE COBERTURAS
    // =====================================================
    default:
      return this.clasificarEt0General(et0);
  }
}

private clasificarEt0General(
  et0: number,
  contextoAdicional = ''
): {
  titulo: string;
  clase: string;
  mensaje: string;
} {
  let resultado: {
    titulo: string;
    clase: string;
    mensaje: string;
  };

  if (et0 < 2) {
    resultado = {
      titulo: 'ETP baja',
      clase: 'et0-baja',
      mensaje:
        'La demanda atmosférica de agua es reducida.'
    };
  } else if (et0 <= 5) {
    resultado = {
      titulo: 'ETP moderada',
      clase: 'et0-moderada',
      mensaje:
        'La demanda atmosférica se encuentra en un rango moderado.'
    };
  } else if (et0 <= 8) {
    resultado = {
      titulo: 'ETP alta',
      clase: 'et0-alta',
      mensaje:
        'La pérdida potencial de agua es elevada.'
    };
  } else {
    resultado = {
      titulo: 'ETP extrema',
      clase: 'et0-muy-alta',
      mensaje:
        'La demanda atmosférica de agua es extrema.'
    };
  }

  if (contextoAdicional) {
    resultado.mensaje =
      `${resultado.mensaje} ${contextoAdicional}`;
  }

  return this.agregarContextoEtp(resultado, et0);
}



private actualizarPronosticosAtmosfericos(serie: any[]): void {
  const dias = Array.isArray(serie)
    ? serie.slice(0, 5)
    : [];

  this.pronosticoVpd = dias.map((dia: any) => {
    const variables = dia?.variables ?? {};

    const valor = this.calcularVpd(
      variables.temp,
      variables.rh
    );

    const clasificacion =
      this.clasificarVpdValor(valor);

    return {
      fecha: dia.fecha,
      valor,
      titulo: clasificacion.titulo,
      clase: clasificacion.clase
    };
  });

  this.pronosticoEt0 = dias.map((dia: any) => {
    const variables = dia?.variables ?? {};

    const resultadoEt0 = this.calcularEt0Mostrada(
      dia.fecha,
      variables
    );

    const valor = resultadoEt0.valor;

    const clasificacion =
      this.clasificarEt0Valor(valor);

    return {
      fecha: dia.fecha,
      valor,
      titulo: clasificacion.titulo,
      clase: clasificacion.clase
    };
  });
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

private gradosARadianes(grados: number): number {
  return grados * Math.PI / 180;
}

private obtenerDiaJuliano(fechaTexto: string): number | null {
  if (!fechaTexto) {
    return null;
  }

  const partes = fechaTexto.split('-').map(Number);

  if (
    partes.length !== 3 ||
    partes.some(valor => !Number.isFinite(valor))
  ) {
    return null;
  }

  const [anio, mes, dia] = partes;

  const fechaActual = Date.UTC(anio, mes - 1, dia);
  const inicioAnio = Date.UTC(anio, 0, 0);

  return Math.floor(
    (fechaActual - inicioAnio) /
    (1000 * 60 * 60 * 24)
  );
}

private calcularRadiacionExtraterrestre(
  latitudValor: unknown,
  fechaTexto: string
): number | null {
  const latitud = Number(latitudValor);
  const diaJuliano = this.obtenerDiaJuliano(fechaTexto);

  if (
    !Number.isFinite(latitud) ||
    diaJuliano === null
  ) {
    return null;
  }

  const latitudRad = this.gradosARadianes(latitud);

  const distanciaRelativaTierraSol =
    1 +
    0.033 *
    Math.cos(
      (2 * Math.PI / 365) *
      diaJuliano
    );

  const declinacionSolar =
    0.409 *
    Math.sin(
      (2 * Math.PI / 365) *
      diaJuliano -
      1.39
    );

  const argumento =
    -Math.tan(latitudRad) *
    Math.tan(declinacionSolar);

  const argumentoLimitado =
    Math.max(-1, Math.min(1, argumento));

  const anguloHorario =
    Math.acos(argumentoLimitado);

  const constanteSolar = 0.0820;

  const radiacion =
    (24 * 60 / Math.PI) *
    constanteSolar *
    distanciaRelativaTierraSol *
    (
      anguloHorario *
      Math.sin(latitudRad) *
      Math.sin(declinacionSolar)
      +
      Math.cos(latitudRad) *
      Math.cos(declinacionSolar) *
      Math.sin(anguloHorario)
    );

  if (!Number.isFinite(radiacion)) {
    return null;
  }

  return Number(
    Math.max(0, radiacion).toFixed(2)
  );
}

private calcularVelocidadViento10m(
  uValor: unknown,
  vValor: unknown
): number | null {
  const u = Number(uValor);
  const v = Number(vValor);

  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    return null;
  }

  return Number(Math.sqrt((u * u) + (v * v)).toFixed(3));
}

private convertirViento10mA2m(
  viento10m: number | null
): number | null {
  if (viento10m === null || !Number.isFinite(viento10m)) {
    return null;
  }

  const alturaMedicion = 10;

  const viento2m =
    viento10m *
    (
      4.87 /
      Math.log((67.8 * alturaMedicion) - 5.42)
    );

  return Number(Math.max(0, viento2m).toFixed(3));
}

private calcularPendientePresionVapor(
  temperaturaValor: unknown
): number | null {
  const temperatura = Number(temperaturaValor);

  if (!Number.isFinite(temperatura)) {
    return null;
  }

  const presionSaturacion =
    0.6108 *
    Math.exp(
      (17.27 * temperatura) /
      (temperatura + 237.3)
    );

  const delta =
    (4098 * presionSaturacion) /
    Math.pow(temperatura + 237.3, 2);

  return Number(delta.toFixed(6));
}

/*
 * APORTE AERODINÁMICO EXPERIMENTAL
 *
 * Convierte el efecto conjunto VPD × viento a una contribución en mm/día
 * usando el término aerodinámico diario de FAO-56.
 *
 * IMPORTANTE:
 * - Este resultado es solamente el término aerodinámico.
 * - Al sumarlo a Hargreaves se obtiene una ET0 ajustada experimental.
 * - No debe llamarse Penman–Monteith FAO-56.
 */
private calcularAporteAerodinamicoExperimental(
  temperaturaValor: unknown,
  humedadRelativaValor: unknown,
  uValor: unknown,
  vValor: unknown
): {
  aporteMmDia: number | null;
  vpd: number | null;
  viento2m: number | null;
} {
  const temperatura = Number(temperaturaValor);

  const vpd = this.calcularVpd(
    temperaturaValor,
    humedadRelativaValor
  );

  const viento10m = this.calcularVelocidadViento10m(
    uValor,
    vValor
  );

  const viento2m = this.convertirViento10mA2m(
    viento10m
  );

  const delta = this.calcularPendientePresionVapor(
    temperaturaValor
  );

  if (
    !Number.isFinite(temperatura) ||
    vpd === null ||
    viento2m === null ||
    delta === null
  ) {
    return {
      aporteMmDia: null,
      vpd,
      viento2m
    };
  }

  /*
   * Se usa gamma estándar aproximada a nivel del mar.
   * Cuando el sistema disponga de presión o altitud,
   * conviene calcular gamma específicamente para cada punto.
   */
  const gamma = 0.066;

  const numerador =
    gamma *
    (900 / (temperatura + 273)) *
    viento2m *
    vpd;

  const denominador =
    delta +
    gamma * (1 + (0.34 * viento2m));

  if (
    !Number.isFinite(numerador) ||
    !Number.isFinite(denominador) ||
    denominador <= 0
  ) {
    return {
      aporteMmDia: null,
      vpd,
      viento2m
    };
  }

  const aporteMmDia = numerador / denominador;

  return {
    aporteMmDia: Number(Math.max(0, aporteMmDia).toFixed(2)),
    vpd,
    viento2m
  };
}

/*
 * FUNCIÓN ÚNICA PARA ELEGIR EL VALOR QUE SE MOSTRARÁ.
 *
 * Para volver a Hargreaves puro no cambies esta función:
 * solo pon USAR_ET0_AJUSTADA_EXPERIMENTAL = false.
 */
private calcularEt0Mostrada(
  fechaTexto: string,
  variables: any
): {
  valor: number | null;
  hargreaves: number | null;
  aporteAerodinamico: number | null;
  viento2m: number | null;
} {
  const hargreaves = this.calcularEt0Hargreaves(
    fechaTexto,
    variables?.tmax,
    variables?.tmin,
    variables?.temp
  );

  const resultadoAerodinamico =
    this.calcularAporteAerodinamicoExperimental(
      variables?.temp,
      variables?.rh,
      variables?.u,
      variables?.v
    );

  if (hargreaves === null) {
    return {
      valor: null,
      hargreaves: null,
      aporteAerodinamico:
        resultadoAerodinamico.aporteMmDia,
      viento2m:
        resultadoAerodinamico.viento2m
    };
  }

  if (!this.USAR_ET0_AJUSTADA_EXPERIMENTAL) {
    return {
      valor: hargreaves,
      hargreaves,
      aporteAerodinamico:
        resultadoAerodinamico.aporteMmDia,
      viento2m:
        resultadoAerodinamico.viento2m
    };
  }

  const aporte =
    resultadoAerodinamico.aporteMmDia ?? 0;

  return {
    valor: Number((hargreaves + aporte).toFixed(2)),
    hargreaves,
    aporteAerodinamico:
      resultadoAerodinamico.aporteMmDia,
    viento2m:
      resultadoAerodinamico.viento2m
  };
}

private calcularEt0Hargreaves(
  fechaTexto: string,
  tmaxValor: unknown,
  tminValor: unknown,
  temperaturaValor: unknown
): number | null {
  const tmax = Number(tmaxValor);
  const tmin = Number(tminValor);
  const temperatura = Number(temperaturaValor);

  if (
    !Number.isFinite(tmax) ||
    !Number.isFinite(tmin) ||
    tmax < tmin
  ) {
    return null;
  }

  const temperaturaMedia =
    Number.isFinite(temperatura)
      ? temperatura
      : (tmax + tmin) / 2;

  const radiacionExtraterrestre =
    this.calcularRadiacionExtraterrestre(
      this.lat,
      fechaTexto
    );

  if (radiacionExtraterrestre === null) {
    return null;
  }

  const diferenciaTemperatura =
    Math.max(0, tmax - tmin);

  const et0 =
    0.0023 *
    (radiacionExtraterrestre * 0.408) *
    (temperaturaMedia + 17.8) *
    Math.sqrt(diferenciaTemperatura);

  if (!Number.isFinite(et0)) {
    return null;
  }

  return Number(
    Math.max(0, et0).toFixed(2)
  );
}

private actualizarEt0Actual(
  fechaTexto: string,
  variables: any
): void {
  this.radiacionExtraterrestreActual =
    this.calcularRadiacionExtraterrestre(
      this.lat,
      fechaTexto
    );

  const resultadoEt0 = this.calcularEt0Mostrada(
    fechaTexto,
    variables
  );

  this.et0Actual = resultadoEt0.valor;
  this.et0HargreavesActual = resultadoEt0.hargreaves;
  this.aporteAerodinamicoActual =
    resultadoEt0.aporteAerodinamico;
  this.viento2mActual = resultadoEt0.viento2m;

  if (this.et0Actual === null) {
    this.et0Titulo = 'Datos insuficientes';
    this.et0Mensaje =
      'No fue posible estimar la demanda evaporativa para esta fecha.';
    this.et0Metodo = '';
    return;
  }

  const clasificacion =
    this.clasificarEt0Valor(
      this.et0Actual
    );

  this.et0Titulo =
    clasificacion.titulo;

  this.et0Mensaje =
    clasificacion.mensaje;

  this.et0Metodo =
    this.USAR_ET0_AJUSTADA_EXPERIMENTAL
      ? 'Hargreaves–Samani más aporte aerodinámico experimental.'
      : 'Estimación mediante Hargreaves–Samani.';
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

  /*
   * Cada profundidad seleccionada utiliza automáticamente
   * la variable WRF equivalente.
   */
  const variablePorProfundidad: Record<string, string> = {
    '0_10': 'soilw010',
    '10_40': 'soilw1040',
    '40_100': 'soilw40100',
    '100_200': 'soilw100200'
  };

  this.variableHumedad =
    variablePorProfundidad[this.profundidad]
    ?? 'soilw010';

  this.cargarHumedad();
}

private obtenerNombreVariableHumedad(): string {
  const nombres: Record<string, string> = {
    soilw010: 'Humedad WRF 0-10 cm',
    soilw1040: 'Humedad WRF 10-40 cm',
    soilw40100: 'Humedad WRF 40-100 cm',
    soilw100200: 'Humedad WRF 100-200 cm'
  };

  return nombres[this.variableHumedad]
    ?? this.variableHumedad;
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

  private readonly DESCARGO_RESPONSABILIDAD =
    'El presente tablero digital es una herramienta de apoyo para la interpretación de datos climáticos y edáficos, desarrollada con fines académicos, técnicos y de investigación. Los valores mostrados se derivan de simulaciones numéricas realizadas con el modelo WRF y de fuentes de datos complementarias. Este tablero no constituye un pronóstico oficial del clima ni sustituye la información emitida por el Servicio Meteorológico Nacional. Los desarrolladores y la institución responsable no asumen responsabilidad legal por el uso de la información aquí presentada ni por decisiones operativas, productivas o comerciales derivadas de ella. Se recomienda consultar siempre las fuentes oficiales para fines de planeación y gestión.';

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

  private dibujarTextoEnvueltoPNG(
    ctx: CanvasRenderingContext2D,
    texto: string,
    x: number,
    y: number,
    anchoMaximo: number,
    altoLinea = 20,
    font = '14px Arial',
    color = '#263238'
  ): number {
    ctx.font = font;
    ctx.fillStyle = color;

    const palabras = texto.split(/\s+/);
    let linea = '';
    let yActual = y;

    palabras.forEach((palabra, indice) => {
      const prueba = linea ? `${linea} ${palabra}` : palabra;

      if (ctx.measureText(prueba).width > anchoMaximo && linea) {
        ctx.fillText(linea, x, yActual);
        linea = palabra;
        yActual += altoLinea;
      } else {
        linea = prueba;
      }

      if (indice === palabras.length - 1 && linea) {
        ctx.fillText(linea, x, yActual);
      }
    });

    return yActual + altoLinea;
  }

  private dibujarMarcaAguaPNG(
    ctx: CanvasRenderingContext2D,
    ancho: number,
    alto: number
  ): void {
    ctx.save();
    ctx.translate(ancho / 2, alto / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#1b5e20';
    ctx.font = 'bold 86px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('@INIFAP', 0, 0);
    ctx.restore();
  }

  private dibujarDescargoPNG(
    ctx: CanvasRenderingContext2D,
    yInicio: number,
    ancho: number
  ): number {
    const margen = 25;
    const anchoCaja = ancho - (margen * 2);

    ctx.save();
    ctx.fillStyle = '#f4f7f2';
    ctx.strokeStyle = '#9fb79f';
    ctx.lineWidth = 1;
    ctx.fillRect(margen, yInicio, anchoCaja, 150);
    ctx.strokeRect(margen, yInicio, anchoCaja, 150);

    this.dibujarTextoPNG(
      ctx,
      'Descargo de responsabilidad',
      margen + 15,
      yInicio + 28,
      'bold 16px Arial',
      '#1b5e20'
    );

    const fin = this.dibujarTextoEnvueltoPNG(
      ctx,
      this.DESCARGO_RESPONSABILIDAD,
      margen + 15,
      yInicio + 55,
      anchoCaja - 30,
      18,
      '13px Arial',
      '#263238'
    );

    ctx.restore();
    return Math.max(fin + 10, yInicio + 160);
  }

  private agregarMarcaAguaPDF(pdf: jsPDF): void {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(42);
    pdf.setTextColor(225, 232, 225);
    pdf.text('@INIFAP', 148.5, 105, {
      align: 'center',
      angle: 32
    });
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
  }

  private agregarDescargoPDF(
    pdf: jsPDF,
    yInicio: number,
    anchoPagina = 297
  ): void {
    const margen = 15;
    const anchoCaja = anchoPagina - (margen * 2);
    const lineas = pdf.splitTextToSize(
      this.DESCARGO_RESPONSABILIDAD,
      anchoCaja - 8
    );
    const altoCaja = 10 + (lineas.length * 4.2) + 8;

    pdf.setFillColor(244, 247, 242);
    pdf.setDrawColor(159, 183, 159);
    pdf.roundedRect(margen, yInicio, anchoCaja, altoCaja, 2, 2, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(27, 94, 32);
    pdf.text('Descargo de responsabilidad', margen + 4, yInicio + 6);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(45, 55, 45);
    pdf.text(lineas, margen + 4, yInicio + 11);
    pdf.setTextColor(0, 0, 0);
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

    const ancho = Math.max(original.width, 1200);
    const margen = 35;
    const anchoGrafica = ancho - (margen * 2);
    const escala = Math.min(anchoGrafica / original.width, 1.2);
    const altoGrafica = original.height * escala;
    const altoEncabezado = tipo === 'humedad' ? 390 : 470;
    const altoDescargo = 180;

    canvas.width = ancho;
    canvas.height = altoEncabezado + altoGrafica + altoDescargo + 60;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.dibujarMarcaAguaPNG(ctx, canvas.width, canvas.height);

    let y = 42;

    if (tipo === 'humedad') {
      const pmp = this.humedad?.referencia?.pmp;
      const cc = this.humedad?.referencia?.cc;

      this.dibujarTextoPNG(ctx, 'Reporte de Humedad de Suelo', margen, y, 'bold 26px Arial', '#173b1f');
      y += 40;

      this.dibujarTextoPNG(ctx, `Lat: ${this.lat}`, margen, y);
      this.dibujarTextoPNG(ctx, `Lon: ${this.lon}`, 330, y);
      this.dibujarTextoPNG(ctx, `Fecha pronóstico: ${this.fechaPronostico || '-'}`, 650, y);
      y += 30;

      this.dibujarTextoPNG(ctx, `Estado: ${this.getEstadoHumedad()}`, margen, y);
      this.dibujarTextoPNG(ctx, `Profundidad: ${this.profundidad}`, 330, y);
      this.dibujarTextoPNG(ctx, `Variable: ${this.variableHumedad}`, 650, y);
      y += 30;

      this.dibujarTextoPNG(ctx, `PMP: ${this.formatoNumero(pmp, 4)} m³/m³`, margen, y);
      this.dibujarTextoPNG(ctx, `CC: ${this.formatoNumero(cc, 4)} m³/m³`, 330, y);
      this.dibujarTextoPNG(
        ctx,
        `Humedad WRF: ${this.formatoNumero(this.humedadActualAud, 4)} m³/m³`,
        650,
        y
      );
      y += 32;

      this.dibujarTextoPNG(
        ctx,
        `AUD: ${this.formatoNumero(this.aud, 1)}% - ${this.audTitulo}`,
        margen,
        y,
        'bold 19px Arial',
        '#1b5e20'
      );
      y += 27;

      y = this.dibujarTextoEnvueltoPNG(
        ctx,
        this.audMensaje,
        margen,
        y,
        ancho - (margen * 2),
        20,
        '15px Arial'
      ) + 12;

      this.dibujarTextoPNG(ctx, 'Fecha', margen, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'Humedad', 230, y, 'bold 16px Arial');
      y += 24;

      this.humedad?.pronostico?.slice(0, 5).forEach((d: any) => {
        this.dibujarTextoPNG(ctx, String(d.fecha), margen, y, '15px Arial');
        const humedadConvertida = this.convertirHumedadWrf(d.valor);
        this.dibujarTextoPNG(
          ctx,
          `${this.formatoNumero(humedadConvertida, 4)} m³/m³`,
          230,
          y,
          '15px Arial'
        );
        y += 22;
      });
    } else {
      this.dibujarTextoPNG(ctx, 'Reporte Histórico GDD', margen, y, 'bold 26px Arial', '#173b1f');
      y += 40;

      this.dibujarTextoPNG(ctx, `Lat: ${this.lat}`, margen, y);
      this.dibujarTextoPNG(ctx, `Lon: ${this.lon}`, 330, y);
      y += 30;

      this.dibujarTextoPNG(ctx, `Fecha inicio: ${this.fechaInicio}`, margen, y);
      this.dibujarTextoPNG(ctx, `Fecha fin: ${this.fechaFin}`, 330, y);
      this.dibujarTextoPNG(ctx, `Cultivo: ${this.cultivoGdd.toUpperCase()}`, 650, y);
      y += 34;

      this.dibujarTextoPNG(
        ctx,
        `GDD acumulado: ${this.formatoNumero(this.gddAcumulado, 2)}`,
        margen,
        y,
        'bold 19px Arial',
        '#1b5e20'
      );
      y += 34;

      this.dibujarTextoPNG(ctx, 'Fecha', margen, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'Tmax', 230, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'Tmin', 370, y, 'bold 16px Arial');
      this.dibujarTextoPNG(ctx, 'GDD', 510, y, 'bold 16px Arial');
      y += 24;

      const serie = this.historico?.serie || [];
      const maxFilas = 12;

      serie.slice(0, maxFilas).forEach((d: any) => {
        this.dibujarTextoPNG(ctx, String(d.fecha), margen, y, '15px Arial');
        this.dibujarTextoPNG(ctx, this.formatoNumero(d.tmax, 2), 230, y, '15px Arial');
        this.dibujarTextoPNG(ctx, this.formatoNumero(d.tmin, 2), 370, y, '15px Arial');
        this.dibujarTextoPNG(ctx, this.formatoNumero(d.gdd, 2), 510, y, '15px Arial');
        y += 22;
      });

      if (serie.length > maxFilas) {
        this.dibujarTextoPNG(
          ctx,
          `... ${serie.length - maxFilas} registros adicionales disponibles en CSV y PDF`,
          margen,
          y,
          '14px Arial',
          '#546e5a'
        );
        y += 26;
      }
    }

    const yGrafica = Math.max(y + 20, altoEncabezado);
    ctx.drawImage(
      original,
      margen,
      yGrafica,
      anchoGrafica,
      altoGrafica
    );

    this.dibujarDescargoPNG(
      ctx,
      yGrafica + altoGrafica + 25,
      ancho
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

    const img = chart.toBase64Image('image/png', 1);
    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const anchoPagina = 297;

    this.agregarMarcaAguaPDF(pdf);

    if (tipo === 'humedad') {
      const pmp = this.humedad?.referencia?.pmp;
      const cc = this.humedad?.referencia?.cc;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(17);
      pdf.setTextColor(23, 59, 31);
      pdf.text('Reporte de Humedad de Suelo', 15, 14);

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(9.5);

      pdf.text(`Lat: ${this.lat}`, 15, 23);
      pdf.text(`Lon: ${this.lon}`, 78, 23);
      pdf.text(`Fecha pronóstico: ${this.fechaPronostico || '-'}`, 145, 23);

      pdf.text(`Estado: ${this.getEstadoHumedad()}`, 15, 30);
      pdf.text(`Profundidad: ${this.profundidad}`, 78, 30);
      pdf.text(`Variable: ${this.variableHumedad}`, 145, 30);

      pdf.text(`PMP: ${this.formatoNumero(pmp, 4)} m³/m³`, 15, 37);
      pdf.text(`CC: ${this.formatoNumero(cc, 4)} m³/m³`, 78, 37);
      pdf.text(
        `Humedad WRF: ${this.formatoNumero(this.humedadActualAud, 4)} m³/m³`,
        145,
        37
      );

      pdf.setFillColor(238, 247, 238);
      pdf.setDrawColor(112, 170, 112);
      pdf.roundedRect(15, 43, 267, 18, 2, 2, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(27, 94, 32);
      pdf.text(
        `AUD: ${this.formatoNumero(this.aud, 1)}% - ${this.audTitulo}`,
        20,
        51
      );

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(35, 55, 35);
      const audLineas = pdf.splitTextToSize(this.audMensaje, 160);
      pdf.text(audLineas, 20, 57);

      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Fecha', 210, 49);
      pdf.text('Humedad', 250, 49);
      pdf.setFont('helvetica', 'normal');

      let yTabla = 54;
      this.humedad?.pronostico?.slice(0, 5).forEach((d: any) => {
        const humedadConvertida = this.convertirHumedadWrf(d.valor);
        pdf.text(String(d.fecha), 210, yTabla);
        pdf.text(`${this.formatoNumero(humedadConvertida, 4)}`, 250, yTabla);
        yTabla += 5;
      });

      pdf.addImage(img, 'PNG', 20, 68, 257, 92);
      this.agregarDescargoPDF(pdf, 166, anchoPagina);
      pdf.save('reporte_humedad_suelo.pdf');
      return;
    }

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
    pdf.setFontSize(17);
    pdf.setTextColor(23, 59, 31);
    pdf.text('Reporte Histórico GDD', 15, 14);

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9.5);
    pdf.text(`Lat: ${this.lat}`, 15, 23);
    pdf.text(`Lon: ${this.lon}`, 72, 23);
    pdf.text(`Fecha inicio: ${this.fechaInicio}`, 130, 23);
    pdf.text(`Fecha fin: ${this.fechaFin}`, 205, 23);

    pdf.setFillColor(238, 247, 238);
    pdf.setDrawColor(112, 170, 112);
    pdf.roundedRect(15, 31, 267, 22, 2, 2, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(27, 94, 32);
    pdf.setFontSize(12);
    pdf.text(`GDD acumulado: ${this.gddAcumulado.toFixed(2)}`, 20, 40);

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(8.5);
    pdf.text(`Cultivo: ${this.cultivoGdd.toUpperCase()}`, 20, 48);
    pdf.text(`Registros: ${totalDias}`, 75, 48);
    pdf.text(`Promedio: ${promedio.toFixed(2)}`, 115, 48);
    pdf.text(`Mínimo: ${minGdd.toFixed(2)}`, 160, 48);
    pdf.text(`Máximo: ${maxGdd.toFixed(2)}`, 205, 48);

    pdf.addImage(img, 'PNG', 20, 59, 257, 101);
    this.agregarDescargoPDF(pdf, 166, anchoPagina);
    pdf.save('reporte_historico_gdd.pdf');
  }
}