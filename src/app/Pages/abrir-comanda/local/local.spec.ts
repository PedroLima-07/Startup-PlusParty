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
};

describe('AbrirComandaLocalComponent', () => {
  let fixture: ComponentFixture<AbrirComandaLocalComponent>;
  let component: AbrirComandaLocalComponent;
  let comandaService: {
    abrirComanda: ReturnType<typeof vi.fn>;
    buscarComandaAtiva: ReturnType<typeof vi.fn>;
  };
  /** O que acontece quando chega uma mudança nas comandas do cliente. */
  let aoMudarComandas: () => void;
  let estabelecimentosService: { buscarPorId: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    comandaService = {
      abrirComanda: vi.fn().mockResolvedValue({ id: 'comanda-1' }),
      buscarComandaAtiva: vi.fn().mockResolvedValue(null),
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
});
