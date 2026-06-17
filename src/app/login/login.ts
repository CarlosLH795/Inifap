import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {

  usuario = '';
  password = '';
  error = false;

  private auth = inject(Auth);
  private router = inject(Router);

  entrar() {

    const ok = this.auth.login(
      this.usuario,
      this.password
    );

    if (ok) {
      this.router.navigate(['/']);
    } else {
      this.error = true;
    }
  }
}