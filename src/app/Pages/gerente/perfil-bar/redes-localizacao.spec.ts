import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../../services/auth.service';
import { EstabelecimentosService, RedeInvalidaError } from '../../../services/estabelecimentos.service';
import { GoogleMapsService } from '../../../services/google-maps.service';
import { RedesLocalizacao } from './redes-localizacao';

describe('RedesLocalizacao (Configurações do gerente)', () => {
  let fixture: ComponentFixture<RedesLocalizacao>;
  let salvar: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function digitar(nome: string, valor: string): Promise<void> {
    const campo = tela().querySelector<HTMLInputElement>(`input[name="${nome}"]`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    salvar = vi.fn().mockImplementation(async (_id: string, dados: object) => ({ ...dados, instagram: 'bardoze' }));

    await TestBed.configureTestingModule({
      imports: [RedesLocalizacao],
      providers: [
        { provide: AuthService, useValue: { perfilAtual: async () => ({ estabelecimento: { id: 'b1' } }) } },
        { provide: GoogleMapsService, useValue: { temChave: false, carregar: async () => null } },
        {
          provide: EstabelecimentosService,
          useValue: {
            buscarPorId: async () => ({
              instagram: null,
              tiktok: null,
              whatsapp: null,
              latitude: null,
              longitude: null,
            }),
            salvarRedesELocalizacao: salvar,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RedesLocalizacao);
    fixture.detectChanges();
    await fixture.whenStable();
    // O formulário aparece depois de carregar; o mapa tenta carregar depois de desenhado.
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((pronto) => setTimeout(pronto));
    }
  });

  it('salva o que foi digitado, com campo vazio indo como nulo', async () => {
    await digitar('instagram', '@bardoze');
    tela().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();

    expect(salvar).toHaveBeenCalledWith('b1', {
      instagram: '@bardoze',
      tiktok: null,
      whatsapp: null,
      latitude: null,
      longitude: null,
    });
    expect(tela().textContent).toContain('Redes e localização salvas.');
  });

  it('se o banco recusar o WhatsApp, explica o formato', async () => {
    salvar.mockRejectedValue(new RedeInvalidaError('whatsapp'));
    await digitar('whatsapp', '123');
    tela().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();

    expect(tela().querySelector('.erro')?.textContent).toContain('precisa ter DDD e número');
  });

  it('sem a chave do Google, o mapa avisa e o "Como chegar" usa o endereço', () => {
    expect(tela().textContent).toContain('Mapa indisponível');
    expect(tela().textContent).toContain('Sem ponto marcado, o "Como chegar" usa o endereço.');
  });
});
