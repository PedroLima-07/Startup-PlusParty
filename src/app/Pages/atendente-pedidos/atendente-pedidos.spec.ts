import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AtendentePedidos } from './atendente-pedidos';

describe('AtendentePedidos', () => {
  let component: AtendentePedidos;
  let fixture: ComponentFixture<AtendentePedidos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtendentePedidos]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AtendentePedidos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
