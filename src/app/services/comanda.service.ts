import { Injectable, computed, signal } from '@angular/core';
import { ComandaState, ItemPedido, TipoLocal } from '../models';

/**
 * Mantém o estado da comanda em memória (mock).
 * A integração com o Supabase entra nos métodos marcados com TODO.
 */
@Injectable({
  providedIn: 'root',
})
export class ComandaService {
  // TODO: integrar Supabase — nome real do estabelecimento vem da tabela
  private readonly BAR_NOME_MOCK = "Bar D'Zé";

  private readonly estado = signal<ComandaState | null>(null);

  readonly comanda = this.estado.asReadonly();

  readonly total = computed(() => {
    const comanda = this.estado();
    if (!comanda) return 0;
    return comanda.itens.reduce(
      (soma, item) => soma + item.quantidade * item.precoUnitario,
      0,
    );
  });

  // TODO: integrar Supabase — inserir a comanda no banco e aguardar liberação
  abrirComanda(tipoLocal: TipoLocal, numeroMesa?: string): void {
    this.estado.set({
      barNome: this.BAR_NOME_MOCK,
      tipoLocal,
      numeroMesa: tipoLocal === 'mesa' ? numeroMesa : undefined,
      itens: [],
    });
  }

  adicionarItem(item: ItemPedido): void {
    const comanda = this.estado();
    if (!comanda) return;

    this.estado.update((atual) =>
      atual ? { ...atual, itens: [...atual.itens, item] } : atual,
    );
  }

  // TODO: integrar Supabase — registrar fechamento e aguardar confirmação do caixa
  fecharConta(): void {
    this.estado.set(null);
  }
}