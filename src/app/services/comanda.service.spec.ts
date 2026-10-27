import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ComandaEmOutroLugarError, ComandaService, ContaPendenteError } from './comanda.service';
import { SupabaseService } from './supabase.service';

/** Comanda ativa como a consulta de buscarComandaAtiva devolve. */
function ativa(dados: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    estabelecimento_id: 'bar-1',
    mesa: '4',
    status: 'aberta',
    fechada_em: null,
    estabelecimento: { nome: "Bar D'Zé" },
    pedidos: [
      { pedido_itens: [{ quantidade: 3, preco_unitario: 12 }] },
      { pedido_itens: [{ quantidade: 1, preco_unitario: 34 }] },
    ],
    ...dados,
  };
}

describe('ComandaService', () => {
  let service: ComandaService;
  /** Respostas das consultas, na ordem em que o serviço as faz. */
  let respostas: { data?: unknown; error: unknown }[];
  /** Cada passo de cada consulta: ['from', 'comandas'], ['update', {...}], ... */
  let passos: unknown[][];

  beforeEach(() => {
    respostas = [];
    passos = [];

    const novaConsulta = () => {
      const resposta = respostas.shift() ?? { data: null, error: null };
      const consulta: Record<string, unknown> = {
        then: (ok: (valor: unknown) => unknown, falha?: (erro: unknown) => unknown) =>
          Promise.resolve(resposta).then(ok, falha),
      };
      for (const metodo of ['select', 'insert', 'update', 'eq', 'in', 'order', 'limit', 'maybeSingle', 'single']) {
        consulta[metodo] = (...args: unknown[]) => {
          passos.push([metodo, ...args]);
          return consulta;
        };
      }
      return consulta;
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: (tabela: string) => {
                passos.push(['from', tabela]);
                return novaConsulta();
              },
            },
          },
        },
        { provide: AuthService, useValue: { usuarioAtual: async () => ({ id: 'u1' }) } },
      ],
    });
    service = TestBed.inject(ComandaService);
  });

  describe('buscarComandaAtiva', () => {
    it('procura só os status ativos do cliente e soma o consumo', async () => {
      respostas.push({ data: ativa(), error: null });

      const resultado = await service.buscarComandaAtiva();

      expect(passos).toContainEqual(['eq', 'usuario_id', 'u1']);
      expect(passos).toContainEqual(['in', 'status', ['aguardando_liberacao', 'aberta', 'aguardando_pagamento']]);
      expect(resultado).toMatchObject({ id: 'c1', estabelecimento: "Bar D'Zé", total: 70 });
    });

    it('devolve null quando não há comanda ativa', async () => {
      respostas.push({ data: null, error: null });
      expect(await service.buscarComandaAtiva()).toBeNull();
    });
  });

  describe('abrirComanda', () => {
    it('cria a comanda quando o cliente não tem nenhuma ativa', async () => {
      respostas.push({ data: null, error: null }, { data: { id: 'nova' }, error: null });

      expect(await service.abrirComanda('bar-1', '12')).toEqual({ id: 'nova' });
      expect(passos).toContainEqual([
        'insert',
        { usuario_id: 'u1', estabelecimento_id: 'bar-1', mesa: '12', status: 'aguardando_liberacao' },
      ]);
    });

    it('devolve a comanda já aberta no mesmo bar, sem criar outra', async () => {
      respostas.push({ data: ativa(), error: null });

      expect(await service.abrirComanda('bar-1', '12')).toEqual({ id: 'c1' });
      expect(passos.some((passo) => passo[0] === 'insert')).toBe(false);
    });

    it('recusa com a conta pendente quando a comanda ativa espera pagamento', async () => {
      respostas.push({
        data: ativa({ status: 'aguardando_pagamento', fechada_em: '2026-10-23T21:52:00Z' }),
        error: null,
      });

      const erro = await service.abrirComanda('bar-2', null).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(ContaPendenteError);
      expect((erro as ContaPendenteError).conta).toEqual({
        id: 'c1',
        estabelecimento: "Bar D'Zé",
        mesa: '4',
        fechada_em: '2026-10-23T21:52:00Z',
        total: 70,
      });
    });

    it('recusa quando a comanda ativa é em outro bar', async () => {
      respostas.push({ data: ativa(), error: null });

      await expect(service.abrirComanda('bar-2', null)).rejects.toBeInstanceOf(ComandaEmOutroLugarError);
    });

    it('outra aba abriu no mesmo instante: usa a comanda que ficou', async () => {
      respostas.push(
        { data: null, error: null },
        { data: null, error: { code: '23505', message: 'duplicate key' } },
        { data: ativa({ id: 'da-outra-aba' }), error: null },
      );

      expect(await service.abrirComanda('bar-1', '12')).toEqual({ id: 'da-outra-aba' });
    });
  });

  it('cancelar muda o status para cancelada só se ainda espera liberação', async () => {
    respostas.push({ data: [{ id: 'c1' }], error: null });

    expect(await service.cancelarSolicitacao('c1')).toBe(true);
    expect(passos).toContainEqual(['update', { status: 'cancelada' }]);
    expect(passos).toContainEqual(['eq', 'status', 'aguardando_liberacao']);
  });

  it('fechar a conta não manda a hora: quem grava é o banco', async () => {
    respostas.push({ data: null, error: null });

    await service.fecharConta('c1');

    expect(passos).toContainEqual(['update', { status: 'aguardando_pagamento' }]);
  });
});
