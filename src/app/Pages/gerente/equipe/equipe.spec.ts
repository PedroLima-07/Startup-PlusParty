import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Funcionario, SolicitacaoPendente } from '../../../models';
import { AuthService } from '../../../services/auth.service';
import { DesempenhoService } from '../../../services/desempenho.service';
import { EquipeService } from '../../../services/equipe.service';
import { Equipe } from './equipe';

registerLocaleData(localePt);

const PEDIDO: SolicitacaoPendente = {
  id: 's1',
  nome: 'Gil Souza',
  email: 'gil@party.app',
  telefone: '15999990000',
  foto_url: null,
  criada_em: new Date(Date.now() - 5 * 60_000).toISOString(),
  peloConvite: true,
};

const ANA: Funcionario = {
  id: 'u2',
  nome: 'Ana Lima',
  email: 'ana@party.app',
  telefone: '15988880000',
  foto_url: 'https://fotos/ana.jpg',
};
const RAFA: Funcionario = { id: 'u3', nome: 'Rafael Menezes', email: 'rafa@party.app', telefone: null, foto_url: null };

describe('Equipe (gerente)', () => {
  let fixture: ComponentFixture<Equipe>;
  let service: {
    pendentes: ReturnType<typeof signal<SolicitacaoPendente[]>>;
    carregarPendentes: ReturnType<typeof vi.fn>;
    listarFuncionarios: ReturnType<typeof vi.fn>;
    responder: ReturnType<typeof vi.fn>;
  };
  let pedidosDeHoje: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(texto: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(texto),
    )!;
  }

  async function abrir(): Promise<void> {
    fixture = TestBed.createComponent(Equipe);
    fixture.detectChanges();
    // A carga passa por várias promessas: espera a fila esvaziar.
    await new Promise((resolver) => setTimeout(resolver));
  }

  beforeEach(async () => {
    service = {
      pendentes: signal([PEDIDO]),
      carregarPendentes: vi.fn().mockResolvedValue(undefined),
      listarFuncionarios: vi.fn().mockResolvedValue([ANA, RAFA]),
      responder: vi.fn().mockResolvedValue(undefined),
    };
    pedidosDeHoje = vi.fn().mockResolvedValue(new Map([['u2', 42]]));

    await TestBed.configureTestingModule({
      imports: [Equipe],
      providers: [
        provideRouter([]),
        { provide: EquipeService, useValue: service },
        { provide: DesempenhoService, useValue: { pedidosDeHojePorAtendente: pedidosDeHoje } },
        {
          provide: AuthService,
          useValue: { buscarNomeEstabelecimentoAtual: () => Promise.resolve("Bar D'Zé") },
        },
        { provide: LOCALE_ID, useValue: 'pt-BR' },
      ],
    }).compileComponents();
  });

  it('oferece o convite como único jeito de chamar alguém para a equipe', async () => {
    await abrir();
    const convidar = tela().querySelector<HTMLAnchorElement>('.botao-convidar')!;

    expect(convidar.textContent).toContain('Convidar atendente');
    expect(convidar.getAttribute('href')).toBe('/gerente/equipe/convite');
  });

  it('mostra quem usou o convite, há quanto tempo e o contato', async () => {
    await abrir();
    const pedido = tela().querySelector('.pedido')!.textContent ?? '';

    expect(pedido).toContain('Gil Souza');
    expect(pedido).toContain('gil@party.app');
    expect(pedido).toContain('15999990000');
    expect(pedido).toContain('Usou seu convite há 5 min');
  });

  it('aprovar responde o pedido e recarrega as listas', async () => {
    await abrir();

    botao('Aprovar').click();
    await fixture.whenStable();

    expect(service.responder).toHaveBeenCalledWith('s1', true);
    expect(service.listarFuncionarios).toHaveBeenCalledTimes(2);
  });

  it('recusar responde o pedido como não aprovado', async () => {
    await abrir();

    botao('Recusar').click();
    await fixture.whenStable();

    expect(service.responder).toHaveBeenCalledWith('s1', false);
  });

  it('lista os atendentes com os pedidos entregues hoje, cada um levando ao próprio perfil', async () => {
    await abrir();
    const atendentes = Array.from(tela().querySelectorAll<HTMLAnchorElement>('.atendente'));

    const linhas = atendentes.map((a) =>
      Array.from(a.querySelectorAll('.pessoa-texto > *')).map((e) => e.textContent?.trim()),
    );

    expect(linhas).toEqual([
      ['Ana Lima', '42 pedidos entregues hoje'],
      ['Rafael Menezes', 'Nenhum pedido entregue hoje'],
    ]);
    expect(atendentes[1].querySelector('app-avatar')?.textContent?.trim()).toBe('RM');
    expect(atendentes[0].getAttribute('href')).toBe('/gerente/equipe/u2');
    expect(atendentes[0].querySelector('img')?.getAttribute('src')).toBe('https://fotos/ana.jpg');
  });

  it('sem os números de desempenho, a lista continua aparecendo com o e-mail', async () => {
    pedidosDeHoje.mockRejectedValue(new Error('coluna não existe'));
    await abrir();

    expect(tela().textContent).toContain('ana@party.app');
    expect(tela().querySelector('.mensagem-erro')).toBeNull();
  });

  it('pedido novo que chega pelo tempo real aparece sem recarregar a tela', async () => {
    await abrir();

    service.pendentes.set([PEDIDO, { ...PEDIDO, id: 's2', nome: 'Bia Reis' }]);

    expect(tela().textContent).toContain('Bia Reis');
  });

  it('mostra a frase do banco quando ele recusa a ação', async () => {
    await abrir();
    service.responder.mockRejectedValueOnce({
      code: 'P0001',
      message: 'Solicitação não encontrada ou já respondida.',
    });

    botao('Aprovar').click();
    await fixture.whenStable();

    expect(tela().textContent).toContain('Solicitação não encontrada ou já respondida.');
  });

  it('se a primeira carga falhar, mostra só o aviso, sem listas vazias enganosas', async () => {
    service.listarFuncionarios.mockRejectedValueOnce(new Error('sem rede'));
    await abrir();

    expect(tela().textContent).toContain('Não foi possível carregar a equipe');
    expect(tela().querySelector('#titulo-atendentes')).toBeNull();
  });
});
