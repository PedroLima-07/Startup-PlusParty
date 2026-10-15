import { TestBed } from '@angular/core/testing';
import { TipoPerfil } from '../models';
import { AuthService } from './auth.service';
import { EquipeService } from './equipe.service';
import { SupabaseService } from './supabase.service';

/**
 * Consulta de mentira: guarda a tabela e os filtros usados e devolve `resposta`
 * tanto para quem espera a consulta direto quanto para quem termina em
 * maybeSingle().
 */
function criarBanco() {
  const chamadas: { tabela: string; filtros: [string, unknown][]; inserido?: unknown; apagou?: boolean }[] = [];
  let resposta: { data: unknown; error: unknown } = { data: null, error: null };

  const from = (tabela: string) => {
    const chamada: (typeof chamadas)[number] = { tabela, filtros: [] };
    chamadas.push(chamada);

    const consulta = {
      select: () => consulta,
      order: () => consulta,
      limit: () => consulta,
      delete: () => {
        chamada.apagou = true;
        return consulta;
      },
      insert: (linha: unknown) => {
        chamada.inserido = linha;
        return Promise.resolve(resposta);
      },
      eq: (coluna: string, valor: unknown) => {
        chamada.filtros.push([coluna, valor]);
        return consulta;
      },
      is: (coluna: string, valor: unknown) => {
        chamada.filtros.push([`${coluna} is`, valor]);
        return consulta;
      },
      gt: (coluna: string) => {
        chamada.filtros.push([`${coluna} >`, 'agora']);
        return consulta;
      },
      maybeSingle: () => Promise.resolve(resposta),
      then: (resolver: (valor: typeof resposta) => unknown) => Promise.resolve(resposta).then(resolver),
    };
    return consulta;
  };

  const rpc = vi.fn((): Promise<{ data: unknown; error: unknown }> =>
    Promise.resolve({ data: null, error: null }),
  );

  return {
    client: { from, rpc },
    chamadas,
    rpc,
    responderCom: (data: unknown, error: unknown = null) => {
      resposta = { data, error };
    },
  };
}

