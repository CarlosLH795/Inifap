import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UsuariosAdmin } from './usuarios-admin';

describe('UsuariosAdmin', () => {
  let component: UsuariosAdmin;
  let fixture: ComponentFixture<UsuariosAdmin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsuariosAdmin],
    }).compileComponents();

    fixture = TestBed.createComponent(UsuariosAdmin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
