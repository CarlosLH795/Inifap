import { Component, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { AuthService } from '../services/auth.services';

@Component({
  selector: 'app-login',
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {

  usuario = '';
  password = '';
  error = '';
  captchaToken = '';
  turnstileWidgetId: any = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}



ngAfterViewInit(): void {
  const interval = setInterval(() => {

    if ((window as any).turnstile) {

      clearInterval(interval);

      this.turnstileWidgetId =
        (window as any).turnstile.render(
          '#turnstile-container',
          {
            sitekey: '0x4AAAAAADnymYYNSGiPFpPi',
            theme: 'light',

            callback: (token: string) => {

              console.log('CAPTCHA TOKEN:', token);

              // disponible desde F12
              (window as any).captchaToken = token;

              this.captchaToken = token;

              this.cdr.detectChanges();
            },

            'expired-callback': () => {

              console.log('CAPTCHA EXPIRADO');

              this.captchaToken = '';
              (window as any).captchaToken = '';

              this.cdr.detectChanges();
            },

            'error-callback': () => {

              console.error('ERROR TURNSTILE');

              this.captchaToken = '';
              (window as any).captchaToken = '';

              this.cdr.detectChanges();
            }
          }
        );
    }

  }, 300);
}

  ngOnInit(): void {
  (window as any).onCaptchaSuccess = (token: string) => {

    console.log('TOKEN CAPTCHA:', token);
    this.captchaToken = token;
    this.cdr.detectChanges();
  };
}
  entrar(): void {
  this.error = '';

  //descomentar para activar el captcha
  if (!this.captchaToken) {
    this.error = 'Por favor completa el captcha.';
    return;
  }

  this.authService.login(this.usuario, this.password, this.captchaToken)
    .subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (err) => {
        console.error('Error login:', err);

        this.error =
          err?.error?.detail ||
          'El usuario o la contraseña son incorrectos.';

          // Resetear captcha
      if ((window as any).turnstile && this.turnstileWidgetId !== null) {
        (window as any).turnstile.reset(this.turnstileWidgetId);
        this.captchaToken = '';
      }

        this.cdr.detectChanges();
      }
    });
}


  abrirCorreoSoporte(): void {
    const correo = 'TU_CORREO@DOMINIO.COM';
    const asunto = encodeURIComponent('Ayuda para ingresar a WRF Agro');
    const cuerpo = encodeURIComponent(
      `Hola, tengo problemas para iniciar sesión en WRF Agro.\n\nUsuario: ${this.usuario}`
    );

    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&to=${correo}&su=${asunto}&body=${cuerpo}`,
      '_blank'
    );
  }
}