describe('EquipeService', () => {
  let service: EquipeService;
  let banco: ReturnType<typeof criarBanco>;
  let tipo: TipoPerfil | null;
  let logado: boolean;

  beforeEach(() => {
    banco = criarBanco();
    tipo = 'cliente';
    logado = true;

    const authService = {
      usuarioAtual: () => Promise.resolve(logado ? { id: 'u1' } : null),
      buscarTipoAtual: () => Promise.resolve(logado ? tipo : null),
      perfilAtual: () =>
        Promise.resolve(
          logado ? { nome: 'Gil', tipo, estabelecimento: tipo === 'cliente' ? null : { id: 'b1', nome: 'Bar' } } : null,
        ),
      telaInicial: (t: TipoPerfil | null) =>
        t === 'gerente' ? '/gerente/movimento' : t === 'funcionario' ? '/atendente/pedidos' : '/cliente/home',
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: banco.client } },
        { provide: AuthService, useValue: authService },
      ],
    });
    service = TestBed.inject(EquipeService);
  });

  describe('telaInicial', () => {
    it('sem sessão não há tela inicial', async () => {
      logado = false;

      expect(await service.telaInicial()).toBeNull();
    });

    it('cliente sem pedido vai para a home', async () => {
      banco.responderCom(null);

      expect(await service.telaInicial()).toBe('/cliente/home');
    });

    it('cliente com pedido vai para a tela de espera, qualquer que seja a resposta', async () => {
      for (const status of ['pendente', 'recusada', 'aprovada']) {
        banco.responderCom({ id: 's1', status, estabelecimento: { nome: 'Bar' } });

        expect(await service.telaInicial()).toBe('/atendente/aguardando');
      }
    });

    it('funcionário vai para os pedidos mesmo com o pedido antigo aprovado', async () => {
      tipo = 'funcionario';
      banco.responderCom({ id: 's1', status: 'aprovada', estabelecimento: { nome: 'Bar' } });

      expect(await service.telaInicial()).toBe('/atendente/pedidos');
    });

    it('se a consulta do pedido falhar, segue para a tela normal', async () => {
      banco.responderCom(null, { message: 'tabela não existe' });

      expect(await service.telaInicial()).toBe('/cliente/home');
    });
  });

  describe('convites', () => {
    it('confere o convite pelo código e devolve o bar e a situação', async () => {
      banco.rpc.mockResolvedValueOnce({
        data: [{ estabelecimento_nome: "Bar D'Zé", situacao: 'valido' }],
        error: null,
      });

      expect(await service.verConvite('A3F9-C17B-2D40')).toEqual({
        estabelecimento_nome: "Bar D'Zé",
        situacao: 'valido',
      });
      expect(banco.rpc).toHaveBeenCalledWith('ver_convite', { p_codigo: 'A3F9-C17B-2D40' });
    });

    it('código que não existe vira null', async () => {
      banco.rpc.mockResolvedValueOnce({ data: [], error: null });

      expect(await service.verConvite('NAO-EXISTE')).toBeNull();
    });

    it('pedir para entrar só existe através do convite, e o banco confere tudo', async () => {
      await service.aceitarConvite('A3F9-C17B-2D40', '15999990000');

      expect(banco.rpc).toHaveBeenCalledWith('aceitar_convite', {
        p_codigo: 'A3F9-C17B-2D40',
        p_telefone: '15999990000',
      });
      expect(banco.chamadas).toEqual([]);
    });

    it('o gerente gera o convite pelo banco, sem escolher código nem validade', async () => {
      banco.rpc.mockResolvedValueOnce({
        data: {
          id: 'c1',
          codigo: 'A3F9-C17B-2D40',
          criado_em: '2026-10-15T21:00:00Z',
          expira_em: '2026-10-17T21:00:00Z',
          estabelecimento_id: 'b1',
          usado_em: null,
        },
        error: null,
      });

      expect(await service.criarConvite()).toEqual({
        id: 'c1',
        codigo: 'A3F9-C17B-2D40',
        criado_em: '2026-10-15T21:00:00Z',
        expira_em: '2026-10-17T21:00:00Z',
      });
      expect(banco.rpc).toHaveBeenCalledWith('criar_convite');
    });

    it('lista só os convites do bar ainda não usados e na validade', async () => {
      tipo = 'gerente';
      banco.responderCom([]);

      await service.listarConvitesAbertos();

      expect(banco.chamadas[0]).toMatchObject({
        tabela: 'convites_equipe',
        filtros: [
          ['estabelecimento_id', 'b1'],
          ['usado_em is', null],
          ['expira_em >', 'agora'],
        ],
      });
    });

    it('cancelar apaga o convite', async () => {
      await service.cancelarConvite('c1');

      expect(banco.chamadas[0]).toMatchObject({
        tabela: 'convites_equipe',
        apagou: true,
        filtros: [['id', 'c1']],
      });
    });
  });

  it('desistir apaga o pedido', async () => {
    await service.desistir('s1');

    expect(banco.chamadas[0]).toMatchObject({ apagou: true, filtros: [['id', 's1']] });
  });

  it('lista para o gerente só os pedidos pendentes do bar dele', async () => {
    tipo = 'gerente';
    banco.responderCom([
      {
        id: 's1',
        telefone: '159',
        criada_em: '2026-10-08T20:00:00Z',
        convite_id: 'c1',
        candidato: { nome: ' Ana ', email: 'ana@x.com', foto_url: 'https://fotos/ana.jpg' },
      },
      { id: 's2', telefone: '158', criada_em: '2026-10-08T21:00:00Z', convite_id: null, candidato: null },
    ]);

    await service.carregarPendentes();

    expect(banco.chamadas[0].filtros).toEqual([
      ['estabelecimento_id', 'b1'],
      ['status', 'pendente'],
    ]);
    expect(service.pendentes()).toEqual([
      {
        id: 's1',
        nome: 'Ana',
        email: 'ana@x.com',
        telefone: '159',
        foto_url: 'https://fotos/ana.jpg',
        criada_em: '2026-10-08T20:00:00Z',
        peloConvite: true,
      },
      {
        id: 's2',
        nome: 'Sem nome',
        email: '',
        telefone: '158',
        foto_url: null,
        criada_em: '2026-10-08T21:00:00Z',
        peloConvite: false,
      },
    ]);
  });

  it('lista só os funcionários do bar do gerente', async () => {
    tipo = 'gerente';
    banco.responderCom([]);

    await service.listarFuncionarios();

    expect(banco.chamadas[0]).toMatchObject({
      tabela: 'perfis',
      filtros: [
        ['tipo', 'funcionario'],
        ['estabelecimento_id', 'b1'],
      ],
    });
  });

  it('aprovar, recusar e remover passam pelas funções do banco', async () => {
    await service.responder('s1', true);
    await service.responder('s2', false);
    await service.remover('u9');

    expect(banco.rpc.mock.calls).toEqual([
      ['responder_solicitacao', { p_solicitacao_id: 's1', p_aprovar: true }],
      ['responder_solicitacao', { p_solicitacao_id: 's2', p_aprovar: false }],
      ['remover_funcionario', { p_usuario_id: 'u9' }],
    ]);
  });

  it('propaga a recusa do banco para a tela', async () => {
    const erro = { code: 'P0001', message: 'Solicitação não encontrada ou já respondida.' };
    banco.rpc.mockResolvedValueOnce({ data: null, error: erro });

    await expect(service.responder('s1', true)).rejects.toBe(erro);
  });
});
