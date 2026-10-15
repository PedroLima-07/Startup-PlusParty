import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Notificacao } from '../models';
import { NotificacoesService } from './notificacoes.service';
import { SupabaseService } from './supabase.service';

function notificacao(id: string, parcial: Partial<Notificacao> = {}): Notificacao {
  return {
    id,
    tipo: 'pedido_pronto',
    titulo: 'Sua bebida está pronta! 🍻',
    texto: "2x Chope · Bar D'Zé",
    link: '/cliente/comanda/c1',
    criada_em: new Date().toISOString(),
    lida_em: null,
    ...parcial,
  };
}

/** Aviso do sistema de mentira: guarda o que foi mostrado. */
class AvisoDoSistema {
  static permission: NotificationPermission = 'granted';
  static mostrados: { titulo: string; opcoes?: NotificationOptions }[] = [];
  static requestPermission = vi.fn(() => Promise.resolve(AvisoDoSistema.permission));
  onclick: (() => void) | null = null;

  constructor(titulo: string, opcoes?: NotificationOptions) {
    AvisoDoSistema.mostrados.push({ titulo, opcoes });
  }

  close(): void {}
}

describe('NotificacoesService', () => {
  let service: NotificacoesService;
  let rpc: ReturnType<typeof vi.fn>;
  let router: Router;

  function comAba(estado: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true });
  }

  beforeEach(() => {
    AvisoDoSistema.permission = 'granted';
    AvisoDoSistema.mostrados = [];
    vi.stubGlobal('Notification', AvisoDoSistema);
    try {
      localStorage.clear();
    } catch {
      // ambiente sem armazenamento
    }
    comAba('visible');

    rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    service = TestBed.inject(NotificacoesService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    comAba('visible');
  });

  it('notificação nova entra no topo, conta como não lida e aparece no topo da tela', () => {
    service.lista.set([notificacao('antiga', { lida_em: '2026-10-15T20:00:00Z' })]);

    service.chegou(notificacao('nova'));

    expect(service.lista().map((n) => n.id)).toEqual(['nova', 'antiga']);
    expect(service.naoLidas()).toBe(1);
    expect(service.avisoNaTela()?.id).toBe('nova');
    expect(AvisoDoSistema.mostrados).toHaveLength(0);
  });

  it('a mesma notificação recebida duas vezes entra uma vez só', () => {
    service.chegou(notificacao('n1'));
    service.chegou(notificacao('n1'));

    expect(service.lista()).toHaveLength(1);
  });

  it('com o app em outra aba, mostra o aviso do sistema', async () => {
    comAba('hidden');

    service.chegou(notificacao('n1'));
    await Promise.resolve();

    expect(service.avisoNaTela()).toBeNull();
    expect(AvisoDoSistema.mostrados).toEqual([
      {
        titulo: 'Sua bebida está pronta! 🍻',
        opcoes: expect.objectContaining({ body: "2x Chope · Bar D'Zé", tag: 'n1' }),
      },
    ]);
  });

  it('sem permissão, não mostra aviso do sistema, mas a notificação fica na lista', async () => {
    AvisoDoSistema.permission = 'denied';
    service.permissao.set('denied');
    comAba('hidden');

    service.chegou(notificacao('n1'));
    await Promise.resolve();

    expect(AvisoDoSistema.mostrados).toHaveLength(0);
    expect(service.naoLidas()).toBe(1);
  });

  it('tocar na notificação marca como lida e abre a tela dela', async () => {
    service.chegou(notificacao('n1'));

    await service.abrir(service.lista()[0]);

    expect(service.naoLidas()).toBe(0);
    expect(service.avisoNaTela()).toBeNull();
    expect(rpc).toHaveBeenCalledWith('marcar_notificacoes_lidas', { p_ids: ['n1'] });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/cliente/comanda/c1');
  });

  it('nunca abre endereço de fora do app', async () => {
    await service.abrir(notificacao('n1', { link: 'https://golpe.example' }));
    await service.abrir(notificacao('n2', { link: '//golpe.example' }));

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('marcar todas como lidas vale para a lista inteira', async () => {
    service.lista.set([notificacao('n1'), notificacao('n2')]);

    await service.marcarTodasComoLidas();

    expect(rpc).toHaveBeenCalledWith('marcar_notificacoes_lidas', { p_ids: null });
    expect(service.naoLidas()).toBe(0);
  });

  it('se o banco falhar ao marcar todas, avisa e não finge que marcou', async () => {
    service.lista.set([notificacao('n1')]);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'sem rede' } });

    await expect(service.marcarTodasComoLidas()).rejects.toBeTruthy();
    expect(service.naoLidas()).toBe(1);
  });

  it('oferece ligar os avisos só a quem ainda não respondeu, e "Agora não" esconde o convite', () => {
    service.permissao.set('default');
    expect(service.oferecerAvisos()).toBe(true);

    service.dispensarConvite();
    expect(service.oferecerAvisos()).toBe(false);

    service.permissao.set('granted');
    service.dispensouConvite.set(false);
    expect(service.oferecerAvisos()).toBe(false);
  });

  it('ligar os avisos pergunta ao navegador e confirma com um aviso', async () => {
    service.permissao.set('default');

    await service.ligarAvisos();

    expect(AvisoDoSistema.requestPermission).toHaveBeenCalled();
    expect(service.permissao()).toBe('granted');
    expect(AvisoDoSistema.mostrados[0].titulo).toBe('Avisos ligados 🔔');
  });
});
