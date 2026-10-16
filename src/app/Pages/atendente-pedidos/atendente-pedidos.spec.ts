import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PedidoSetor } from '../../models';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { ComandasAtendenteService } from '../../services/comandas-atendente.service';
import { PedidosAtendenteService } from '../../services/pedidos-atendente.service';
import { AtendentePedidos } from './atendente-pedidos';

function pedido(dados: Partial<PedidoSetor> & Pick<PedidoSetor, 'id'>): PedidoSetor {
  return {
    pedido_id: dados.id,
    setor: 'bar',
    status: 'novo',
    mesa: '12',
    cliente: 'Carlos',
    criado_em: '2026-09-24T22:00:00Z',
    itens_ids: [`${dados.id}-item`],
    itens: [{ nome: 'Chope', quantidade: 1 }],
    ...dados,
  };
}

describe('AtendentePedidos', () => {
  let fixture: ComponentFixture<AtendentePedidos>;
  let service: {
    listarPendentes: ReturnType<typeof vi.fn>;
    atualizarStatus: ReturnType<typeof vi.fn>;
  };

  function textoDaTela(): string {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** No celular o botão cobre o cartão inteiro: tocar no cartão é tocar nele. */
  function clicarNoCard(texto: string): void {
    const cards = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.card-pedido'),
    );
    cards.find((card) => card.textContent?.includes(texto))!.querySelector<HTMLButtonElement>('.card-acao')!.click();
    fixture.detectChanges();
  }

  function tituloDoModal(): string | null {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.modal-content h3')?.textContent ?? null;
  }

  function seloDoCard(texto: string): string | null {
    fixture.detectChanges();
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.card-pedido'));
    return cards.find((card) => card.textContent?.includes(texto))?.querySelector('.badge')?.textContent?.trim() ?? null;
  }

  async function confirmarModal(): Promise<void> {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.btn-confirmar')!.click();
    await fixture.whenStable();
  }

  let supabase: { escutarMudancas: ReturnType<typeof vi.fn> };
  let avisarMudanca: () => void;
  let comandasService: { pendencias: WritableSignal<number>; atualizarPendencias: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    supabase = {
      // A navegação também escuta (a tabela de comandas, para o contador);
      // aqui interessa o aviso que a própria tela de pedidos pediu.
      escutarMudancas: vi.fn((tabelas: { tabela: string }[], aoMudar: () => void) => {
        if (tabelas.some(({ tabela }) => tabela === 'pedido_itens')) avisarMudanca = aoMudar;
        return () => {};
      }),
    };
    comandasService = {
      pendencias: signal(0),
      atualizarPendencias: vi.fn().mockResolvedValue(undefined),
    };
    service = {
      listarPendentes: vi.fn().mockResolvedValue([
        pedido({ id: 'p1', setor: 'bar', status: 'novo', mesa: '12' }),
        pedido({ id: 'p2', setor: 'bar', status: 'em_andamento', mesa: null, cliente: 'Mariana' }),
        pedido({ id: 'p3', setor: 'cozinha', mesa: '4', cliente: 'Roberto' }),
      ]),
      atualizarStatus: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AtendentePedidos],
      providers: [
        provideRouter([]),
        { provide: PedidosAtendenteService, useValue: service },
        { provide: ComandasAtendenteService, useValue: comandasService },
        {
          provide: AuthService,
          useValue: {
            sair: vi.fn(),
            perfilAtual: vi.fn().mockResolvedValue({ estabelecimento: { id: 'bar1', nome: 'Bar' } }),
          },
        },
        { provide: SupabaseService, useValue: supabase },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AtendentePedidos);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('mostra só os pedidos do bar na aba inicial, com balcão quando não há mesa', () => {
    const texto = textoDaTela();
    expect(texto).toContain('Mesa 12');
    expect(texto).toContain('Balcão');
    expect(texto).not.toContain('Roberto');
  });

  it('troca para os pedidos da cozinha', () => {
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tab-btn')[1].click();
    const texto = textoDaTela();
    expect(texto).toContain('Roberto');
    expect(texto).not.toContain('Carlos');
  });

  it('pedido novo vira "em andamento" ao confirmar', async () => {
    clicarNoCard('Mesa 12');
    expect(tituloDoModal()).toContain('Começar a preparar');

    await confirmarModal();

    expect(service.atualizarStatus).toHaveBeenCalledWith(['p1-item'], 'em_andamento');
    expect(seloDoCard('Mesa 12')).toBe('Em andamento');
    expect(tituloDoModal()).toBeNull();
  });

  it('pedido em andamento sai da lista ao marcar como pronto', async () => {
    clicarNoCard('Mariana');
    expect(tituloDoModal()).toContain('Marcar como pronto');

    await confirmarModal();

    expect(service.atualizarStatus).toHaveBeenCalledWith(['p2-item'], 'pronto');
    expect(textoDaTela()).not.toContain('Mariana');
  });

  it('mantém o pedido e mostra erro quando a atualização falha', async () => {
    service.atualizarStatus.mockRejectedValueOnce(new Error('RLS'));
    clicarNoCard('Mariana');

    await confirmarModal();

    const texto = textoDaTela();
    expect(texto).toContain('Mariana');
    expect(texto).toContain('Não foi possível atualizar o pedido');
  });

  it('mostra erro quando não consegue carregar os pedidos', async () => {
    service.listarPendentes.mockRejectedValueOnce(new Error('rede'));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.btn-refresh')!.click();
    await fixture.whenStable();

    expect(textoDaTela()).toContain('Não foi possível carregar os pedidos');
  });

  it('mostra o contador de comandas pendentes na navegação, só quando há pendências', () => {
    const contador = () => {
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).querySelector('app-nav-atendente .contador');
    };

    expect(comandasService.atualizarPendencias).toHaveBeenCalledWith('bar1');
    expect(contador()).toBeNull();

    comandasService.pendencias.set(3);
    expect(contador()!.textContent).toContain('3');
  });

  it('mostra pedido novo sozinho quando o banco avisa uma mudança', async () => {
    service.listarPendentes.mockResolvedValueOnce([
      pedido({ id: 'p9', setor: 'bar', cliente: 'Josias' }),
    ]);

    avisarMudanca();
    await fixture.whenStable();

    expect(supabase.escutarMudancas).toHaveBeenCalledWith([{ tabela: 'pedido_itens' }], expect.any(Function));
    expect(textoDaTela()).toContain('Josias');
  });

  describe('no desktop', () => {
    let desktop: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      desktop = vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      vi.stubGlobal('matchMedia', desktop);
      // Recria a tela já com a largura de desktop.
      fixture.destroy();
      fixture = TestBed.createComponent(AtendentePedidos);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    afterEach(() => vi.unstubAllGlobals());

    it('separa os pedidos em Novos e Em preparo', () => {
      const colunas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.coluna')).map((coluna) => ({
        titulo: coluna.querySelector('.coluna-titulo')?.textContent?.replace(/\s+/g, ' ').trim(),
        cartoes: Array.from(coluna.querySelectorAll('.mesa')).map((m) => m.textContent),
      }));

      expect(colunas).toEqual([
        { titulo: 'Novos 1', cartoes: ['Mesa 12'] },
        { titulo: 'Em preparo 1', cartoes: ['Balcão'] },
      ]);
    });

    it('o botão do cartão já age, sem a janela de confirmação', async () => {
      clicarNoCard('Mesa 12');
      await fixture.whenStable();

      expect(tituloDoModal()).toBeNull();
      expect(service.atualizarStatus).toHaveBeenCalledWith(['p1-item'], 'em_andamento');
    });

    it('marca em laranja o pedido esperando há 15 minutos ou mais', () => {
      const espera = (fixture.nativeElement as HTMLElement).querySelector('.espera');

      // Os pedidos do teste são de 2026-09-24: esperam há muito tempo.
      expect(espera?.classList).toContain('atrasado');
      expect(espera?.textContent).toMatch(/^há \d+ min$/);
    });
  });
});
