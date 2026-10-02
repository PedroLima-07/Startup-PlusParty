import { TestBed } from '@angular/core/testing';
import { ItemCarrinho } from '../models';
import { PedidoService } from './pedido.service';
import { SupabaseService } from './supabase.service';

function itemCarrinho(id: string, quantidade: number, preco: number): ItemCarrinho {
  return {
    item: {
      id,
      estabelecimento_id: 'e1',
      nome: 'Chope',
      categoria: 'Cervejas',
      preco,
      setor: 'bar',
      disponivel: true,
    },
    quantidade,
  };
}

describe('PedidoService', () => {
  let service: PedidoService;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpc = vi.fn(() => Promise.resolve({ data: 'p1', error: null }));

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    service = TestBed.inject(PedidoService);
  });

  it('envia à RPC só item_id e quantidade, nunca o preço', async () => {
    await service.criarPedido('c1', [itemCarrinho('i1', 2, 12), itemCarrinho('i2', 1, 34)]);

    expect(rpc).toHaveBeenCalledWith('criar_pedido', {
      p_comanda_id: 'c1',
      p_itens: [
        { item_id: 'i1', quantidade: 2 },
        { item_id: 'i2', quantidade: 1 },
      ],
    });

    const { p_itens } = rpc.mock.calls[0][1];
    for (const item of p_itens) {
      expect(Object.keys(item).sort()).toEqual(['item_id', 'quantidade']);
    }
  });

  it('devolve o id do pedido que a RPC retornou', async () => {
    await expect(service.criarPedido('c1', [itemCarrinho('i1', 1, 12)])).resolves.toBe('p1');
  });

  it('propaga o erro da RPC para quem chamou', async () => {
    const erro = { message: 'Comanda não está aberta para este usuário.' };
    rpc.mockResolvedValueOnce({ data: null, error: erro });

    await expect(service.criarPedido('c1', [itemCarrinho('i1', 1, 12)])).rejects.toBe(erro);
  });
});
