import { TestBed } from '@angular/core/testing';
import { AvaliacaoService } from './avaliacao.service';
import { SupabaseService } from './supabase.service';

const PENDENTE = {
  comanda_id: 'c1',
  estabelecimento_id: 'bar-1',
  estabelecimento: "Bar D'Zé",
  pedida_em: '2026-10-23T22:00:00Z',
};

describe('AvaliacaoService', () => {
  let service: AvaliacaoService;
  let rpc: ReturnType<typeof vi.fn>;
  let aoMudarSessao: (evento: string, sessao: unknown) => void;

  beforeEach(() => {
    rpc = vi.fn().mockResolvedValue({ data: [PENDENTE], error: null });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              rpc,
              auth: {
                onAuthStateChange: (fn: typeof aoMudarSessao) => {
                  aoMudarSessao = fn;
                },
              },
            },
          },
        },
      ],
    });
    service = TestBed.inject(AvaliacaoService);
  });

  it('busca o pedido mais recente no banco', async () => {
    await service.verificar();

    expect(rpc).toHaveBeenCalledWith('avaliacao_pendente');
    expect(service.pendente()).toEqual(PENDENTE);
  });

  it('sem pedido, ou se a busca falha, não mostra nada', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await service.verificar();
    expect(service.pendente()).toBeNull();

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'rede' } });
    await service.verificar();
    expect(service.pendente()).toBeNull();
  });

  it('avaliar manda a nota e o comentário limpo, e some', async () => {
    await service.verificar();
    rpc.mockResolvedValueOnce({ data: 'nova', error: null });

    await service.avaliar(5, '  Chope gelado!  ');

    expect(rpc).toHaveBeenLastCalledWith('avaliar', {
      p_comanda: 'c1',
      p_nota: 5,
      p_comentario: 'Chope gelado!',
    });
    expect(service.pendente()).toBeNull();
  });

  it('comentário em branco vai como vazio (null)', async () => {
    await service.verificar();
    rpc.mockResolvedValueOnce({ data: 'nova', error: null });

    await service.avaliar(3, '   ');

    expect(rpc).toHaveBeenLastCalledWith('avaliar', { p_comanda: 'c1', p_nota: 3, p_comentario: null });
  });

  it('se o banco recusa a avaliação, o pedido continua na tela', async () => {
    await service.verificar();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'rede' } });

    await expect(service.avaliar(4, '')).rejects.toBeTruthy();
    expect(service.pendente()).toEqual(PENDENTE);
  });

  it('"Não quero avaliar" avisa o banco', async () => {
    await service.verificar();

    await service.dispensar();

    expect(rpc).toHaveBeenLastCalledWith('dispensar_avaliacao', { p_comanda: 'c1' });
    expect(service.pendente()).toBeNull();
  });

  it('adiar esconde até o próximo acesso, sem avisar o banco', async () => {
    await service.verificar();
    rpc.mockClear();

    service.adiar();
    expect(service.pendente()).toBeNull();
    expect(rpc).not.toHaveBeenCalled();

    // Na mesma visita continua escondido, mesmo conferindo de novo.
    await service.verificar();
    expect(service.pendente()).toBeNull();
  });

  it('confere a cada login e esquece tudo ao sair', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      service.iniciar();

      aoMudarSessao('SIGNED_IN', { user: { id: 'u1' } });
      await vi.advanceTimersByTimeAsync(0);
      expect(service.pendente()).toEqual(PENDENTE);

      service.adiar();
      aoMudarSessao('SIGNED_OUT', null);
      await vi.advanceTimersByTimeAsync(0);
      aoMudarSessao('SIGNED_IN', { user: { id: 'u1' } });
      await vi.advanceTimersByTimeAsync(0);

      // Novo acesso: o pedido adiado volta.
      expect(service.pendente()).toEqual(PENDENTE);
    } finally {
      vi.useRealTimers();
    }
  });
});
