import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../auth';

@Component({
  selector: 'app-navbar',
  imports: [],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class Navbar {

  private router = inject(Router);
  private auth = inject(Auth);

  irMapa() {
    this.router.navigate(['/']);
  }

  irDashboard() {
    this.router.navigate(['/dashboard']);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}