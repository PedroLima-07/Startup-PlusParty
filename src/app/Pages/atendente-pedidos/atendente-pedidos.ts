import { AvisoItemNaoRecebido } from '../../components/aviso-item-nao-recebido/aviso-item-nao-recebido';
import { BotaoAtualizar } from '../../components/botao-atualizar/botao-atualizar';
import { duracaoEspera } from '../../tempo';
import { DatePipe, NgClass } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PedidoSetor, SetorItem, StatusPedidoItem } from '../../models';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { PedidosAtendenteService } from '../../services/pedidos-atendente.service';
import { Carregando } from '../../components/carregando/carregando';
import { Logo } from '../../components/logo/logo';
import { NavAtendente } from '../../components/nav-atendente/nav-atendente';
import { guardarSomLigado, lerSomLigado, liberarSom, tocarAvisoPedido } from './aviso-sonoro';

/** A partir de quantos minutos o pedido parado ganha o selo laranja (o mesmo alerta do gerente). */
export const MINUTOS_ATRASADO = 15;

/** De quanto em quanto tempo o "há X min" dos cartões é recalculado. */
const ATUALIZAR_ESPERA_MS = 30_000;

/** Tempo para desfazer um toque antes de a mudança ir para o banco. */
export const TEMPO_DESFAZER_MS = 5_000;

interface MudancaPendente {
  pedido: PedidoSetor;
  novoStatus: 'em_andamento' | 'pronto';
}

interface Coluna {
  status: Exclude<StatusPedidoItem, 'pronto'>;
  titulo: string;
  vazio: string;
  pedidos: PedidoSetor[];
}

@Component({
  selector: 'app-atendente-pedidos',
  imports: [AvisoItemNaoRecebido, BotaoAtualizar, Carregando, DatePipe, Logo, NavAtendente, NgClass],
  templateUrl: './atendente-pedidos.html',
  styleUrls: ['./atendente-pedidos.scss', './atendente-pedidos.desktop.scss', './atendente-pedidos.status.scss'],
  host: { '(document:pointerdown)': 'liberarSom()' },
})
export class AtendentePedidos implements OnInit {
  private pedidosService = inject(PedidosAtendenteService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private router = inject(Router);

  protected readonly abaAtiva = signal<SetorItem>('bar');
  protected readonly pedidos = signal<PedidoSetor[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  private readonly agora = signal(Date.now());

  /** Último toque, ainda dentro do tempo de desfazer. */
  protected readonly pendente = signal<MudancaPendente | null>(null);
  private timerPendente: ReturnType<typeof setTimeout> | undefined;
  protected readonly som = signal(lerSomLigado());
  /** Pedidos já mostrados; null antes da primeira carga. */
  private vistos: Set<string> | null = null;

  protected readonly pedidosFiltrados = computed(() =>
    this.pedidos().filter((pedido) => pedido.setor === this.abaAtiva()),
  );

  protected readonly quantidadePorSetor = computed(() => {
    const pedidos = this.pedidos();
    return {
      bar: pedidos.filter((p) => p.setor === 'bar').length,
      cozinha: pedidos.filter((p) => p.setor === 'cozinha').length,
    };
  });

  protected readonly colunas = computed<Coluna[]>(() => {
    const pedidos = this.pedidosFiltrados();
    return [
      {
        status: 'novo',
        titulo: 'Novos',
        vazio: 'Nenhum pedido novo.',
        pedidos: pedidos.filter((p) => p.status === 'novo'),
      },
      {
        status: 'em_andamento',
        titulo: 'Em preparo',
        vazio: 'Nada sendo preparado agora.',
        pedidos: pedidos.filter((p) => p.status === 'em_andamento'),
      },
    ];
  });

  /** Posição de cada pedido na ordem de chegada, para o celular mostrar uma lista só. */
  private readonly posicoes = computed(
    () => new Map(this.pedidosFiltrados().map((pedido, indice) => [pedido.id, indice])),
  );

  async ngOnInit(): Promise<void> {
    // Pedido novo do cliente aparece sozinho, sem tocar em atualizar.
    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'pedido_itens' }],
      () => void this.atualizarLista(true),
    );
    const relogio = setInterval(() => this.agora.set(Date.now()), ATUALIZAR_ESPERA_MS);
    this.destroyRef.onDestroy(() => {
      pararDeEscutar();
      clearInterval(relogio);
      // Saiu da tela dentro do tempo de desfazer: a mudança vale.
      void this.gravarPendente();
    });

