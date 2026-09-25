import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PedidoSetor } from '../../models';
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

  function clicarNoCard(texto: string): void {
    const cards = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.card-pedido'),
    );
    cards.find((card) => card.textContent?.includes(texto))!.click();
    fixture.detectChanges();
  }

  async function confirmarModal(): Promise<void> {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.btn-confirmar')!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
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
      providers: [provideRouter([]), { provide: PedidosAtendenteService, useValue: service }],
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
    expect(textoDaTela()).toContain('Começar a preparar');

    await confirmarModal();

    expect(service.atualizarStatus).toHaveBeenCalledWith(['p1-item'], 'em_andamento');
    expect(textoDaTela()).not.toContain('Novo');
  });

  it('pedido em andamento sai da lista ao marcar como pronto', async () => {
    clicarNoCard('Mariana');
    expect(textoDaTela()).toContain('Marcar como pronto');

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
});
