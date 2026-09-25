import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ComandaPendente } from '../../models';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { ComandasAtendenteService } from '../../services/comandas-atendente.service';

@Component({
  selector: 'app-atendente-comandas',
  imports: [CurrencyPipe, DatePipe, RouterLink, RouterLinkActive],
  templateUrl: './atendente-comandas.html',
  styleUrl: './atendente-comandas.scss',
})
export class AtendenteComandas implements OnInit {
  private comandasService = inject(ComandasAtendenteService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private router = inject(Router);

  protected readonly comandas = signal<ComandaPendente[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  /** id da comanda com uma ação em andamento, para travar o botão dela. */
  protected readonly processando = signal<string | null>(null);
  protected readonly pagamentoEmConfirmacao = signal<ComandaPendente | null>(null);

  protected readonly aguardandoLiberacao = computed(() =>
    this.comandas().filter((c) => c.status === 'aguardando_liberacao'),
  );
  protected readonly aguardandoPagamento = computed(() =>
    this.comandas().filter((c) => c.status === 'aguardando_pagamento'),
  );

  async ngOnInit(): Promise<void> {
    // Comanda aberta ou fechada pelo cliente aparece sozinha; itens mudam o total.
    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'comandas' }, { tabela: 'pedido_itens' }],
      () => void this.atualizarLista(true),
    );
    this.destroyRef.onDestroy(pararDeEscutar);

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
      this.comandas.set(await this.comandasService.listarPendentes());
    } catch {
      this.erro.set('Não foi possível carregar as comandas. Toque em atualizar para tentar de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected rotuloLocal(comanda: ComandaPendente): string {
    return comanda.mesa ? `Mesa ${comanda.mesa}` : 'Balcão';
  }

  protected async liberar(comanda: ComandaPendente): Promise<void> {
    await this.executar(comanda, () => this.comandasService.liberar(comanda.id));
  }

  protected pedirConfirmacaoPagamento(comanda: ComandaPendente): void {
    this.pagamentoEmConfirmacao.set(comanda);
  }

  protected cancelarPagamento(): void {
    if (this.processando()) return;
    this.pagamentoEmConfirmacao.set(null);
  }

  protected async confirmarPagamento(): Promise<void> {
    const comanda = this.pagamentoEmConfirmacao();
    if (!comanda) return;

    await this.executar(comanda, () => this.comandasService.confirmarPagamento(comanda.id));
    this.pagamentoEmConfirmacao.set(null);
  }

  /** Roda a ação e, se der certo, tira a comanda da lista. */
  private async executar(comanda: ComandaPendente, acao: () => Promise<void>): Promise<void> {
    if (this.processando()) return;

    this.processando.set(comanda.id);
    this.erro.set(null);

    try {
      await acao();
      this.comandas.update((lista) => lista.filter((c) => c.id !== comanda.id));
    } catch {
      this.erro.set('Não foi possível atualizar a comanda. Tente novamente.');
    } finally {
      this.processando.set(null);
    }
  }
}
