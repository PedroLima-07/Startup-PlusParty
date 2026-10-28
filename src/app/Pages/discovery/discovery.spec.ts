import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Estabelecimento } from '../../models';
import { AuthService } from '../../services/auth.service';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';
import { HomeService } from '../../services/home.service';
import { NotificacoesService } from '../../services/notificacoes.service';
import { DiscoveryPage, ordenar } from './discovery';

const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];

function bar(nome: string, parcial: Partial<Estabelecimento> = {}): Estabelecimento {
  return {
    id: nome,
    nome,
    descricao: null,
    endereco: null,
    capacidade: 10,
    avaliacao: null,
    nota_media: null,
    total_avaliacoes: 0,
    instagram: null,
    tiktok: null,
    whatsapp: null,
    latitude: null,
    longitude: null,
    criado_em: '2026-01-01',
    foto_url: null,
    sobre: null,
    tags: [],
    horario_abre: null,
    horario_fecha: null,
    dias_abertos: [],
    ...parcial,
  };
}

// Aberto o dia todo: abre 00:00 e "fecha" 23:59.
const ABERTO = { horario_abre: '00:00:00', horario_fecha: '23:59:00', dias_abertos: TODOS_OS_DIAS };

describe('DiscoveryPage', () => {
  let fixture: ComponentFixture<DiscoveryPage>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function nomes(): string[] {
    return Array.from(tela().querySelectorAll('.bar-name')).map((n) => n.textContent ?? '');
  }

  function filtro(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll<HTMLButtonElement>('.filtro')).find((b) =>
      b.textContent?.includes(rotulo),
    )!;
  }

  beforeEach(async () => {
    const lista = [
      bar('Vinil Bar'),
      bar('Bar DZé', { ...ABERTO, nota_media: 4.1, total_avaliacoes: 66 }),
      bar('Neon Club', { ...ABERTO, nota_media: 4.9, total_avaliacoes: 128 }),
      bar('Skyline', { ...ABERTO, nota_media: 3.8, total_avaliacoes: 20 }),
    ];

    await TestBed.configureTestingModule({
      imports: [DiscoveryPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { perfilAtual: async () => null } },
        { provide: NotificacoesService, useValue: { naoLidas: () => 0 } },
        {
          provide: EstabelecimentosService,
          useValue: {
            listar: async () => lista,
            baresComEventoHoje: async () => new Set(['Skyline']),
          },
        },
        {
          provide: HomeService,
          useValue: {
            contarComandasAbertasPorBar: async () => new Map([['Bar DZé', 9]]),
            calcularLotacao: (abertas: number, capacidade: number) =>
              abertas / capacidade >= 0.8 ? 'quente' : 'normal',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DiscoveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('abertos primeiro, depois quem tem evento hoje, depois a nota', () => {
    expect(nomes()).toEqual(['Skyline', 'Neon Club', 'Bar DZé', 'Vinil Bar']);
  });

  it('o cartão mostra a nota real, o horário e os selos', () => {
    const texto = tela().textContent ?? '';
    expect(texto).toContain('4,9');
    expect(texto).toContain('(128 avaliações)');
    expect(texto).toContain('Aberto até 23h59');
    expect(texto).toContain('Novo no +party');
    expect(texto).toContain('Evento hoje');
    expect(texto).toContain('Quente agora');
  });

  it('os filtros se somam e podem ser desligados', () => {
    filtro('Aberto agora').click();
    expect(nomes()).toEqual(['Skyline', 'Neon Club', 'Bar DZé']);

    filtro('Quente agora').click();
    expect(nomes()).toEqual(['Bar DZé']);
    expect(filtro('Quente agora').getAttribute('aria-pressed')).toBe('true');

    filtro('Quente agora').click();
    filtro('Aberto agora').click();
    expect(nomes()).toHaveLength(4);
  });

  it('sem bar nos filtros, sugere tirar um filtro', () => {
    filtro('Evento hoje').click();
    filtro('Quente agora').click();

    expect(tela().textContent).toContain('Tire um filtro para ver mais bares.');
  });

  it('ordenar desempata pelo nome', () => {
    const base = { aberto: false, eventoHoje: false, nota_media: null };
    expect(ordenar([{ ...base, nome: 'B' }, { ...base, nome: 'A' }]).map((b) => b.nome)).toEqual(['A', 'B']);
  });
});
