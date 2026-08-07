import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import {
  AuthService
} from '../services/auth.services';


@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    CommonModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements
  OnInit,
  AfterViewInit,
  OnDestroy {

  usuario = '';
  password = '';
  error = '';
  avisoSesion = '';
  captchaToken = '';
  turnstileWidgetId: any = null;

  private intervaloTurnstile:
    ReturnType<typeof setInterval> |
    null = null;


  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}


  ngOnInit(): void {
    this.avisoSesion =
      sessionStorage.getItem(
        'mensaje_sesion'
      ) ?? '';

    sessionStorage.removeItem(
      'mensaje_sesion'
    );

    (window as any).onCaptchaSuccess = (
      token: string
    ) => {
      this.captchaToken = token;
      this.cdr.detectChanges();
    };
  }


  ngAfterViewInit(): void {
    this.intervaloTurnstile = setInterval(
      () => {
        if (!(window as any).turnstile) {
          return;
        }

        this.detenerIntervaloTurnstile();

        this.turnstileWidgetId =
          (window as any).turnstile.render(
            '#turnstile-container',
            {
              sitekey:
                '0x4AAAAAADnymYYNSGiPFpPi',
              theme: 'light',

              callback: (token: string) => {
                this.captchaToken = token;
                this.cdr.detectChanges();
              },

              'expired-callback': () => {
                this.captchaToken = '';
                this.cdr.detectChanges();
              },

              'error-callback': () => {
                this.captchaToken = '';
                this.cdr.detectChanges();
              }
            }
          );
      },
      300
    );
  }


  ngOnDestroy(): void {
    this.detenerIntervaloTurnstile();
    delete (window as any).onCaptchaSuccess;
  }


  entrar(): void {
    this.error = '';
    this.avisoSesion = '';

    if (!this.captchaToken) {
      this.error =
        'Por favor completa el captcha.';
      return;
    }

    this.authService.login(
      this.usuario,
      this.password,
      this.captchaToken
    ).subscribe({
      next: () => {
        this.router.navigate(['/']);
      },

      error: (err) => {
        console.error(
          'Error login:',
          err
        );

        this.error =
          err?.error?.detail ||
          'El usuario o la contraseña son incorrectos.';

        if (
          (window as any).turnstile &&
          this.turnstileWidgetId !== null
        ) {
          (window as any).turnstile.reset(
            this.turnstileWidgetId
          );

          this.captchaToken = '';
        }

        this.cdr.detectChanges();
      }
    });
  }


  abrirCorreoSoporte(): void {
    const correo = 'TU_CORREO@DOMINIO.COM';

    const asunto = encodeURIComponent(
      'Ayuda para ingresar a WRF Agro'
    );

    const cuerpo = encodeURIComponent(
      'Hola, tengo problemas para iniciar sesión ' +
      'en WRF Agro.\n\nUsuario: ' +
      this.usuario
    );

    window.open(
      'https://mail.google.com/mail/' +
      '?view=cm&fs=1' +
      '&to=' + correo +
      '&su=' + asunto +
      '&body=' + cuerpo,
      '_blank'
    );
  }


  private detenerIntervaloTurnstile(): void {
    if (!this.intervaloTurnstile) {
      return;
    }

    clearInterval(
      this.intervaloTurnstile
    );

    this.intervaloTurnstile = null;
  }
}