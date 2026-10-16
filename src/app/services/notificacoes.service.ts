import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Notificacao } from '../models';
import { SupabaseService } from './supabase.service';

/** O navegador não tem avisos (ex.: Safari do iPhone fora da tela inicial). */
export type PermissaoAvisos = NotificationPermission | 'indisponivel';

/** Arquivo em public/: só abre o app quando a pessoa toca no aviso. */
const SERVICE_WORKER = '/avisos-sw.js';
/** Quanto tempo o aviso fica no topo da tela antes de sumir sozinho. */
const TEMPO_NA_TELA = 6000;
/** Quem tocou em "Agora não" não vê o convite de novo neste navegador. */
const CHAVE_DISPENSOU = 'plusparty:avisos-dispensados';

function lerPermissao(): PermissaoAvisos {
  return typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission;
}

function lerDispensa(): boolean {
  try {
    return localStorage.getItem(CHAVE_DISPENSOU) === 'sim';
  } catch {
    return false;
  }
}

/**
 * Notificações do cliente: comanda liberada, pedido pronto, pagamento
 * confirmado, promoção nova de um bar que ele já visitou. Quem cria é o
 * banco; aqui o app só lê, escuta as novas e avisa a pessoa:
 *   - com o app na frente, um aviso no topo da tela;
 *   - com o app em outra aba ou minimizado, o aviso do sistema (se ela
 *     permitiu), igual ao de um aplicativo.
 * Funciona enquanto o site está aberto no navegador. Avisar com o site
 * fechado exigiria notificação push, que fica para depois do deploy.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificacoesService {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  readonly lista = signal<Notificacao[]>([]);
  readonly carregada = signal(false);
  readonly erroCarregar = signal(false);
  readonly naoLidas = computed(() => this.lista().filter((n) => !n.lida_em).length);

  /** Notificação que acabou de chegar, mostrada no topo da tela. */
  readonly avisoNaTela = signal<Notificacao | null>(null);

  readonly permissao = signal<PermissaoAvisos>(lerPermissao());
  readonly dispensouConvite = signal(lerDispensa());
  /** Mostrar o convite para ligar os avisos do navegador. */
  readonly oferecerAvisos = computed(
    () => this.permissao() === 'default' && !this.dispensouConvite(),
  );

  private iniciado = false;
  private usuarioId: string | null = null;
  private pararDeEscutar: (() => void) | null = null;
  private esconderAviso: ReturnType<typeof setTimeout> | undefined;
  private serviceWorker: Promise<ServiceWorkerRegistration | null> | null = null;

  /** Chamado uma vez, pelo App: acompanha quem está logado na aba. */
  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;

    this.supabase.client.auth.onAuthStateChange((_evento, sessao) => {
      // O Supabase pede para não usar o próprio cliente dentro deste aviso.
      setTimeout(() => void this.trocarUsuario(sessao?.user.id ?? null));
    });

    // Toque num aviso mostrado pelo service worker (Android).
    navigator.serviceWorker?.addEventListener('message', (evento: MessageEvent) => {
      if (evento.data?.tipo === 'abrir-link') void this.irPara(evento.data.link);
    });
  }

  async carregar(): Promise<void> {
    if (!this.usuarioId) return;

    const { data, error } = await this.supabase.client
      .from('notificacoes')
      .select('id, tipo, titulo, texto, link, criada_em, lida_em')
      .order('criada_em', { ascending: false })
      .limit(50);

    if (error) {
      this.erroCarregar.set(true);
      return;
    }
    this.erroCarregar.set(false);
    this.lista.set((data ?? []) as Notificacao[]);
    this.carregada.set(true);
  }

  /** Notificação nova: entra no topo da lista e a pessoa é avisada. */
  chegou(notificacao: Notificacao): void {
    if (this.lista().some((n) => n.id === notificacao.id)) return;
    this.lista.update((lista) => [notificacao, ...lista]);

    if (document.visibilityState === 'visible') {
      this.mostrarNaTela(notificacao);
    } else {
      void this.mostrarNoSistema(notificacao.titulo, notificacao.texto ?? '', notificacao);
    }
  }

  /** Toque numa notificação: marca como lida e abre a tela dela. */
  async abrir(notificacao: Notificacao): Promise<void> {
    this.fecharAviso();
    void this.marcarComoLida(notificacao.id);
    await this.irPara(notificacao.link);
  }

  fecharAviso(): void {
    clearTimeout(this.esconderAviso);
    this.avisoNaTela.set(null);
  }

  async marcarComoLida(id: string): Promise<void> {
    const alvo = this.lista().find((n) => n.id === id);
    if (!alvo || alvo.lida_em) return;

    this.marcarNaLista((n) => n.id === id);
    await this.supabase.client.rpc('marcar_notificacoes_lidas', { p_ids: [id] });
  }

  async marcarTodasComoLidas(): Promise<void> {
    const { error } = await this.supabase.client.rpc('marcar_notificacoes_lidas', { p_ids: null });
    if (error) throw error;
    this.marcarNaLista(() => true);
  }

  /** Abre a pergunta do navegador. Só depois de a pessoa pedir, nunca sozinho. */
  async ligarAvisos(): Promise<void> {
    if (typeof Notification === 'undefined') return;

    const resposta = await Notification.requestPermission();
    this.permissao.set(resposta);

    if (resposta === 'granted') {
      await this.mostrarNoSistema(
        'Avisos ligados 🔔',
        'Vamos avisar quando sua comanda for liberada e quando seu pedido ficar pronto.',
        null,
      );
    }
  }

  dispensarConvite(): void {
    this.dispensouConvite.set(true);
    try {
      localStorage.setItem(CHAVE_DISPENSOU, 'sim');
    } catch {
      // Sem armazenamento (aba anônima): o convite volta na próxima visita.
    }
  }

  private async trocarUsuario(id: string | null): Promise<void> {
    if (id === this.usuarioId) return;

    this.pararDeEscutar?.();
    this.pararDeEscutar = null;
    this.usuarioId = id;
    this.lista.set([]);
    this.carregada.set(false);
    this.fecharAviso();

    if (!id) return;
    this.pararDeEscutar = this.escutar(id);
    await this.carregar();
  }

  private escutar(usuarioId: string): () => void {
    const canal = this.supabase.client
      .channel(`notificacoes-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (mudanca) => this.chegou(mudanca.new as Notificacao),
      )
      .subscribe();

    return () => void this.supabase.client.removeChannel(canal);
  }

  private mostrarNaTela(notificacao: Notificacao): void {
    clearTimeout(this.esconderAviso);
    this.avisoNaTela.set(notificacao);
    this.esconderAviso = setTimeout(() => this.avisoNaTela.set(null), TEMPO_NA_TELA);
  }

  /**
   * Aviso do sistema. No computador, o próprio site mostra; no Android o
   * navegador exige um service worker para isso, então ele entra como reserva.
   */
  private async mostrarNoSistema(
    titulo: string,
    texto: string,
    notificacao: Notificacao | null,
  ): Promise<void> {
    if (this.permissao() !== 'granted') return;

    const opcoes: NotificationOptions = {
      body: texto,
      icon: '/favicon.ico',
      tag: notificacao?.id,
      data: { link: notificacao?.link ?? '/cliente/notificacoes' },
    };

    try {
      const aviso = new Notification(titulo, opcoes);
      aviso.onclick = () => {
        window.focus();
        aviso.close();
        if (notificacao) void this.abrir(notificacao);
      };
    } catch {
      try {
        const registro = await this.registrarServiceWorker();
        await registro?.showNotification(titulo, opcoes);
      } catch {
        // Sem aviso do sistema: a notificação continua na lista do app.
      }
    }
  }

  private registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);

    this.serviceWorker ??= navigator.serviceWorker
      .register(SERVICE_WORKER)
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null);
    return this.serviceWorker;
  }

  private marcarNaLista(deveMarcar: (n: Notificacao) => boolean): void {
    const agora = new Date().toISOString();
    this.lista.update((lista) =>
      lista.map((n) => (!n.lida_em && deveMarcar(n) ? { ...n, lida_em: agora } : n)),
    );
  }

  /** Só abre telas do próprio app. */
  private async irPara(link: string | null | undefined): Promise<void> {
    if (link?.startsWith('/') && !link.startsWith('//')) {
      await this.router.navigateByUrl(link);
    }
  }
}
