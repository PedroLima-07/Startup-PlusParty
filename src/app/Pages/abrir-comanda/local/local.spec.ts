import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Estabelecimento } from '../../../models';
import {
  ComandaAtiva,
  ComandaEmOutroLugarError,
  ComandaService,
  ContaPendenteError,
} from '../../../services/comanda.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseService } from '../../../services/supabase.service';
import { EstabelecimentosService } from '../../../services/estabelecimentos.service';
import { AbrirComandaLocalComponent } from './local';

const BAR: Estabelecimento = {
  id: 'bar-1',
  nome: "Bar D'Zé",
  descricao: null,
  endereco: null,
  capacidade: 100,
  avaliacao: 4.5,
  nota_media: 4.5,
  total_avaliacoes: 12,
  criado_em: '2026-01-01',
  foto_url: null,
  sobre: null,
  tags: [],
  horario_abre: null,
  horario_fecha: null,
  dias_abertos: [],
};

const CONTA_FECHADA: ComandaAtiva = {
  id: 'conta-1',
  estabelecimento_id: 'bar-9',
  estabelecimento: 'Neon Club',
  mesa: '4',
  status: 'aguardando_pagamento',
  fechada_em: new Date(Date.now() - 34 * 60_000).toISOString(),
  total: 86,
  veio_da_fila: false,
};

