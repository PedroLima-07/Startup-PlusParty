import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Notificacao } from '../../models';
import { NotificacoesService, PermissaoAvisos } from '../../services/notificacoes.service';
import { NotificacoesPage } from './notificacoes';

function notificacao(id: string, criada: Date, lida = false): Notificacao {
  return {
    id,
    tipo: 'pedido_pronto',
    titulo: `Aviso ${id}`,
    texto: "2x Chope · Bar D'Zé",
    link: '/cliente/comanda/c1',
    criada_em: criada.toISOString(),
    lida_em: lida ? criada.toISOString() : null,
  };
}

describe('NotificacoesPage', () => {
  let fixture: ComponentFixture<NotificacoesPage>;
  let servico: {
    lista: ReturnType<typeof signal<Notificacao[]>>;
    naoLidas: () => number;
    carregada: ReturnType<typeof signal<boolean>>;
    erroCarregar: ReturnType<typeof signal<boolean>>;
    permissao: ReturnType<typeof signal<PermissaoAvisos>>;
    oferecerAvisos: () => boolean;
    carregar: ReturnType<typeof vi.fn>;
    abrir: ReturnType<typeof vi.fn>;
    marcarTodasComoLidas: ReturnType<typeof vi.fn>;
    ligarAvisos: ReturnType<typeof vi.fn>;
    dispensarConvite: ReturnType<typeof vi.fn>;
  };

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(texto: string): HTMLButtonElement | undefined {
    return Array.from(tela().querySelectorAll('button')).find((b) => b.textContent?.includes(texto));
  }

  beforeEach(async () => {
    const lista = signal<Notificacao[]>([]);
    const permissao = signal<PermissaoAvisos>('default');
    servico = {
      lista,
      naoLidas: computed(() => lista().filter((n) => !n.lida_em).length),
      carregada: signal(true),
      erroCarregar: signal(false),
      permissao,
      oferecerAvisos: computed(() => permissao() === 'default'),
      carregar: vi.fn().mockResolvedValue(undefined),
      abrir: vi.fn().mockResolvedValue(undefined),
      marcarTodasComoLidas: vi.fn().mockResolvedValue(undefined),
      ligarAvisos: vi.fn().mockResolvedValue(undefined),
      dispensarConvite: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [NotificacoesPage],
      providers: [provideRouter([]), { provide: NotificacoesService, useValue: servico }],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificacoesPage);
  });

  it('separa as de hoje das anteriores e destaca as não lidas', () => {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    servico.lista.set([notificacao('n1', new Date()), notificacao('n2', ontem, true)]);

    const grupos = Array.from(tela().querySelectorAll('.grupo h2')).map((h) => h.textContent);
    const novas = tela().querySelectorAll('.notificacao.nova');

    expect(grupos).toEqual(['Hoje', 'Anteriores']);
    expect(novas).toHaveLength(1);
    expect(novas[0].textContent).toContain('Aviso n1');
    expect(servico.carregar).toHaveBeenCalled();
  });

  it('tocar numa notificação abre a tela dela', () => {
    servico.lista.set([notificacao('n1', new Date())]);

    tela().querySelector<HTMLButtonElement>('.notificacao')!.click();

    expect(servico.abrir).toHaveBeenCalledWith(servico.lista()[0]);
  });

  it('"Marcar todas como lidas" só aparece com algo não lido', async () => {
    expect(botao('Marcar todas')).toBeUndefined();

    servico.lista.set([notificacao('n1', new Date())]);
    botao('Marcar todas')!.click();
    await fixture.whenStable();

    expect(servico.marcarTodasComoLidas).toHaveBeenCalled();
  });

  it('convida a ligar os avisos do navegador, sem perguntar sozinho', () => {
    botao('Ativar avisos')!.click();
    expect(servico.ligarAvisos).toHaveBeenCalled();

    botao('Agora não')!.click();
    expect(servico.dispensarConvite).toHaveBeenCalled();
  });

  it('quem bloqueou os avisos vê como desbloquear', () => {
    servico.permissao.set('denied');

    expect(tela().textContent).toContain('estão bloqueados');
    expect(botao('Ativar avisos')).toBeUndefined();
  });

  it('sem notificações, explica o que vai aparecer', () => {
    expect(tela().textContent).toContain('Nenhuma notificação por enquanto.');
  });
});
