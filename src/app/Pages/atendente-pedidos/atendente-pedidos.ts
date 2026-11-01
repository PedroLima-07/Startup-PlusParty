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
import { NavAtendente } from '../../components/nav-atendente/nav-atendente';
import { telaDesktop } from '../../tela';

type AcaoModal = 'comecar' | 'pronto';

/** A partir de quantos minutos o pedido parado ganha o selo laranja (o mesmo alerta do gerente). */
export const MINUTOS_ATRASADO = 15;

/** De quanto em quanto tempo o "há X min" dos cartões é recalculado. */
const ATUALIZAR_ESPERA_MS = 30_000;

interface Coluna {
  status: Exclude<StatusPedidoItem, 'pronto'>;
  titulo: string;
  vazio: string;
  pedidos: PedidoSetor[];
}

@Component({
  selector: 'app-atendente-pedidos',
  imports: [AvisoItemNaoRecebido, BotaoAtualizar, Carregando, DatePipe, NavAtendente, NgClass],
  templateUrl: './atendente-pedidos.html',
  styleUrls: ['./atendente-pedidos.scss', './atendente-pedidos.desktop.scss'],
})
export class AtendentePedidos implements OnInit {
  private pedidosService = inject(PedidosAtendenteService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private router = inject(Router);

  /** No desktop o botão do cartão já age; no celular abre a confirmação. */
  private readonly desktop = telaDesktop();

  protected readonly abaAtiva = signal<SetorItem>('bar');
  protected readonly pedidos = signal<PedidoSetor[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  /** Pedido com uma mudança em andamento, para o botão dele mostrar "Salvando...". */
  protected readonly salvandoId = signal<string | null>(null);
  protected readonly erro = signal<string | null>(null);
  private readonly agora = signal(Date.now());

  protected readonly pedidoSelecionado = signal<PedidoSetor | null>(null);
  protected readonly acaoModal = computed<AcaoModal | null>(() => {
    const pedido = this.pedidoSelecionado();
    if (!pedido) return null;
    return pedido.status === 'novo' ? 'comecar' : 'pronto';
  });

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
      this.pedidos.set(await this.pedidosService.listarPendentes());
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

  /** Toque no cartão: no desktop muda direto; no celular pergunta antes. */
  protected agir(pedido: PedidoSetor): void {
    if (this.desktop()) {
      void this.mudarStatus(pedido);
    } else {
      this.abrirAcao(pedido);
    }
  }

  protected abrirAcao(pedido: PedidoSetor): void {
    this.pedidoSelecionado.set(pedido);
  }

  protected fecharModal(): void {
    if (this.salvando()) return;
    this.pedidoSelecionado.set(null);
  }

  protected async confirmarAcao(): Promise<void> {
    const pedido = this.pedidoSelecionado();
    if (!pedido) return;

    await this.mudarStatus(pedido);
    this.pedidoSelecionado.set(null);
  }

  /** Novo → em preparo → pronto. Pronto sai da lista. */
  private async mudarStatus(pedido: PedidoSetor): Promise<void> {
    if (this.salvando()) return;

    const novoStatus = pedido.status === 'novo' ? 'em_andamento' : 'pronto';
    this.salvando.set(true);
    this.salvandoId.set(pedido.id);
    this.erro.set(null);

    try {
      await this.pedidosService.atualizarStatus(pedido.itens_ids, novoStatus);

      this.pedidos.update((lista) =>
        novoStatus === 'pronto'
          ? lista.filter((p) => p.id !== pedido.id)
          : lista.map((p) => (p.id === pedido.id ? { ...p, status: novoStatus } : p)),
      );
    } catch {
      this.erro.set('Não foi possível atualizar o pedido. Tente novamente.');
    } finally {
      this.salvando.set(false);
      this.salvandoId.set(null);
    }
  }
}
