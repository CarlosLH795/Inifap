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

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  entrar(): void {
    this.error = '';

    this.authService.login(this.usuario, this.password)
      .subscribe({
        next: () => {
          this.router.navigate(['/']);
        },
        error: (err) => {
          console.error('Error login:', err);

          this.error =
            err?.error?.detail ||
            'El usuario o la contraseña son incorrectos.';

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