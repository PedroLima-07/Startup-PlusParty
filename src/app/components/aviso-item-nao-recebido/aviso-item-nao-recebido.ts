import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ItemNaoRecebido } from '../../models';
import { ItensNaoRecebidosService } from '../../services/itens-nao-recebidos.service';
import { SupabaseService } from '../../services/supabase.service';

/** Avisa a equipe, em tempo real, que o cliente fechou a conta sem receber um item. */
@Component({
  selector: 'app-aviso-item-nao-recebido',
  imports: [CurrencyPipe],
  templateUrl: './aviso-item-nao-recebido.html',
  styleUrl: './aviso-item-nao-recebido.scss',
})
export class AvisoItemNaoRecebido implements OnInit {
  private readonly servico = inject(ItensNaoRecebidosService);
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly itens = signal<ItemNaoRecebido[]>([]);

  ngOnInit(): void {
    const parar = this.supabase.escutarMudancas([{ tabela: 'itens_nao_recebidos' }], () => void this.carregar());
    this.destroyRef.onDestroy(parar);
    void this.carregar();
  }

  protected async ciente(item: ItemNaoRecebido): Promise<void> {
    this.itens.update((lista) => lista.filter((i) => i.id !== item.id));
    try {
      await this.servico.marcarCiente(item.id);
    } catch {
      await this.carregar();
    }
  }

  private async carregar(): Promise<void> {
    try {
      this.itens.set(await this.servico.pendentesDaEquipe());
    } catch {
      // O aviso é um detalhe da tela: se falhar, o resto continua funcionando.
    }
  }
}
