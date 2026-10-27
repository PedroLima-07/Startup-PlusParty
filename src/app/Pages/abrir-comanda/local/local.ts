import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { ContaPendente, Estabelecimento } from '../../../models';
import {
  ComandaAtiva,
  ComandaEmOutroLugarError,
  ComandaService,
  ContaPendenteError,
} from '../../../services/comanda.service';
import { AuthService } from '../../../services/auth.service';
import { EstabelecimentosService } from '../../../services/estabelecimentos.service';
import { SupabaseService } from '../../../services/supabase.service';
import { minutosDesde, relogio } from '../../../tempo';
import { NavCliente } from '../../../components/nav-cliente/nav-cliente';
import { Carregando } from '../../../components/carregando/carregando';
import { ErroCarregar } from '../../../components/erro-carregar/erro-carregar';

@Component({
  selector: 'app-abrir-comanda-local',
  standalone: true,
  imports: [Carregando, CurrencyPipe, DatePipe, ErroCarregar, FormsModule, NavCliente],
  templateUrl: './local.html',
  styleUrls: ['./local.scss', './local.comanda-ativa.scss'],
})
export class AbrirComandaLocalComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly comandaService = inject(ComandaService);
  private readonly estabelecimentosService = inject(EstabelecimentosService);
  private readonly authService = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly agora = relogio();

  /** id do estabelecimento (vem da rota, ex: a partir do Perfil do bar). */
  id = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly erroCarregar = signal(false);
  protected readonly estabelecimento = signal<Estabelecimento | null>(null);

  localSelecionado: 'mesa' | 'balcao' | null = null;
  numeroMesa = '';
  protected readonly mensagem = signal('');
  protected readonly salvando = signal(false);

  /** Conta fechada e não paga: no lugar das opções aparece o aviso para pagar antes. */
  protected readonly contaPendente = signal<ContaPendente | null>(null);
  /** Comanda que já está aberta (nesta aba antes, em outra aba ou em outro aparelho). */
  protected readonly comandaAberta = signal<ComandaAtiva | null>(null);

  protected readonly minutosEsperandoPagamento = computed(() => {
    const conta = this.contaPendente();
    return conta?.fechada_em ? minutosDesde(conta.fechada_em, this.agora()) : null;
  });

  async ngOnInit(): Promise<void> {
    await this.carregar();
    await this.escutarComandasDoCliente();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erroCarregar.set(false);

    try {
      const [estabelecimento] = await Promise.all([
        this.estabelecimentosService.buscarPorId(this.id()),
        this.verificarComandaAtiva(),
      ]);
      this.estabelecimento.set(estabelecimento);
    } catch {
      this.erroCarregar.set(true);
    } finally {
      this.carregando.set(false);
    }
  }

  selecionarLocal(local: 'mesa' | 'balcao'): void {
    this.localSelecionado = local;

    if (local === 'balcao') {
      this.numeroMesa = '';
    }
  }

  podeAbrirComanda(): boolean {
    if (this.salvando()) return false;

    if (this.localSelecionado === 'balcao') {
      return true;
    }

    return this.localSelecionado === 'mesa' && this.numeroMesa.trim().length > 0;
  }

  async abrirComanda(): Promise<void> {
    if (!this.podeAbrirComanda()) {
      return;
    }

    this.salvando.set(true);
    this.mensagem.set('');

    try {
      const mesa = this.localSelecionado === 'mesa' ? this.numeroMesa.trim() : null;
      const comanda = await this.comandaService.abrirComanda(this.id(), mesa);
      void this.router.navigate(['/cliente/comanda', comanda.id]);
    } catch (erro) {
      if (erro instanceof ContaPendenteError) {
        this.contaPendente.set(erro.conta);
      } else {
        this.mensagem.set(
          erro instanceof ComandaEmOutroLugarError
            ? `Você já tem uma comanda aberta no ${erro.nomeEstabelecimento}. Pague ela antes de abrir outra.`
            : 'Não foi possível abrir a comanda agora. Tente novamente.',
        );
      }
      this.salvando.set(false);
    }
  }

  protected verComanda(id: string): void {
    void this.router.navigate(['/cliente/comanda', id]);
  }

  /**
   * Mostra o que já prende o cliente: a conta a pagar ou a comanda aberta.
   * Uma falha aqui não impede a tela: o banco recusa a segunda comanda de
   * qualquer jeito, e abrirComanda trata a recusa.
   */
  private async verificarComandaAtiva(): Promise<void> {
    try {
      const ativa = await this.comandaService.buscarComandaAtiva();
      if (ativa?.status === 'aguardando_pagamento') {
        this.contaPendente.set({
          id: ativa.id,
          estabelecimento: ativa.estabelecimento,
          mesa: ativa.mesa,
          fechada_em: ativa.fechada_em,
          total: ativa.total,
        });
        this.comandaAberta.set(null);
      } else {
        this.contaPendente.set(null);
        this.comandaAberta.set(ativa);
      }
    } catch {
      // Segue sem o aviso.
    }
  }

  /** Se outra aba ou outro aparelho abrir uma comanda, esta tela fica sabendo na hora. */
  private async escutarComandasDoCliente(): Promise<void> {
    const usuario = await this.authService.usuarioAtual();
    if (!usuario) return;

    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'comandas', filtro: `usuario_id=eq.${usuario.id}` }],
      () => {
        // A comanda que esta própria aba está abrindo leva o cliente para ela.
        if (!this.salvando()) void this.verificarComandaAtiva();
      },
    );
    this.destroyRef.onDestroy(pararDeEscutar);
  }

  voltar(): void {
    void this.router.navigate(['/cliente/estabelecimento', this.id()]);
  }
}
