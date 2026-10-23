import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ComandaAtendente } from '../../models';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import {
  ComandaJaMudouError,
  ComandasAtendenteService,
} from '../../services/comandas-atendente.service';
import { AtendenteComandas } from './atendente-comandas';

function comanda(
  dados: Partial<ComandaAtendente> & Pick<ComandaAtendente, 'id'>,
): ComandaAtendente {
  return {
    status: 'aguardando_liberacao',
    mesa: '12',
    usuario_id: 'u1',
    cliente: 'Carlos',
    criada_em: '2026-09-25T22:00:00Z',
    fechada_em: null,
    liberada_em: null,
    liberada_por: null,
    total: 0,
    itens: [],
    ...dados,
  };
}

const LIBERACAO = comanda({ id: 'a1b2-c1', mesa: '12', cliente: 'Carlos' });
const PAGAMENTO = comanda({
  id: 'c3d4-c2',
  status: 'aguardando_pagamento',
  mesa: null,
  cliente: 'Mariana',
  total: 58,
  itens: [
    { nome: 'Chope', quantidade: 2, preco_unitario: 12 },
    { nome: 'Batata frita', quantidade: 1, preco_unitario: 34 },
  ],
});
const ABERTA = comanda({
  id: 'e5f6-c3',
  status: 'aberta',
  mesa: '7',
  cliente: 'Josias',
  total: 24,
  itens: [{ nome: 'Chope', quantidade: 2, preco_unitario: 12 }],
});

registerLocaleData(localePt);

