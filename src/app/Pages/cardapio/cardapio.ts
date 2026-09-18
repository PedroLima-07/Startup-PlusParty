import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ComandaDetalhada, Item, ItemCarrinho } from '../../models';
import { CardapioService } from '../../services/cardapio.service';
import { ComandaService } from '../../services/comanda.service';

@Component({
  selector: 'app-cardapio',
  imports: [CurrencyPipe],
  templateUrl: './cardapio.html',
  styleUrl: './cardapio.scss',
})
export class CardapioPage implements OnInit {
  private router = inject(Router);
  private comandaService = inject(ComandaService);
  private cardapioService = inject(CardapioService);

  /** id da comanda (a rota reaproveita o mesmo :id da tela de Comanda). */
  id = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly comanda = signal<ComandaDetalhada | null>(null);
  protected readonly categorias = signal<[string, Item[]][]>([]);
  protected readonly carrinho = signal<Map<string, number>>(new Map());

  private itensPorId = new Map<string, Item>();

  protected readonly totalItensCarrinho = computed(() =>
    Array.from(this.carrinho().values()).reduce((total, quantidade) => total + quantidade, 0),
  );

  protected readonly totalCarrinho = computed(() => {
    let total = 0;
    for (const [itemId, quantidade] of this.carrinho()) {
      const item = this.itensPorId.get(itemId);
      if (item) total += item.preco * quantidade;
    }
    return total;
  });

  async ngOnInit(): Promise<void> {
    const comanda = await this.comandaService.buscarComanda(this.id());
    this.comanda.set(comanda);

    const itens = await this.cardapioService.buscarCardapio(comanda.estabelecimento_id);
    this.itensPorId = new Map(itens.map((item) => [item.id, item]));
    this.categorias.set(Object.entries(this.cardapioService.agruparPorCategoria(itens)));

    this.carregando.set(false);
  }

  protected quantidadeDe(itemId: string): number {
    return this.carrinho().get(itemId) ?? 0;
  }

  protected adicionar(itemId: string): void {
    const atual = new Map(this.carrinho());
    atual.set(itemId, (atual.get(itemId) ?? 0) + 1);
    this.carrinho.set(atual);
  }

  protected remover(itemId: string): void {
    const atual = new Map(this.carrinho());
    const quantidade = (atual.get(itemId) ?? 0) - 1;

    if (quantidade <= 0) {
      atual.delete(itemId);
    } else {
      atual.set(itemId, quantidade);
    }

    this.carrinho.set(atual);
  }

  protected async confirmarPedido(): Promise<void> {
    if (this.totalItensCarrinho() === 0 || this.enviando()) return;

    this.enviando.set(true);
    this.erro.set(null);

    const itensCarrinho: ItemCarrinho[] = Array.from(this.carrinho().entries())
      .map(([itemId, quantidade]): ItemCarrinho | null => {
        const item = this.itensPorId.get(itemId);
        return item ? { item, quantidade } : null;
      })
      .filter((itemCarrinho): itemCarrinho is ItemCarrinho => itemCarrinho !== null);

    try {
      await this.cardapioService.confirmarPedido(this.id(), itensCarrinho);
      void this.router.navigate(['/comanda', this.id()]);
    } catch {
      this.erro.set('Não foi possível confirmar o pedido agora. Tente novamente.');
      this.enviando.set(false);
    }
  }

  protected voltar(): void {
    void this.router.navigate(['/comanda', this.id()]);
  }
}
