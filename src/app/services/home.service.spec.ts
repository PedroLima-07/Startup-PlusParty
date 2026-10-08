import { TestBed } from '@angular/core/testing';
import { Estabelecimento } from '../models';
import { EstabelecimentosService } from './estabelecimentos.service';
import { HomeService } from './home.service';
import { SupabaseService } from './supabase.service';

function bar(nome: string, avaliacao: number | null): Estabelecimento {
  return {
    id: nome,
    nome,
    descricao: null,
    endereco: null,
    capacidade: 100,
    avaliacao,
    criado_em: '2026-01-01',
    foto_url: null,
    sobre: null,
    tags: [],
    horario_abre: null,
    horario_fecha: null,
    dias_abertos: [],
  };
}

describe('HomeService', () => {
  let service: HomeService;
  let rpc: ReturnType<typeof vi.fn>;
  let emOrdemAlfabetica: Estabelecimento[];

  beforeEach(() => {
    emOrdemAlfabetica = [bar('Bar', 4.5), bar('Neon', 5), bar('Novo', null), bar('Vinil', 4.2)];
    rpc = vi.fn(() =>
      Promise.resolve({
        data: [{ estabelecimento_id: 'Neon', comandas_abertas: 60 }],
        error: null,
      }),
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { rpc } } },
        {
          provide: EstabelecimentosService,
          useValue: { listar: () => Promise.resolve(emOrdemAlfabetica) },
        },
      ],
    });
    service = TestBed.inject(HomeService);
  });

  it('ordena da maior nota para a menor, com os sem nota primeiro', async () => {
    const nomes = (await service.listarEstabelecimentos()).map((e) => e.nome);

    expect(nomes).toEqual(['Novo', 'Neon', 'Bar', 'Vinil']);
  });

  it('não mexe na lista compartilhada com as outras telas', async () => {
    await service.listarEstabelecimentos();

    expect(emOrdemAlfabetica.map((e) => e.nome)).toEqual(['Bar', 'Neon', 'Novo', 'Vinil']);
  });

  it('conta as comandas abertas de todos os bares numa chamada só', async () => {
    const abertas = await service.contarComandasAbertasPorBar();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('lotacao_estabelecimentos');
    expect(abertas.get('Neon')).toBe(60);
    expect(abertas.get('Vinil')).toBeUndefined();
  });

  it('marca como quente a partir de metade da capacidade', () => {
    expect(service.calcularLotacao(49, 100)).toBe('normal');
    expect(service.calcularLotacao(50, 100)).toBe('quente');
    expect(service.calcularLotacao(50, null)).toBe('normal');
  });
});