describe('AtendenteComandas', () => {
  let fixture: ComponentFixture<AtendenteComandas>;
  let service: {
    listar: ReturnType<typeof vi.fn>;
    liberar: ReturnType<typeof vi.fn>;
    recusar: ReturnType<typeof vi.fn>;
    confirmarPagamento: ReturnType<typeof vi.fn>;
    historicoNaoPaga: ReturnType<typeof vi.fn>;
    ordenar: (lista: ComandaAtendente[]) => ComandaAtendente[];
    pendencias: WritableSignal<number>;
    atualizarPendencias: ReturnType<typeof vi.fn>;
  };
  let authService: { sair: ReturnType<typeof vi.fn>; perfilAtual: ReturnType<typeof vi.fn> };
  let supabase: { escutarMudancas: ReturnType<typeof vi.fn> };
  let avisarMudanca: () => void;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function cards(): HTMLButtonElement[] {
    return Array.from(tela().querySelectorAll<HTMLButtonElement>('.card'));
  }

  function cartoes(): HTMLButtonElement[] {
    return Array.from(tela().querySelectorAll<HTMLButtonElement>('.cartao'));
  }

  /** Abre a comanda no detalhe, trocando de cartão se ela estiver em outra lista. */
  function abrir(texto: string): void {
    for (let i = -1; i < 3; i++) {
      if (i >= 0) cartoes()[i].click();
      const card = cards().find((c) => c.textContent?.includes(texto));
      if (card) {
        card.click();
        fixture.detectChanges();
        return;
      }
    }
    throw new Error(`Nenhuma comanda com "${texto}"`);
  }

  function botao(texto: string): HTMLButtonElement | undefined {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.includes(texto),
    );
  }

  /**
   * Espera as consultas simuladas terminarem. O whenStable sozinho só espera
   * quando algum signal mudou na hora; uma recarga silenciosa não muda nenhum.
   */
  async function assentar(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  async function tocar(texto: string): Promise<void> {
    botao(texto)!.click();
    await assentar();
  }

  async function atualizar(): Promise<void> {
    tela().querySelector<HTMLButtonElement>('.btn-refresh')!.click();
    await assentar();
  }

  beforeEach(async () => {
    supabase = {
      escutarMudancas: vi.fn((_tabelas: unknown, aoMudar: () => void) => {
        avisarMudanca = aoMudar;
        return () => {};
      }),
    };
    service = {
      listar: vi.fn().mockResolvedValue([LIBERACAO, PAGAMENTO, ABERTA]),
      liberar: vi.fn().mockResolvedValue(undefined),
      recusar: vi.fn().mockResolvedValue(undefined),
      confirmarPagamento: vi.fn().mockResolvedValue(undefined),
      historicoNaoPaga: vi.fn().mockResolvedValue(null),
      ordenar: (lista) => lista,
      pendencias: signal(2),
      atualizarPendencias: vi.fn().mockResolvedValue(undefined),
    };
    authService = {
      sair: vi.fn().mockResolvedValue(undefined),
      perfilAtual: vi.fn().mockResolvedValue({
        nome: 'Ana',
        tipo: 'funcionario',
        estabelecimento: { id: 'bar1', nome: 'Bar do Zé' },
      }),
    };

    await TestBed.configureTestingModule({
      imports: [AtendenteComandas],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: ComandasAtendenteService, useValue: service },
        { provide: AuthService, useValue: authService },
        { provide: SupabaseService, useValue: supabase },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AtendenteComandas);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  describe('conta e histórico', () => {
    const minutosAtras = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

    async function listarSo(comanda: ComandaAtendente): Promise<void> {
      service.listar.mockResolvedValue([comanda]);
      await atualizar();
    }

    it('ao liberar, avisa se o cliente já saiu sem pagar', async () => {
      service.historicoNaoPaga.mockResolvedValue({
        estabelecimento: 'Neon Club',
        valor: 86,
        quando: '2026-10-18T23:00:00Z',
        vezes: 1,
      });

      abrir('Carlos');
      await assentar();

      expect(service.historicoNaoPaga).toHaveBeenCalledWith('u1');
      const aviso = tela().querySelector('.aviso-historico');
      expect(aviso?.textContent).toContain('Já saiu sem pagar uma vez');
      expect(aviso?.textContent).toContain('Neon Club');
    });

    it('cliente sem histórico: nenhum aviso', async () => {
      abrir('Carlos');
      await assentar();

      expect(tela().querySelector('.aviso-historico')).toBeNull();
    });

    it('esperando pagamento: mostra há quanto tempo, quem liberou e quando fechou', async () => {
      await listarSo({
        ...PAGAMENTO,
        fechada_em: minutosAtras(12),
        liberada_em: '2026-10-23T20:45:00Z',
        liberada_por: 'Ana Lima',
      });

      abrir('Mariana');

      const espera = tela().querySelector('.espera-pagamento');
      // O relógio da tela começou um pouco antes do fechamento simulado: 11 ou 12.
      expect(espera?.textContent).toMatch(/Esperando pagamento há 1[12] min/);
      expect(espera?.classList.contains('atrasado')).toBe(false);
      expect(tela().querySelector('.linha-do-tempo')?.textContent).toContain('Liberada por Ana Lima');
      expect(tela().querySelector('.linha-do-tempo')?.textContent).toContain('Conta fechada pelo cliente');
    });

    it('depois de 30 min, a espera fica vermelha e avisa que o gerente sabe', async () => {
      await listarSo({ ...PAGAMENTO, fechada_em: minutosAtras(34) });

      abrir('Mariana');

      const espera = tela().querySelector('.espera-pagamento');
      expect(espera?.classList.contains('atrasado')).toBe(true);
      expect(espera?.textContent).toContain('O gerente também foi avisado');
    });
  });

  describe('lista', () => {
    it('busca as comandas do bar do atendente logado', () => {
      expect(service.listar).toHaveBeenCalledWith('bar1');
    });

    it('mostra os três cartões com quantas comandas há em cada', () => {
      expect(cartoes().map((c) => c.querySelector('.cartao-numero')?.textContent?.trim())).toEqual([
        '1',
        '1',
        '1',
      ]);
      expect(cartoes()[0].textContent).toContain('Liberar');
      expect(cartoes()[1].textContent).toContain('Receber');
      expect(cartoes()[2].textContent).toContain('Abertas');
    });

    it('no celular a lista começa pelo primeiro cartão com alguém esperando', () => {
      expect(cartoes()[0].getAttribute('aria-pressed')).toBe('true');
      expect(cards().map((card) => card.querySelector('.cliente')?.textContent)).toEqual(['Carlos']);
    });

    it('tocar num cartão mostra só as comandas daquele tipo', () => {
      cartoes()[1].click();

      expect(cards().map((card) => card.querySelector('.cliente')?.textContent)).toEqual(['Mariana']);
      expect(cartoes()[1].getAttribute('aria-pressed')).toBe('true');
      expect(tela().querySelector('.titulo-lista')?.textContent).toContain('Receber pagamento · 1');
    });

    it('cada card traz identificador, cliente, mesa ou balcão e valor parcial', () => {
      const [liberacao] = cards();
      expect(liberacao.textContent).toContain('#A1B2');
      expect(liberacao.textContent).toContain('Carlos');
      expect(liberacao.textContent).toContain('Mesa 12');
      expect(liberacao.textContent).toContain('esperando há');

      cartoes()[1].click();
      const [pagamento] = cards();
      expect(pagamento.textContent).toContain('Balcão');
      expect(pagamento.textContent).toContain('Mariana');
      expect(pagamento.textContent).toContain('58,00');
    });

    it('mostra o contador de pendências na aba Comandas', () => {
      expect(tela().querySelector('app-nav-atendente .contador')!.textContent).toContain('2');
    });

    it('avisa quando não há comandas', async () => {
      service.listar.mockResolvedValueOnce([]);

      await atualizar();

      expect(tela().textContent).toContain('Nada para liberar.');
      expect(cartoes().every((cartao) => cartao.classList.contains('zerado'))).toBe(true);
    });

    it('mostra erro quando não consegue carregar', async () => {
      service.listar.mockRejectedValueOnce(new Error('rede'));

      await atualizar();

      expect(tela().textContent).toContain('Não foi possível carregar as comandas');
    });

    it('explica quando a conta não está ligada a um bar', async () => {
      authService.perfilAtual.mockResolvedValueOnce({
        nome: 'Ana',
        tipo: 'cliente',
        estabelecimento: null,
      });

      await atualizar();

      expect(tela().textContent).toContain('não está ligada a nenhum bar');
    });

    it('recarrega sozinha, sem piscar "Carregando", quando o banco avisa uma mudança', async () => {
      service.listar.mockResolvedValueOnce([comanda({ id: 'novo', mesa: '9', cliente: 'Lívia' })]);

      avisarMudanca();
      expect(tela().querySelector('app-carregando')).toBeNull();
      await assentar();

      expect(supabase.escutarMudancas).toHaveBeenCalledWith(
        [{ tabela: 'comandas' }, { tabela: 'pedido_itens' }],
        expect.any(Function),
      );
      expect(tela().textContent).toContain('Lívia');
    });
  });

  describe('liberar comanda', () => {
    it('abre a confirmação com cliente, local, horário e a orientação', () => {
      abrir('Carlos');
      const texto = tela().textContent!;

      expect(tela().querySelector('.cliente-destaque')!.textContent).toContain('Carlos');
      expect(texto).toContain('Mesa 12');
      expect(texto).toMatch(/\d{2}:\d{2}/);
      expect(texto).toContain('Confirme que o cliente está no local antes de liberar');
      expect(botao('Liberar comanda')).toBeTruthy();
      expect(botao('Recusar')).toBeTruthy();
      expect(service.liberar).not.toHaveBeenCalled();
    });

    it('no balcão, lembra de identificar a pessoa pelo nome', async () => {
      service.listar.mockResolvedValueOnce([comanda({ id: 'b1', mesa: null, cliente: 'Rafa' })]);
      avisarMudanca();
      await assentar();

      abrir('Rafa');

      expect(tela().textContent).toContain('Balcão');
      expect(tela().textContent).toContain('identifique a pessoa pelo nome');
    });

    it('liberar muda para aberta, avisa e volta para a lista recarregada', async () => {
      service.listar.mockResolvedValue([PAGAMENTO, { ...LIBERACAO, status: 'aberta' }, ABERTA]);
      abrir('Carlos');

      await tocar('Liberar comanda');

      expect(service.liberar).toHaveBeenCalledWith('a1b2-c1');
      expect(tela().querySelector('.aviso')!.textContent).toContain('Comanda liberada');
      expect(service.listar).toHaveBeenCalledTimes(2);
      expect(cards().some((card) => card.textContent?.includes('Carlos'))).toBe(false);

      cartoes()[2].click();
      const carlos = cards().find((card) => card.textContent?.includes('Carlos'))!;
      expect(carlos.classList).toContain('aberta');
    });

    it('recusar tira a comanda da lista e avisa', async () => {
      service.listar.mockResolvedValue([PAGAMENTO, ABERTA]);
      abrir('Carlos');

      await tocar('Recusar');

      expect(service.recusar).toHaveBeenCalledWith('a1b2-c1');
      expect(service.liberar).not.toHaveBeenCalled();
      expect(tela().querySelector('.aviso')!.textContent).toContain('Comanda recusada');
      expect(cards().some((card) => card.textContent?.includes('Carlos'))).toBe(false);
    });

    it('voltar não muda nada', () => {
      abrir('Carlos');
      tela().querySelector<HTMLButtonElement>('.btn-voltar')!.click();

      expect(service.liberar).not.toHaveBeenCalled();
      expect(service.recusar).not.toHaveBeenCalled();
      expect(cards()).toHaveLength(1);
    });
  });

  describe('confirmar pagamento', () => {
    it('mostra a conferência com cliente, local, itens e total', () => {
      abrir('Mariana');
      const texto = tela().textContent!;
      const itens = Array.from(tela().querySelectorAll('.itens li')).map((li) => li.textContent);

      expect(texto).toContain('Mariana');
      expect(texto).toContain('Balcão');
      expect(itens).toHaveLength(2);
      expect(itens[0]).toContain('2x');
      expect(itens[0]).toContain('Chope');
      expect(itens[0]).toContain('24,00');
      expect(itens[1]).toContain('Batata frita');
      expect(tela().querySelector('.total-destaque strong')!.textContent).toContain('58,00');
      expect(service.confirmarPagamento).not.toHaveBeenCalled();
    });

    it('confirmar muda para paga, avisa e tira a comanda da lista', async () => {
      service.listar.mockResolvedValue([LIBERACAO, ABERTA]);
      abrir('Mariana');

      await tocar('Confirmar pagamento');

      expect(service.confirmarPagamento).toHaveBeenCalledWith('c3d4-c2');
      expect(tela().querySelector('.aviso')!.textContent).toContain('Pagamento confirmado');
      expect(cards().some((card) => card.textContent?.includes('Mariana'))).toBe(false);
    });
  });

  it('comanda aberta mostra o consumo parcial, sem botão de ação', () => {
    abrir('Josias');

    expect(tela().textContent).toContain('Parcial até agora');
    expect(tela().querySelector('.total-destaque strong')!.textContent).toContain('24,00');
    expect(tela().querySelector('.acoes')).toBeNull();
  });

  it('o aviso some sozinho depois de alguns segundos', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      abrir('Carlos');
      botao('Liberar comanda')!.click();
      // Com o relógio falso, é ele quem deixa as promessas em andamento terminarem.
      await vi.advanceTimersByTimeAsync(0);
      expect(tela().querySelector('.aviso')).not.toBeNull();

      await vi.advanceTimersByTimeAsync(3000);

      expect(tela().querySelector('.aviso')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('quando a ação falha', () => {
    it('fica na confirmação, mostra o erro e não mexe na lista', async () => {
      service.liberar.mockRejectedValueOnce(new Error('rede'));
      abrir('Carlos');

      await tocar('Liberar comanda');

      expect(tela().textContent).toContain('Não foi possível atualizar a comanda');
      expect(botao('Liberar comanda')).toBeTruthy();
      expect(tela().querySelector('.aviso')).toBeNull();

      tela().querySelector<HTMLButtonElement>('.btn-voltar')!.click();
      expect(cards()[0].classList).toContain('aguardando_liberacao');
    });

    it('explica quando o banco recusa por falta de permissão', async () => {
      service.confirmarPagamento.mockRejectedValueOnce({
        code: 'P0001',
        message: 'Mudança de status não permitida',
      });
      abrir('Mariana');

      await tocar('Confirmar pagamento');

      expect(tela().textContent).toContain('Sem permissão para esta ação');
    });

    it('aponta o script que falta quando o banco ainda não aceita recusar', async () => {
      service.recusar.mockRejectedValueOnce({
        code: '23514',
        message: 'violates check constraint',
      });
      abrir('Carlos');

      await tocar('Recusar');

      expect(tela().textContent).toContain('supabase/recusar_comanda.sql');
    });

    it('volta para a lista recarregada quando outra pessoa já tinha agido', async () => {
      service.liberar.mockRejectedValueOnce(new ComandaJaMudouError());
      service.listar.mockResolvedValue([PAGAMENTO, ABERTA]);
      abrir('Carlos');

      await tocar('Liberar comanda');

      expect(tela().textContent).toContain('já tinha sido atualizada por outra pessoa');
      expect(tela().querySelector('.aviso')).toBeNull();
      expect(cards().some((card) => card.textContent?.includes('Carlos'))).toBe(false);
      expect(cartoes()[0].classList).toContain('zerado');
    });
  });

  it('sai da conta e volta para o login', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await tocar('Sair');

    expect(authService.sair).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('resume quantas comandas esperam o atendente (subtítulo do desktop)', () => {
    expect(fixture.componentInstance['resumoPendencias']()).toBe(
      '2 esperam por você: 1 para liberar e 1 para receber',
    );
  });

  it('a comanda aberta no detalhe fica marcada na lista', () => {
    abrir('Mariana');

    const marcada = tela().querySelector('.card.selecionada');
    expect(marcada?.textContent).toContain('Mariana');
    expect(marcada?.getAttribute('aria-current')).toBe('true');
  });
});
