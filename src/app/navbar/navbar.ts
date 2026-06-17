import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { Auth } from '../auth';
import { AuthService } from '../services/auth.services';

@Component({
  selector: 'app-navbar',
  imports: [],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class Navbar {

  private router = inject(Router);
  private auth = inject(Auth);

  // NUEVO
  public authService = inject(AuthService);

  irMapa() {
    this.router.navigate(['/']);
  }

  irDashboard() {
    this.router.navigate(['/dashboard']);
  }

  // NUEVO
  irUsuarios() {
    this.router.navigate(['/admin/usuarios']);
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}