    await this.atualizarLista();
  }

  protected async sair(): Promise<void> {
    await this.authService.sair();
    await this.router.navigateByUrl('/login');
  }

  /** `silencioso` recarrega sem trocar a lista por "Carregando...". */
  protected async atualizarLista(silencioso = false): Promise<void> {
    if (!silencioso) this.carregando.set(true);
    this.erro.set(null);

    try {
      const lista = await this.pedidosService.listarPendentes();
      this.conferirPedidosNovos(lista);
      this.pedidos.set(this.comPendente(lista));
      this.agora.set(Date.now());
    } catch {
      this.erro.set('Não foi possível carregar os pedidos. Toque em atualizar para tentar de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected rotuloLocal(pedido: PedidoSetor): string {
    return pedido.mesa ? `Mesa ${pedido.mesa}` : 'Balcão';
  }

  protected rotuloAcao(pedido: PedidoSetor): string {
    return pedido.status === 'novo' ? 'Começar a preparar' : 'Marcar como pronto';
  }

  protected ordemDeChegada(pedido: PedidoSetor): number {
    return this.posicoes().get(pedido.id) ?? 0;
  }

  protected minutosEsperando(pedido: PedidoSetor): number {
    return Math.max(0, Math.floor((this.agora() - new Date(pedido.criado_em).getTime()) / 60_000));
  }

  protected espera(pedido: PedidoSetor): string {
    const minutos = this.minutosEsperando(pedido);
    return minutos < 1 ? 'agora' : `há ${duracaoEspera(minutos)}`;
  }

  protected atrasado(pedido: PedidoSetor): boolean {
    return this.minutosEsperando(pedido) >= MINUTOS_ATRASADO;
  }

  /**
   * Toque no cartão: avança na hora, na tela, e só grava depois de alguns
   * segundos. Assim "Desfazer" não chega a mudar o banco, e o cliente não
   * recebe o aviso de "pronto" por um toque errado.
   */
  protected agir(pedido: PedidoSetor): void {
    // Um toque novo confirma o anterior antes de abrir outra janela de desfazer.
    if (this.pendente()) void this.gravarPendente();

    const novoStatus = pedido.status === 'novo' ? 'em_andamento' : 'pronto';
    this.pendente.set({ pedido, novoStatus });
    this.pedidos.update((lista) => this.comPendente(lista));
    this.erro.set(null);
    this.timerPendente = setTimeout(() => void this.gravarPendente(), TEMPO_DESFAZER_MS);
  }

  protected desfazer(): void {
    const mudanca = this.pendente();
    if (!mudanca) return;

    clearTimeout(this.timerPendente);
    this.pendente.set(null);
    this.devolver(mudanca.pedido);
  }

  protected alternarSom(): void {
    const ligado = !this.som();
    this.som.set(ligado);
    guardarSomLigado(ligado);
  }

  protected liberarSom(): void {
    liberarSom();
  }

  /** Novo → em preparo → pronto. Pronto sai da lista. */
  private async gravarPendente(): Promise<void> {
    const mudanca = this.pendente();
    if (!mudanca) return;

    clearTimeout(this.timerPendente);
    this.pendente.set(null);

    try {
      await this.pedidosService.atualizarStatus(mudanca.pedido.itens_ids, mudanca.novoStatus);
    } catch {
      this.devolver(mudanca.pedido);
      this.erro.set('Não foi possível atualizar o pedido. Tente novamente.');
    }
  }

  /** Põe o pedido de volta como estava, na ordem de chegada. */
  private devolver(pedido: PedidoSetor): void {
    this.pedidos.update((lista) =>
      [...lista.filter((p) => p.id !== pedido.id), pedido].sort((a, b) => a.criado_em.localeCompare(b.criado_em)),
    );
  }

  /** A lista do banco ainda não tem a mudança que espera o "Desfazer": aplica por cima. */
  private comPendente(lista: PedidoSetor[]): PedidoSetor[] {
    const mudanca = this.pendente();
    if (!mudanca) return lista;
    const { pedido, novoStatus } = mudanca;
    return novoStatus === 'pronto'
      ? lista.filter((p) => p.id !== pedido.id)
      : lista.map((p) => (p.id === pedido.id ? { ...p, status: novoStatus } : p));
  }

  /** Chegou pedido que a tela ainda não tinha mostrado: som e vibração. */
  private conferirPedidosNovos(lista: PedidoSetor[]): void {
    const novos = lista.filter((p) => p.status === 'novo' && !this.vistos?.has(p.id));
    // Na primeira carga nada é "novo": a tela acabou de abrir.
    if (this.vistos && novos.length > 0 && this.som()) this.avisarPedidoNovo();
    this.vistos = new Set(lista.map((p) => p.id));
  }

  protected avisarPedidoNovo(): void {
    tocarAvisoPedido();
  }
}
