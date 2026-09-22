import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatusPedidoItem = 'novo' | 'em_andamento' | 'pronto';
export type Setor = 'bar' | 'cozinha';

export interface PedidoAgrupado {
  id: string; // Chave virtual gerada (pedido_id + setor)
  pedido_id: string;
  mesa: string;
  cliente: string;
  criado_em: Date;
  status: StatusPedidoItem;
  setor: Setor;
  itens_ids: string[]; // Guardado para o update em lote no Supabase futuramente
  itens: { nome: string; quantidade: number }[];
}

@Component({
  selector: 'app-atendente-pedidos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './atendente-pedidos.html',
  styleUrls: ['./atendente-pedidos.scss']
})

export class AtendentePedidos implements OnInit {
  abaAtiva: Setor = 'bar';
  pedidos: PedidoAgrupado[] = [];

  // Controle de Pop-up (Modal)
  pedidoSelecionado: PedidoAgrupado | null = null;
  acaoModal: 'comecar' | 'pronto' | null = null;

  ngOnInit() {
    this.carregarPedidosMock();
  }

  // Estratégia recomendada: Dados fixos simulando o retorno do Supabase
  carregarPedidosMock() {
    const rawDados = [
      { id: 'i1', quantidade: 2, status: 'novo', pedido_id: 'p1', itens: { nome: 'Chope Pilsen', setor: 'bar' }, pedidos: { criado_em: '2026-09-22T22:00:00Z', comandas: { mesa: '12', perfis: { nome: 'Carlos' } } } },
      { id: 'i2', quantidade: 1, status: 'novo', pedido_id: 'p1', itens: { nome: 'Batata Frita', setor: 'cozinha' }, pedidos: { criado_em: '2026-09-22T22:00:00Z', comandas: { mesa: '12', perfis: { nome: 'Carlos' } } } },
      { id: 'i3', quantidade: 1, status: 'em_andamento', pedido_id: 'p2', itens: { nome: 'Caipirinha', setor: 'bar' }, pedidos: { criado_em: '2026-09-22T21:45:00Z', comandas: { mesa: null, perfis: { nome: 'Mariana' } } } },
      { id: 'i4', quantidade: 3, status: 'novo', pedido_id: 'p3', itens: { nome: 'Hambúrguer Clássico', setor: 'cozinha' }, pedidos: { criado_em: '2026-09-22T22:05:00Z', comandas: { mesa: '04', perfis: { nome: 'Roberto' } } } }
    ];

    this.pedidos = this.agruparPedidos(rawDados as any);
  }

  atualizarLista() {
    // Ação do botão de recarregar do cabeçalho
    this.carregarPedidosMock();
  }

  // Agrupa por pedido_id e setor, e ordena por ordem de chegada
  agruparPedidos(raw: any[]): PedidoAgrupado[] {
    const mapa = new Map<string, PedidoAgrupado>();

    raw.forEach(item => {
      if (item.status === 'pronto') return; // Pedidos prontos saem da lista

      const setor = item.itens.setor;
      const pedido_id = item.pedido_id;
      const chave = `${pedido_id}-${setor}`;

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          id: chave,
          pedido_id: pedido_id,
          mesa: item.pedidos.comandas.mesa || 'Balcão',
          cliente: item.pedidos.comandas.perfis.nome,
          criado_em: new Date(item.pedidos.criado_em),
          status: item.status,
          setor: setor,
          itens_ids: [],
          itens: []
        });
      }

      const grupo = mapa.get(chave)!;
      grupo.itens_ids.push(item.id);
      grupo.itens.push({ nome: item.itens.nome, quantidade: item.quantidade });
    });

    // Ordem de chegada: o mais antigo no topo
    return Array.from(mapa.values()).sort((a, b) => a.criado_em.getTime() - b.criado_em.getTime());
  }

  get pedidosFiltrados() {
    return this.pedidos.filter(p => p.setor === this.abaAtiva);
  }

  // Lógica de abertura do pop-up
  abrirAcao(pedido: PedidoAgrupado) {
    if (pedido.status === 'novo') {
      this.pedidoSelecionado = pedido;
      this.acaoModal = 'comecar';
    } else if (pedido.status === 'em_andamento') {
      this.pedidoSelecionado = pedido;
      this.acaoModal = 'pronto';
    }
  }

  fecharModal() {
    this.pedidoSelecionado = null;
    this.acaoModal = null;
  }

  confirmarAcao() {
    if (!this.pedidoSelecionado) return;

    if (this.acaoModal === 'comecar') {
      this.pedidoSelecionado.status = 'em_andamento';
      // Futuro: this.pedidosService.atualizarStatus(this.pedidoSelecionado.itens_ids, 'em_andamento')
    } else if (this.acaoModal === 'pronto') {
      this.pedidoSelecionado.status = 'pronto';
      // Futuro: this.pedidosService.atualizarStatus(this.pedidoSelecionado.itens_ids, 'pronto')
      
      // Sai da lista
      this.pedidos = this.pedidos.filter(p => p.id !== this.pedidoSelecionado!.id);
    }

    this.fecharModal();
  }
}