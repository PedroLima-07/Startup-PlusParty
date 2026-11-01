import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ComandaAtendente } from '../../models';
import { AuthService } from '../../services/auth.service';
import { ComandasAtendenteService } from '../../services/comandas-atendente.service';
import { SupabaseService } from '../../services/supabase.service';
import { AtendenteComandas } from './atendente-comandas';

registerLocaleData(localePt);

const minutosAtras = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

function comanda(dados: Partial<ComandaAtendente> & Pick<ComandaAtendente, 'id' | 'cliente'>): ComandaAtendente {
  return {
    status: 'aguardando_liberacao',
    mesa: '4',
    usuario_id: 'u1',
    criada_em: minutosAtras(1),
    fechada_em: null,
    liberada_em: null,
    liberada_por: null,
    veio_da_fila: false,
    total: 0,
    itens: [],
    ...dados,
  };
}

const NOITE: ComandaAtendente[] = [
  comanda({ id: 'l1', cliente: 'Gil', criada_em: minutosAtras(7) }),
  comanda({ id: 'l2', cliente: 'Larissa', criada_em: minutosAtras(2) }),
  // Abriu antes, mas fechou a conta depois: vem em segundo na fila de receber.
  comanda({
    id: 'r1',
    cliente: 'João',
    status: 'aguardando_pagamento',
    criada_em: minutosAtras(200),
    fechada_em: minutosAtras(8),
    total: 58,
  }),
  comanda({
    id: 'r2',
    cliente: 'Carla',
    status: 'aguardando_pagamento',
    criada_em: minutosAtras(150),
    fechada_em: minutosAtras(34),
    total: 86,
  }),
  comanda({ id: 'a1', cliente: 'Josias', status: 'aberta', total: 24 }),
];

describe('AtendenteComandas — cartões no desktop', () => {
  let fixture: ComponentFixture<AtendenteComandas>;
  let listar: ReturnType<typeof vi.fn>;
  let avisarMudanca: () => void;
  const matchMediaOriginal = window.matchMedia;

  const tela = () => {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const cartoes = () => Array.from(tela().querySelectorAll<HTMLButtonElement>('.cartao'));
  const cartao = (rotulo: string) => cartoes().find((c) => c.textContent?.includes(rotulo))!;
  const nomes = () => Array.from(tela().querySelectorAll('.card .cliente')).map((e) => e.textContent);
  const assentar = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    // Faz a tela se comportar como no desktop.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    listar = vi.fn().mockResolvedValue(NOITE);

    await TestBed.configureTestingModule({
      imports: [AtendenteComandas],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: ComandasAtendenteService,
          useValue: {
            listar,
            liberar: vi.fn().mockResolvedValue(undefined),
            recusar: vi.fn().mockResolvedValue(undefined),
            confirmarPagamento: vi.fn().mockResolvedValue(undefined),
            historicoNaoPaga: vi.fn().mockResolvedValue(null),
            ordenar: (lista: ComandaAtendente[]) => lista,
            pendencias: signal(4),
            atualizarPendencias: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuthService,
          useValue: {
            sair: vi.fn(),
            perfilAtual: vi.fn().mockResolvedValue({ estabelecimento: { id: 'bar1', nome: 'Bar' } }),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            escutarMudancas: (_tabelas: unknown, aoMudar: () => void) => {
              avisarMudanca = aoMudar;
              return () => {};
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AtendenteComandas);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
  });

  it('abre nos três cartões, sem lista e sem detalhe', () => {
    expect(tela().querySelector('.layout')?.classList).toContain('nos-cartoes');
    expect(nomes()).toEqual([]);
    expect(cartoes().map((c) => c.querySelector('.cartao-numero')?.textContent?.trim())).toEqual([
      '2',
      '2',
      '1',
    ]);
    // A moeda usa espaço que não quebra entre R$ e o valor.
    expect(cartao('Receber').textContent).toMatch(/R\$\s144,00 esperando/);
  });

  it('o cartão fica urgente quando a mais antiga passa do limite', () => {
    expect(cartao('Liberar').classList).toContain('urgente'); // 7 min > 5
    expect(cartao('Receber').classList).toContain('urgente'); // 34 min > 30
    expect(cartao('Abertas').classList).not.toContain('urgente');
    expect(cartao('Receber').textContent).toContain('fechou há 34 min');
  });

  it('entrar num cartão lista da mais antiga para a mais nova e já abre a primeira', () => {
    cartao('Receber').click();

    // Carla fechou a conta antes de João, mesmo tendo aberto depois.
    expect(nomes()).toEqual(['Carla', 'João']);
    expect(tela().querySelector('.card.selecionada')?.textContent).toContain('Carla');
    expect(tela().querySelector('.cliente-destaque')?.textContent).toContain('Carla');
    expect(tela().querySelector('.topo-pagina h1')?.textContent).toContain('Receber pagamento · 2');
  });

  it('depois de confirmar, nenhuma conta abre sozinha no detalhe', async () => {
    cartao('Receber').click();
    listar.mockResolvedValue(NOITE.filter((c) => c.id !== 'r2'));

    Array.from(tela().querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Confirmar pagamento'))!
      .click();
    await assentar();

    expect(nomes()).toEqual(['João']);
    expect(tela().querySelector('.cliente-destaque')).toBeNull();
    expect(tela().querySelector('.sem-selecao')).not.toBeNull();
  });

  it('cada pagamento confirmado ganha o próprio aviso, com mesa, cliente e valor', async () => {
    cartao('Receber').click();
    listar.mockResolvedValue(NOITE.filter((c) => c.id !== 'r2'));
    Array.from(tela().querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Confirmar pagamento'))!
      .click();
    await assentar();

    const avisos = tela().querySelectorAll('.aviso');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].textContent).toContain('Pagamento confirmado');
    expect(avisos[0].textContent).toContain('R$');
  });

  it('a seta volta para os três cartões', () => {
    cartao('Liberar').click();
    tela().querySelector<HTMLButtonElement>('.btn-cartoes')!.click();

    expect(tela().querySelector('.layout')?.classList).toContain('nos-cartoes');
    expect(nomes()).toEqual([]);
  });

  it('quando chega comanda nova, o número do cartão pisca', async () => {
    listar.mockResolvedValue([...NOITE, comanda({ id: 'l3', cliente: 'Bruno' })]);

    avisarMudanca();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();

    expect(cartao('Liberar').classList).toContain('pulsou');
    expect(cartao('Receber').classList).not.toContain('pulsou');
  });
});
