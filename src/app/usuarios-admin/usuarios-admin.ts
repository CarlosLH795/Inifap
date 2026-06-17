import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Navbar } from '../navbar/navbar';
import { UsuariosService } from '../services/usuarios.service';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-usuarios-admin',
  imports: [CommonModule, FormsModule, Navbar],
  templateUrl: './usuarios-admin.html',
  styleUrl: './usuarios-admin.css'
})
export class UsuariosAdmin implements OnInit {

  private usuariosService = inject(UsuariosService);

  usuarios: any[] = [];

  mensaje = '';
  error = '';

  editandoId: number | null = null;

  form = {
    usuario: '',
    nombre: '',
    rol: 'usuario',
    password: '',
    activo: true
  };
constructor(
  private cdr: ChangeDetectorRef
) {}
  ngOnInit(): void {
    this.cargarUsuarios();
  }

 cargarUsuarios(): void {
  this.usuariosService.listar().subscribe({
    next: (resp: any[]) => {
      this.usuarios = [];

      setTimeout(() => {
        this.usuarios = [...resp];
        this.cdr.detectChanges();
      }, 0);
    },
    error: (err) => {
      console.error('Error cargando usuarios:', err);
      this.error = 'No se pudieron cargar los usuarios.';
    }
  });
}

  limpiarFormulario(): void {
    this.editandoId = null;

    this.form = {
      usuario: '',
      nombre: '',
      rol: 'usuario',
      password: '',
      activo: true
    };
  }

  guardar(): void {
    this.mensaje = '';
    this.error = '';

    if (!this.form.usuario || !this.form.nombre) {
      this.error = 'Usuario y nombre son obligatorios.';
      return;
    }

    if (this.editandoId === null && !this.form.password) {
      this.error = 'La contraseña es obligatoria para usuarios nuevos.';
      return;
    }

    if (this.editandoId === null) {
      this.crearUsuario();
    } else {
      this.actualizarUsuario();
    }
  }

  crearUsuario(): void {
  const data = {
    usuario: this.form.usuario,
    nombre: this.form.nombre,
    rol: this.form.rol,
    password: this.form.password
  };

  this.usuariosService.crear(data).subscribe({
    next: () => {
      this.mensaje = 'Usuario creado correctamente.';
      this.limpiarFormulario();
      this.cargarUsuarios(); // refresca tabla
    },
    error: (err) => {
      this.error = err?.error?.detail || 'No se pudo crear el usuario.';
    }
  });
}

  actualizarUsuario(): void {
    if (this.editandoId === null) {
      return;
    }

    const data = {
      nombre: this.form.nombre,
      rol: this.form.rol,
      activo: this.form.activo
    };

    this.usuariosService.actualizar(this.editandoId, data).subscribe({
      next: () => {
  if (this.form.password) {
    this.actualizarPassword(this.editandoId!);
  } else {
    this.mensaje = 'Usuario actualizado correctamente.';
    this.limpiarFormulario();
    this.cargarUsuarios(); // refresca tabla
  }
},
      error: (err) => {
        this.error =
          err?.error?.detail ||
          'No se pudo actualizar el usuario.';
      }
    });
  }

  actualizarPassword(id: number): void {
    this.usuariosService.cambiarPassword(id, this.form.password).subscribe({
      next: () => {
        this.mensaje = 'Usuario y contraseña actualizados correctamente.';
        this.limpiarFormulario();
        this.cargarUsuarios();
      },
      error: () => {
        this.error = 'Usuario actualizado, pero no se pudo cambiar la contraseña.';
        this.cargarUsuarios();
      }
    });
  }

  editar(usuario: any): void {
    this.editandoId = usuario.id;

    this.form = {
      usuario: usuario.usuario,
      nombre: usuario.nombre,
      rol: usuario.rol,
      password: '',
      activo: usuario.activo
    };
  }

  desactivar(usuario: any): void {
  this.usuariosService.actualizar(usuario.id, {
    activo: false
  }).subscribe({
    next: () => {
      this.mensaje = 'Usuario desactivado.';
      this.cargarUsuarios(); // refresca tabla
    },
    error: () => {
      this.error = 'No se pudo desactivar el usuario.';
    }
  });
}

  activar(usuario: any): void {
  this.usuariosService.actualizar(usuario.id, {
    activo: true
  }).subscribe({
    next: () => {
      this.mensaje = 'Usuario activado.';
      this.cargarUsuarios(); // refresca tabla
    },
    error: () => {
      this.error = 'No se pudo activar el usuario.';
    }
  });
}
}