describe('AbrirComandaLocalComponent', () => {
  let fixture: ComponentFixture<AbrirComandaLocalComponent>;
  let component: AbrirComandaLocalComponent;
  let comandaService: {
    abrirComanda: ReturnType<typeof vi.fn>;
    buscarComandaAtiva: ReturnType<typeof vi.fn>;
    situacaoMesa: ReturnType<typeof vi.fn>;
    entrarNaFila: ReturnType<typeof vi.fn>;
    sairDaFila: ReturnType<typeof vi.fn>;
    minhaFila: ReturnType<typeof vi.fn>;
  };
  /** O que acontece quando chega uma mudança nas comandas do cliente. */
  let aoMudarComandas: () => void;
  let estabelecimentosService: { buscarPorId: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    comandaService = {
      abrirComanda: vi.fn().mockResolvedValue({ id: 'comanda-1' }),
      buscarComandaAtiva: vi.fn().mockResolvedValue(null),
      situacaoMesa: vi.fn().mockResolvedValue('livre'),
      entrarNaFila: vi.fn().mockResolvedValue(1),
      sairDaFila: vi.fn().mockResolvedValue(undefined),
      minhaFila: vi.fn().mockResolvedValue(null),
    };
    aoMudarComandas = () => {};
    estabelecimentosService = { buscarPorId: vi.fn().mockResolvedValue(BAR) };

    await TestBed.configureTestingModule({
      imports: [AbrirComandaLocalComponent],
      providers: [
        provideRouter([]),
        { provide: ComandaService, useValue: comandaService },
        { provide: EstabelecimentosService, useValue: estabelecimentosService },
        { provide: AuthService, useValue: { usuarioAtual: async () => ({ id: 'u1' }) } },
        {
          provide: SupabaseService,
          useValue: {
            escutarMudancas: (_tabelas: unknown, aoMudar: () => void) => {
              aoMudarComandas = aoMudar;
              return () => {};
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(AbrirComandaLocalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'bar-1');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('carrega o estabelecimento pelo id da rota', () => {
    expect(estabelecimentosService.buscarPorId).toHaveBeenCalledWith('bar-1');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain(
      "Bar D'Zé",
    );
  });

  it('não permite abrir comanda sem escolher mesa ou balcão', () => {
    expect(component.podeAbrirComanda()).toBe(false);
  });

  it('exige número da mesa quando o local é mesa', () => {
    component.selecionarLocal('mesa');
    expect(component.podeAbrirComanda()).toBe(false);

    component.numeroMesa = '   ';
    expect(component.podeAbrirComanda()).toBe(false);

    component.numeroMesa = '12';
    expect(component.podeAbrirComanda()).toBe(true);
  });

  it('permite abrir no balcão sem número e limpa a mesa digitada antes', () => {
    component.selecionarLocal('mesa');
    component.numeroMesa = '12';
    component.selecionarLocal('balcao');

    expect(component.numeroMesa).toBe('');
    expect(component.podeAbrirComanda()).toBe(true);
  });

  it('abre comanda na mesa e navega para a comanda criada', async () => {
    component.selecionarLocal('mesa');
    component.numeroMesa = ' 12 ';

    await component.abrirComanda();

    expect(comandaService.abrirComanda).toHaveBeenCalledWith('bar-1', '12');
    expect(router.navigate).toHaveBeenCalledWith(['/cliente/comanda', 'comanda-1']);
  });

  it('abre comanda no balcão enviando mesa nula', async () => {
    component.selecionarLocal('balcao');

    await component.abrirComanda();

    expect(comandaService.abrirComanda).toHaveBeenCalledWith('bar-1', null);
  });

  it('mostra mensagem e libera o botão quando abrir comanda falha', async () => {
    comandaService.abrirComanda.mockRejectedValueOnce(new Error('RLS'));
    component.selecionarLocal('balcao');

    await component.abrirComanda();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component['mensagem']()).toContain('Não foi possível abrir a comanda');
    expect(component.podeAbrirComanda()).toBe(true);
  });

  it('explica quando o cliente já tem comanda aberta em outro bar', async () => {
    comandaService.abrirComanda.mockRejectedValueOnce(new ComandaEmOutroLugarError('Neon Club'));
    component.selecionarLocal('balcao');

    await component.abrirComanda();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component['mensagem']()).toBe(
      'Você já tem uma comanda aberta no Neon Club. Pague ela antes de abrir outra.',
    );
  });

  it('mostra erro com "Tentar de novo" se o bar não carrega, e recupera', async () => {
    estabelecimentosService.buscarPorId.mockRejectedValueOnce(new Error('offline'));
    await component['carregar']();
    fixture.detectChanges();

    const tela = fixture.nativeElement as HTMLElement;
    expect(tela.querySelector('app-erro-carregar')).not.toBeNull();

    await component['carregar']();
    fixture.detectChanges();
    expect(tela.querySelector('app-erro-carregar')).toBeNull();
    expect(tela.querySelector('h1')?.textContent).toContain("Bar D'Zé");
  });

  it('a seta de voltar leva ao perfil do estabelecimento', () => {
    component.voltar();
    expect(router.navigate).toHaveBeenCalledWith(['/cliente/estabelecimento', 'bar-1']);
  });

  describe('comanda que já prende o cliente', () => {
    const tela = () => fixture.nativeElement as HTMLElement;

    async function recarregar(): Promise<void> {
      await component['carregar']();
      fixture.detectChanges();
    }

    it('com conta fechada e não paga, mostra o aviso no lugar das opções', async () => {
      comandaService.buscarComandaAtiva.mockResolvedValue(CONTA_FECHADA);
      await recarregar();

      expect(tela().querySelector('.local-options')).toBeNull();
      expect(tela().querySelector('.conta-pendente')?.textContent).toContain(
        'Você tem uma conta esperando pagamento',
      );
      expect(tela().querySelector('.conta-pendente-bar')?.textContent).toContain('Neon Club · Mesa 4');
      expect(tela().querySelector('.conta-pendente-hora')?.textContent).toContain('há 34 min');
    });

    it('"Ver minha comanda" leva para a conta pendente', async () => {
      comandaService.buscarComandaAtiva.mockResolvedValue(CONTA_FECHADA);
      await recarregar();

      tela().querySelector<HTMLButtonElement>('.conta-pendente .primary-button')!.click();

      expect(router.navigate).toHaveBeenCalledWith(['/cliente/comanda', 'conta-1']);
    });

    it('se o banco recusar por conta pendente ao abrir, mostra o mesmo aviso', async () => {
      comandaService.abrirComanda.mockRejectedValueOnce(
        new ContaPendenteError({ id: 'conta-1', estabelecimento: 'Neon Club', mesa: '4', fechada_em: null, total: 86 }),
      );
      component.selecionarLocal('balcao');

      await component.abrirComanda();
      fixture.detectChanges();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(tela().querySelector('.conta-pendente')).not.toBeNull();
    });

    it('comanda aberta em outra aba aparece na hora, com o botão para ela', async () => {
      comandaService.buscarComandaAtiva.mockResolvedValue({
        ...CONTA_FECHADA,
        id: 'outra-aba',
        estabelecimento: "Bar D'Zé",
        mesa: '12',
        status: 'aguardando_liberacao',
      });

      aoMudarComandas();
      await fixture.whenStable();
      fixture.detectChanges();

      const folha = tela().querySelector('.comanda-aberta');
      expect(folha?.textContent).toContain('Sua comanda já foi aberta');
      expect(folha?.textContent).toContain('Aguardando liberação');

      folha!.querySelector<HTMLButtonElement>('.primary-button')!.click();
      expect(router.navigate).toHaveBeenCalledWith(['/cliente/comanda', 'outra-aba']);
    });

    it('a comanda que esta própria aba está abrindo não mostra o aviso', async () => {
      component['salvando'].set(true);
      comandaService.buscarComandaAtiva.mockResolvedValue({ ...CONTA_FECHADA, status: 'aguardando_liberacao' });

      aoMudarComandas();
      await fixture.whenStable();

      expect(comandaService.buscarComandaAtiva).toHaveBeenCalledTimes(1);
      expect(component['comandaAberta']()).toBeNull();
    });
  });

  describe('mesa ocupada e fila', () => {
    const tela = () => {
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };
    const botao = (texto: string) =>
      Array.from(tela().querySelectorAll('button')).find((b) => b.textContent?.includes(texto))!;
    const ESPERA = { id: 'f1', estabelecimento_id: 'bar-1', estabelecimento: "Bar D'Zé", mesa: '4', posicao: 2 };

    function escolherMesa(numero: string): void {
      component.selecionarLocal('mesa');
      component.numeroMesa = numero;
    }

    it('mesa livre abre direto', async () => {
      escolherMesa('4');
      await component.abrirComanda();

      expect(comandaService.situacaoMesa).toHaveBeenCalledWith('bar-1', '4');
      expect(comandaService.abrirComanda).toHaveBeenCalledWith('bar-1', '4');
    });

    it('no balcão não consulta mesa nenhuma', async () => {
      component.selecionarLocal('balcao');
      await component.abrirComanda();

      expect(comandaService.situacaoMesa).not.toHaveBeenCalled();
      expect(comandaService.abrirComanda).toHaveBeenCalledWith('bar-1', null);
    });

    it('mesa em uso pergunta se está com o grupo; confirmando, abre', async () => {
      comandaService.situacaoMesa.mockResolvedValue('em_uso');
      escolherMesa('4');
      await component.abrirComanda();

      expect(comandaService.abrirComanda).not.toHaveBeenCalled();
      expect(tela().querySelector('.pergunta-mesa')?.textContent).toContain('A mesa 4 já está em uso');

      botao('Estou com esse grupo').click();
      await fixture.whenStable();

      expect(comandaService.abrirComanda).toHaveBeenCalledWith('bar-1', '4');
    });

    it('"Escolher outra mesa" fecha a pergunta e limpa o número', async () => {
      comandaService.situacaoMesa.mockResolvedValue('em_uso');
      escolherMesa('4');
      await component.abrirComanda();

      botao('Escolher outra mesa').click();

      expect(tela().querySelector('.pergunta-mesa')).toBeNull();
      expect(component.numeroMesa).toBe('');
      expect(comandaService.abrirComanda).not.toHaveBeenCalled();
    });

    it('mesa sendo liberada oferece a fila; entrando, mostra a posição', async () => {
      comandaService.situacaoMesa.mockResolvedValue('liberando');
      comandaService.minhaFila.mockResolvedValue(ESPERA);
      escolherMesa('04');
      await component.abrirComanda();
      expect(tela().querySelector('.pergunta-mesa')?.textContent).toContain('está sendo liberada');

      botao('Entrar na fila').click();
      await fixture.whenStable();

      expect(comandaService.entrarNaFila).toHaveBeenCalledWith('bar-1', '04');
      expect(tela().querySelector('.na-fila-titulo')?.textContent).toContain('fila da mesa 4');
      expect(tela().querySelector('.na-fila-posicao')?.textContent).toContain('2º');
      expect(tela().querySelector('.local-options')).toBeNull();
    });

    it('quem já estava na fila deste bar volta direto para ela', async () => {
      comandaService.minhaFila.mockResolvedValue(ESPERA);
      await component['carregar']();

      expect(tela().querySelector('.na-fila')).not.toBeNull();
    });

    it('a fila de outro bar não aparece aqui', async () => {
      comandaService.minhaFila.mockResolvedValue({ ...ESPERA, estabelecimento_id: 'bar-9' });
      await component['carregar']();

      expect(tela().querySelector('.na-fila')).toBeNull();
    });

    it('sair da fila volta para a escolha de local', async () => {
      comandaService.minhaFila.mockResolvedValue(ESPERA);
      await component['carregar']();

      botao('Sair da fila').click();
      await fixture.whenStable();

      expect(comandaService.sairDaFila).toHaveBeenCalled();
      expect(tela().querySelector('.na-fila')).toBeNull();
      expect(tela().querySelector('.local-options')).not.toBeNull();
    });

    it('quando a mesa da fila libera, avisa "Sua mesa liberou!"', async () => {
      comandaService.minhaFila.mockResolvedValue(ESPERA);
      await component['carregar']();
      comandaService.minhaFila.mockResolvedValue(null);
      comandaService.buscarComandaAtiva.mockResolvedValue({
        ...CONTA_FECHADA,
        id: 'da-fila',
        estabelecimento: "Bar D'Zé",
        status: 'aguardando_liberacao',
        veio_da_fila: true,
      });

      aoMudarComandas();
      await fixture.whenStable();

      expect(tela().querySelector('.comanda-aberta-chamada')?.textContent).toContain('Sua mesa liberou!');
      expect(tela().querySelector('.na-fila')).toBeNull();
    });
  });
});
