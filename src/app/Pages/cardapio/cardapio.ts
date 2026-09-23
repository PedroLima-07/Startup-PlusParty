import { CurrencyPipe, Location } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Item, ItemCarrinho } from '../../models';
import { CardapioService } from '../../services/cardapio.service';
import { ComandaService } from '../../services/comanda.service';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';

type ModoCardapio = 'pedir' | 'visualizar';

@Component({
  selector: 'app-cardapio',
  imports: [CurrencyPipe],
  templateUrl: './cardapio.html',
  styleUrl: './cardapio.scss',
})
export class CardapioPage implements OnInit {
  private location = inject(Location);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private comandaService = inject(ComandaService);
  private cardapioService = inject(CardapioService);
  private estabelecimentosService = inject(EstabelecimentosService);

  /**
   * No modo 'pedir', é o id da comanda. No modo 'visualizar', é o id do
   * estabelecimento direto (não existe comanda nesse fluxo ainda).
   */
  id = input.required<string>();

  protected readonly modo: ModoCardapio = this.route.snapshot.data['modo'] ?? 'pedir';

  protected readonly carregando = signal(true);
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly nomeEstabelecimento = signal('');
  protected readonly categorias = signal<[string, Item[]][]>([]);
  protected readonly carrinho = signal<Map<string, number>>(new Map());

  private itensPorId = new Map<string, Item>();
  private comandaId: string | null = null;

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
    let estabelecimentoId: string;

    if (this.modo === 'visualizar') {
      estabelecimentoId = this.id();
      const estabelecimento = await this.estabelecimentosService.buscarPorId(estabelecimentoId);
      this.nomeEstabelecimento.set(estabelecimento?.nome ?? '');
    } else {
      this.comandaId = this.id();
      const comanda = await this.comandaService.buscarComanda(this.comandaId);
      estabelecimentoId = comanda.estabelecimento_id;
      this.nomeEstabelecimento.set(comanda.estabelecimento.nome);
    }

    const itens = await this.cardapioService.buscarCardapio(estabelecimentoId);
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
    if (this.totalItensCarrinho() === 0 || this.enviando() || !this.comandaId) return;

    this.enviando.set(true);
    this.erro.set(null);

    const itensCarrinho: ItemCarrinho[] = Array.from(this.carrinho().entries())
      .map(([itemId, quantidade]): ItemCarrinho | null => {
        const item = this.itensPorId.get(itemId);
        return item ? { item, quantidade } : null;
      })
      .filter((itemCarrinho): itemCarrinho is ItemCarrinho => itemCarrinho !== null);

    try {
      await this.cardapioService.confirmarPedido(this.comandaId, itensCarrinho);
      void this.router.navigate(['/cliente/comanda', this.comandaId]);
    } catch {
      this.erro.set('Não foi possível confirmar o pedido agora. Tente novamente.');
      this.enviando.set(false);
    }
  }

  protected voltar(): void {
    this.location.back();
  }
}
