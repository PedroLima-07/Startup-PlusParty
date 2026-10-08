import { TestBed } from '@angular/core/testing';
import { AuthService, PerfilAtual } from './auth.service';
import { SupabaseService } from './supabase.service';

const ATENDENTE: PerfilAtual = {
  nome: 'Ana',
  tipo: 'funcionario',
  estabelecimento: { nome: "Bar D'Zé" },
};

describe('AuthService — sessão e perfil', () => {
  let service: AuthService;
  let usuarioId: string | null;
  let single: ReturnType<typeof vi.fn>;
  let filtros: [string, string][];
  let signOut: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    usuarioId = 'u1';
    filtros = [];
    single = vi.fn(() => Promise.resolve({ data: ATENDENTE, error: null }));
    signOut = vi.fn(() => Promise.resolve({ error: null }));

    const consulta = {
      select: () => consulta,
      eq: (coluna: string, valor: string) => {
        filtros.push([coluna, valor]);
        return consulta;
      },
      single,
    };

    const client = {
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: usuarioId ? { user: { id: usuarioId } } : null } }),
        signOut,
      },
      from: () => consulta,
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client } }],
    });
    service = TestBed.inject(AuthService);
  });

  it('sem sessão não há usuário nem perfil, e o banco não é consultado', async () => {
    usuarioId = null;

    expect(await service.usuarioAtual()).toBeNull();
    expect(await service.perfilAtual()).toBeNull();
    expect(await service.buscarTipoAtual()).toBeNull();
    expect(single).not.toHaveBeenCalled();
  });

  it('busca o perfil do usuário da sessão', async () => {
    expect(await service.perfilAtual()).toEqual(ATENDENTE);
    expect(filtros).toEqual([['id', 'u1']]);
  });

  it('consulta o banco uma vez só, mesmo com várias telas pedindo', async () => {
    const [tipo, nome, bar] = await Promise.all([
      service.buscarTipoAtual(),
      service.buscarNomeAtual(),
      service.buscarNomeEstabelecimentoAtual(),
    ]);
    await service.buscarTipoAtual();

    expect([tipo, nome, bar]).toEqual(['funcionario', 'Ana', "Bar D'Zé"]);
    expect(single).toHaveBeenCalledTimes(1);
  });

  it('busca de novo depois de sair e entrar', async () => {
    await service.perfilAtual();
    await service.sair();
    await service.perfilAtual();

    expect(signOut).toHaveBeenCalled();
    expect(single).toHaveBeenCalledTimes(2);
  });

  it('busca de novo quando a sessão passa a ser de outro usuário', async () => {
    await service.perfilAtual();
    usuarioId = 'u2';
    await service.perfilAtual();

    expect(filtros).toEqual([
      ['id', 'u1'],
      ['id', 'u2'],
    ]);
  });

  it('não guarda uma falha: a chamada seguinte tenta de novo', async () => {
    const erro = { message: 'sem rede' };
    single.mockResolvedValueOnce({ data: null, error: erro });

    await expect(service.perfilAtual()).rejects.toBe(erro);
    expect(await service.perfilAtual()).toEqual(ATENDENTE);
  });
});
