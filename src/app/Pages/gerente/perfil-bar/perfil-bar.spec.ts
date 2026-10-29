import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { BarPerfilService } from '../../../services/bar-perfil.service';
import { EstabelecimentosService } from '../../../services/estabelecimentos.service';
import { GoogleMapsService } from '../../../services/google-maps.service';
import { PerfilBarComponent } from './perfil-bar';

describe('Configurações do bar (gerente)', () => {
  let fixture: ComponentFixture<PerfilBarComponent>;
  let salvar: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    const bar = {
      nome: "Bar D'Zé",
      descricao: 'Chope gelado',
      sobre: null,
      endereco: 'Rua das Flores, 142',
      capacidade: 80,
      horario_abre: '18:00:00',
      horario_fecha: '02:00:00',
      dias_abertos: [5, 6],
      foto_url: null,
    };
    salvar = vi.fn().mockImplementation(async (dados: object) => ({ ...bar, ...dados }));

    await TestBed.configureTestingModule({
      imports: [PerfilBarComponent],
      providers: [
        provideRouter([]),
        { provide: BarPerfilService, useValue: { carregar: async () => bar, salvar } },
        { provide: AuthService, useValue: { perfilAtual: async () => null, sair: vi.fn() } },
        { provide: EstabelecimentosService, useValue: {} },
        { provide: GoogleMapsService, useValue: { temChave: false, carregar: async () => null } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PerfilBarComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('carrega o bar do banco e marca os dias em que abre', () => {
    expect(tela().querySelector<HTMLInputElement>('input[name="nome"]')?.value).toBe("Bar D'Zé");
    const marcados = Array.from(tela().querySelectorAll('.dias button.ativo')).map((b) => b.textContent?.trim());
    expect(marcados).toEqual(['Sex', 'Sáb']);
  });

  it('salva no formato do banco: horas com segundos e dias em ordem', async () => {
    Array.from(tela().querySelectorAll<HTMLButtonElement>('.dias button'))
      .find((b) => b.textContent?.trim() === 'Qui')!
      .click();
    tela().querySelector<HTMLFormElement>('form.cartao')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(salvar).toHaveBeenCalledWith(
      {
        nome: "Bar D'Zé",
        descricao: 'Chope gelado',
        sobre: null,
        endereco: 'Rua das Flores, 142',
        capacidade: 80,
        horario_abre: '18:00:00',
        horario_fecha: '02:00:00',
        dias_abertos: [4, 5, 6],
      },
      null,
    );
    expect(tela().textContent).toContain('Alterações salvas.');
  });
});
