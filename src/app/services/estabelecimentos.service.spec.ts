import { TestBed } from '@angular/core/testing';
import { Estabelecimento } from '../models';
import { EstabelecimentosService } from './estabelecimentos.service';
import { SupabaseService } from './supabase.service';

function bar(id: string, nome: string): Estabelecimento {
  return {
    id,
    nome,
    descricao: null,
    endereco: null,
    capacidade: 100,
    avaliacao: 4.5,
    criado_em: '2026-01-01',
    foto_url: null,
    sobre: null,
    tags: [],
    horario_abre: null,
    horario_fecha: null,
    dias_abertos: [],
  };
}

const NEON = bar('b1', 'Neon Club');
const VINIL = bar('b2', 'Vinil Bar');
const CINCO_MINUTOS = 5 * 60 * 1000;

describe('EstabelecimentosService — lista guardada', () => {
  let service: EstabelecimentosService;
  let buscarLista: ReturnType<typeof vi.fn>;
  let buscarUm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    buscarLista = vi.fn(() => Promise.resolve({ data: [NEON, VINIL], error: null }));
    buscarUm = vi.fn(() => Promise.resolve({ data: VINIL, error: null }));

    const client = {
      from: () => ({
        select: () => ({
          order: buscarLista,
          eq: () => ({ single: buscarUm }),
        }),
      }),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client } }],
    });
    service = TestBed.inject(EstabelecimentosService);
  });

  afterEach(() => vi.useRealTimers());

  it('busca a lista uma vez só enquanto ela vale', async () => {
    const [primeira, segunda] = await Promise.all([service.listar(), service.listar()]);
    const terceira = await service.listar();

    expect(primeira).toEqual([NEON, VINIL]);
    expect(segunda).toBe(primeira);
    expect(terceira).toBe(primeira);
    expect(buscarLista).toHaveBeenCalledTimes(1);
  });

  it('busca de novo depois que a validade passa', async () => {
    await service.listar();
    vi.advanceTimersByTime(CINCO_MINUTOS + 1);
    await service.listar();

    expect(buscarLista).toHaveBeenCalledTimes(2);
  });

  it('acha o bar na lista guardada, sem consultar o banco', async () => {
    await service.listar();

    expect(await service.buscarPorId('b2')).toBe(VINIL);
    expect(buscarUm).not.toHaveBeenCalled();
  });

  it('sem lista guardada, busca só o bar pedido', async () => {
    expect(await service.buscarPorId('b2')).toBe(VINIL);
    expect(buscarUm).toHaveBeenCalledTimes(1);
    expect(buscarLista).not.toHaveBeenCalled();
  });

  it('com a lista vencida, busca só o bar pedido', async () => {
    await service.listar();
    vi.advanceTimersByTime(CINCO_MINUTOS + 1);

    await service.buscarPorId('b2');

    expect(buscarUm).toHaveBeenCalledTimes(1);
  });

  it('não guarda uma falha: a chamada seguinte tenta de novo', async () => {
    const erro = { message: 'sem rede' };
    buscarLista.mockResolvedValueOnce({ data: null, error: erro });

    await expect(service.listar()).rejects.toBe(erro);
    expect(await service.listar()).toEqual([NEON, VINIL]);
  });
});
