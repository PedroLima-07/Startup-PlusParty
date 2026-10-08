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

  it('pede para entrar no bar em nome de quem está logado', async () => {
    await service.solicitar('b1', '15999990000');

    expect(banco.chamadas[0]).toMatchObject({
      tabela: 'solicitacoes_equipe',
      inserido: { usuario_id: 'u1', estabelecimento_id: 'b1', telefone: '15999990000' },
    });
  });

  it('não envia tipo nem status no pedido: quem decide é o banco', async () => {
    await service.solicitar('b1', '15999990000');

    expect(Object.keys(banco.chamadas[0].inserido as object).sort()).toEqual([
      'estabelecimento_id',
      'telefone',
      'usuario_id',
    ]);
  });

  it('desistir apaga o pedido', async () => {
    await service.desistir('s1');

    expect(banco.chamadas[0]).toMatchObject({ apagou: true, filtros: [['id', 's1']] });
  });

  it('lista para o gerente só os pedidos pendentes do bar dele', async () => {
    tipo = 'gerente';
    banco.responderCom([
      { id: 's1', telefone: '159', criada_em: '2026-10-08T20:00:00Z', candidato: { nome: ' Ana ', email: 'ana@x.com' } },
      { id: 's2', telefone: '158', criada_em: '2026-10-08T21:00:00Z', candidato: null },
    ]);

    await service.carregarPendentes();

    expect(banco.chamadas[0].filtros).toEqual([
      ['estabelecimento_id', 'b1'],
      ['status', 'pendente'],
    ]);
    expect(service.pendentes()).toEqual([
      { id: 's1', nome: 'Ana', email: 'ana@x.com', telefone: '159', criada_em: '2026-10-08T20:00:00Z' },
      { id: 's2', nome: 'Sem nome', email: '', telefone: '158', criada_em: '2026-10-08T21:00:00Z' },
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
