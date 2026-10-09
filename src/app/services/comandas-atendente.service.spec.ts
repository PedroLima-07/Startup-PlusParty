import { TestBed } from '@angular/core/testing';
import { ComandaAtendente } from '../models';
import {
  ComandaJaMudouError,
  ComandasAtendenteService,
  LinhaComandaAtendente,
} from './comandas-atendente.service';
import { SupabaseService } from './supabase.service';

function linha(dados: Partial<LinhaComandaAtendente> = {}): LinhaComandaAtendente {
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

function comanda(
  dados: Partial<ComandaAtendente> & Pick<ComandaAtendente, 'id'>,
): ComandaAtendente {
  return {
    status: 'aberta',
    mesa: null,
    cliente: 'Cliente',
    criada_em: '2026-09-25T22:00:00Z',
    total: 0,
    itens: [],
    ...dados,
  };
}

describe('ComandasAtendenteService', () => {
  let service: ComandasAtendenteService;
  /** O que a próxima consulta ao Supabase devolve. */
  let resposta: { data?: unknown; count?: number | null; error: unknown };
  /** Cada passo da consulta montada, na ordem: ['eq', 'id', 'c1'], ... */
  let passos: unknown[][];

  beforeEach(() => {
    resposta = { data: [], error: null };
    passos = [];

    // Imita o construtor de consultas: cada método anota a chamada e devolve
    // a própria consulta, que resolve com `resposta` ao ser aguardada.
    const consulta: Record<string, unknown> = {
      then: (ok: (valor: unknown) => unknown, falha?: (erro: unknown) => unknown) =>
        Promise.resolve(resposta).then(ok, falha),
    };
    for (const metodo of ['select', 'update', 'eq', 'in', 'order']) {
      consulta[metodo] = (...args: unknown[]) => {
        passos.push([metodo, ...args]);
        return consulta;
      };
    }

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: (tabela: string) => {
                passos.push(['from', tabela]);
                return consulta;
              },
            },
          },
        },
      ],
    });
    service = TestBed.inject(ComandasAtendenteService);
  });

  describe('paraComanda', () => {
    it('soma quantidade x preço de todos os pedidos da comanda', () => {
      const resultado = service.paraComanda(
        linha({
          pedidos: [
            { pedido_itens: [{ quantidade: 2, preco_unitario: 12, item: { nome: 'Chope' } }] },
            {
              pedido_itens: [
                { quantidade: 1, preco_unitario: 34, item: { nome: 'Batata' } },
                { quantidade: 3, preco_unitario: 1.5, item: { nome: 'Água' } },
              ],
            },
          ],
        }),
      );

      expect(resultado.total).toBe(62.5);
    });

    it('junta o mesmo item pedido em rodadas diferentes numa linha só', () => {
      const resultado = service.paraComanda(
        linha({
          pedidos: [
            { pedido_itens: [{ quantidade: 2, preco_unitario: 12, item: { nome: 'Chope' } }] },
            { pedido_itens: [{ quantidade: 1, preco_unitario: 12, item: { nome: 'Chope' } }] },
          ],
        }),
      );

      expect(resultado.itens).toEqual([{ nome: 'Chope', quantidade: 3, preco_unitario: 12 }]);
      expect(resultado.total).toBe(36);
    });

    it('mantém separado o item cujo preço mudou entre um pedido e outro', () => {
      const resultado = service.paraComanda(
        linha({
          pedidos: [
            { pedido_itens: [{ quantidade: 1, preco_unitario: 12, item: { nome: 'Chope' } }] },
            { pedido_itens: [{ quantidade: 1, preco_unitario: 14, item: { nome: 'Chope' } }] },
          ],
        }),
      );

      expect(resultado.itens).toHaveLength(2);
      expect(resultado.total).toBe(26);
    });

    it('total zero e sem itens quando a comanda não tem pedidos', () => {
      const resultado = service.paraComanda(linha({ pedidos: [] }));

      expect(resultado.total).toBe(0);
      expect(resultado.itens).toEqual([]);
    });

    it('usa "Cliente" quando o nome não vem ou está em branco', () => {
      expect(service.paraComanda(linha({ cliente: null })).cliente).toBe('Cliente');
      expect(service.paraComanda(linha({ cliente: { nome: '  ' } })).cliente).toBe('Cliente');
      expect(service.paraComanda(linha({ cliente: { nome: 'Nathan ' } })).cliente).toBe('Nathan');
    });
  });

  it('ordena: liberação, depois pagamento, depois abertas; mais antigas primeiro em cada grupo', () => {
    const ordenadas = service.ordenar([
      comanda({ id: 'aberta', status: 'aberta', criada_em: '2026-09-25T20:00:00Z' }),
      comanda({
        id: 'pagamento',
        status: 'aguardando_pagamento',
        criada_em: '2026-09-25T21:00:00Z',
      }),
      comanda({
        id: 'liberacao-nova',
        status: 'aguardando_liberacao',
        criada_em: '2026-09-25T23:00:00Z',
      }),
      comanda({
        id: 'liberacao-antiga',
        status: 'aguardando_liberacao',
        criada_em: '2026-09-25T22:00:00Z',
      }),
    ]);

    expect(ordenadas.map((c) => c.id)).toEqual([
      'liberacao-antiga',
      'liberacao-nova',
      'pagamento',
      'aberta',
    ]);
  });

  describe('listar', () => {
    it('busca só as comandas do bar que não foram pagas nem recusadas', async () => {
      await service.listar('bar1');

      expect(passos).toContainEqual(['from', 'comandas']);
      expect(passos).toContainEqual(['eq', 'estabelecimento_id', 'bar1']);
      expect(passos).toContainEqual([
        'in',
        'status',
        ['aguardando_liberacao', 'aguardando_pagamento', 'aberta'],
      ]);
    });

    it('devolve as pendências no topo e atualiza o contador', async () => {
      resposta = {
        data: [
          linha({ id: 'a', status: 'aberta' }),
          linha({ id: 'p', status: 'aguardando_pagamento' }),
          linha({ id: 'l', status: 'aguardando_liberacao' }),
        ],
        error: null,
      };

      const comandas = await service.listar('bar1');

      expect(comandas.map((c) => c.id)).toEqual(['l', 'p', 'a']);
      expect(service.pendencias()).toBe(2);
    });

    it('repassa o erro do banco', async () => {
      resposta = { data: null, error: { message: 'falhou' } };

      await expect(service.listar('bar1')).rejects.toEqual({ message: 'falhou' });
    });
  });

  it('atualizarPendencias conta liberações e pagamentos do bar sem trazer as comandas', async () => {
    resposta = { count: 3, error: null };

    await service.atualizarPendencias('bar1');

    expect(passos).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(passos).toContainEqual(['eq', 'estabelecimento_id', 'bar1']);
    expect(passos).toContainEqual([
      'in',
      'status',
      ['aguardando_liberacao', 'aguardando_pagamento'],
    ]);
    expect(service.pendencias()).toBe(3);
  });

  describe('mudanças de status', () => {
    beforeEach(() => {
      resposta = { data: [{ id: 'c1' }], error: null };
    });

    it('liberar só muda comandas que ainda estão aguardando liberação', async () => {
      await service.liberar('c1');

      expect(passos).toContainEqual(['update', { status: 'aberta' }]);
      expect(passos).toContainEqual(['eq', 'id', 'c1']);
      expect(passos).toContainEqual(['eq', 'status', 'aguardando_liberacao']);
    });

    it('recusar só muda comandas que ainda estão aguardando liberação', async () => {
      await service.recusar('c1');

      expect(passos).toContainEqual(['update', { status: 'recusada' }]);
      expect(passos).toContainEqual(['eq', 'status', 'aguardando_liberacao']);
    });

    it('confirmarPagamento só muda comandas que ainda estão aguardando pagamento', async () => {
      await service.confirmarPagamento('c1');

      expect(passos).toContainEqual(['update', { status: 'paga' }]);
      expect(passos).toContainEqual(['eq', 'status', 'aguardando_pagamento']);
    });

    it('avisa quando a comanda já não estava no status esperado', async () => {
      resposta = { data: [], error: null };

      await expect(service.liberar('c1')).rejects.toBeInstanceOf(ComandaJaMudouError);
    });

    it('repassa o erro do banco', async () => {
      resposta = { data: null, error: { code: 'P0001' } };

      await expect(service.recusar('c1')).rejects.toEqual({ code: 'P0001' });
    });
  });
});
