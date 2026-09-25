import { TestBed } from '@angular/core/testing';
import { ComandasAtendenteService, LinhaComandaPendente } from './comandas-atendente.service';
import { SupabaseService } from './supabase.service';

function linha(dados: Partial<LinhaComandaPendente> = {}): LinhaComandaPendente {
  return {
    id: 'c1',
    status: 'aguardando_pagamento',
    mesa: '12',
    criada_em: '2026-09-25T22:00:00Z',
    cliente: { nome: 'Pedro' },
    pedidos: [],
    ...dados,
  };
}

describe('ComandasAtendenteService', () => {
  let service: ComandasAtendenteService;
  let update: ReturnType<typeof vi.fn>;
  let filtros: [string, string][];

  beforeEach(() => {
    filtros = [];
    const consulta = {
      eq: vi.fn((coluna: string, valor: string) => {
        filtros.push([coluna, valor]);
        return filtros.length === 2 ? Promise.resolve({ error: null }) : consulta;
      }),
    };
    update = vi.fn(() => consulta);

    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { from: () => ({ update }) } } },
      ],
    });
    service = TestBed.inject(ComandasAtendenteService);
  });

  describe('paraComanda', () => {
    it('soma quantidade x preço de todos os pedidos da comanda', () => {
      const comanda = service.paraComanda(
        linha({
          pedidos: [
            { pedido_itens: [{ quantidade: 2, preco_unitario: 12 }] },
            { pedido_itens: [{ quantidade: 1, preco_unitario: 34 }, { quantidade: 3, preco_unitario: 1.5 }] },
          ],
        }),
      );

      expect(comanda.total).toBe(62.5);
    });

    it('total zero quando a comanda não tem pedidos', () => {
      expect(service.paraComanda(linha({ pedidos: [] })).total).toBe(0);
    });

    it('usa "Cliente" quando o nome não vem ou está em branco', () => {
      expect(service.paraComanda(linha({ cliente: null })).cliente).toBe('Cliente');
      expect(service.paraComanda(linha({ cliente: { nome: '  ' } })).cliente).toBe('Cliente');
      expect(service.paraComanda(linha({ cliente: { nome: 'Nathan ' } })).cliente).toBe('Nathan');
    });
  });

  it('liberar só muda comandas que ainda estão aguardando liberação', async () => {
    await service.liberar('c1');

    expect(update).toHaveBeenCalledWith({ status: 'aberta' });
    expect(filtros).toEqual([
      ['id', 'c1'],
      ['status', 'aguardando_liberacao'],
    ]);
  });

  it('confirmarPagamento só muda comandas que ainda estão aguardando pagamento', async () => {
    await service.confirmarPagamento('c1');

    expect(update).toHaveBeenCalledWith({ status: 'paga' });
    expect(filtros).toEqual([
      ['id', 'c1'],
      ['status', 'aguardando_pagamento'],
    ]);
  });
});
