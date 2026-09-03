import {
  Component,
  inject,
} from '@angular/core';

import { Router } from '@angular/router';

import { AuthService } from '../services/auth.services';

@Component({
  selector: 'app-navbar',
  imports: [],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  private readonly router = inject(Router);

  public readonly authService =
    inject(AuthService);

  irAcercaDe(): void {
    this.router.navigate(['/acerca-de']);
  }

  irMapa(): void {
    this.router.navigate(['/']);
  }

  irDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  irUsuarios(): void {
    this.router.navigate(['/admin/usuarios']);
  }

  logout(): void {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}