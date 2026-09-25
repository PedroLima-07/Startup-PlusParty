import { DatePipe, NgClass } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PedidoSetor, SetorItem } from '../../models';
import { PedidosAtendenteService } from '../../services/pedidos-atendente.service';

type AcaoModal = 'comecar' | 'pronto';

@Component({
  selector: 'app-atendente-pedidos',
  imports: [DatePipe, NgClass, RouterLink, RouterLinkActive],
  templateUrl: './atendente-pedidos.html',
  styleUrls: ['./atendente-pedidos.scss'],
})
export class AtendentePedidos implements OnInit {
  private pedidosService = inject(PedidosAtendenteService);

  protected readonly abaAtiva = signal<SetorItem>('bar');
  protected readonly pedidos = signal<PedidoSetor[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly pedidoSelecionado = signal<PedidoSetor | null>(null);
  protected readonly acaoModal = computed<AcaoModal | null>(() => {
    const pedido = this.pedidoSelecionado();
    if (!pedido) return null;
    return pedido.status === 'novo' ? 'comecar' : 'pronto';
  });

  protected readonly pedidosFiltrados = computed(() =>
    this.pedidos().filter((pedido) => pedido.setor === this.abaAtiva()),
  );

  async ngOnInit(): Promise<void> {
    await this.atualizarLista();
  }

  protected async atualizarLista(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);

    try {
      this.pedidos.set(await this.pedidosService.listarPendentes());
    } catch {
      this.erro.set('Não foi possível carregar os pedidos. Toque em atualizar para tentar de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected rotuloLocal(pedido: PedidoSetor): string {
    return pedido.mesa ? `Mesa ${pedido.mesa}` : 'Balcão';
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
    if (!pedido || this.salvando()) return;

    const novoStatus = pedido.status === 'novo' ? 'em_andamento' : 'pronto';
    this.salvando.set(true);
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
      this.pedidoSelecionado.set(null);
    }
  }
}
