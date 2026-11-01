import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { ContaPendente, EsperaNaFila, Estabelecimento, SituacaoMesa } from '../../../models';
import {
  ComandaAtiva,
  ComandaEmOutroLugarError,
  ComandaService,
  ContaPendenteError,
} from '../../../services/comanda.service';
import { AuthService } from '../../../services/auth.service';
import { EstabelecimentosService } from '../../../services/estabelecimentos.service';
import { SupabaseService } from '../../../services/supabase.service';
import { minutosDesde, relogio, duracaoEspera } from '../../../tempo';

/** De quanto em quanto tempo a posição na fila é conferida. */
const ATUALIZAR_FILA_MS = 20_000;
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

  /** A mesa digitada não está livre: pergunta antes de abrir. */
  protected readonly pergunta = signal<Exclude<SituacaoMesa, 'livre'> | null>(null);
  /** O cliente está na fila de uma mesa deste bar. */
  protected readonly fila = signal<EsperaNaFila | null>(null);
  protected readonly mexendoNaFila = signal(false);

  protected readonly duracao = duracaoEspera;
  protected readonly minutosEsperandoPagamento = computed(() => {
    const conta = this.contaPendente();
    return conta?.fechada_em ? minutosDesde(conta.fechada_em, this.agora()) : null;
  });

  constructor() {
    // Na fila, a posição anda quando quem está na frente é chamado ou sai.
    const relogioDaFila = setInterval(() => {
      if (this.fila()) void this.verificarFila();
    }, ATUALIZAR_FILA_MS);
    this.destroyRef.onDestroy(() => clearInterval(relogioDaFila));
  }

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
        this.verificarFila(),
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

  /** `comOGrupo`: o cliente já confirmou que está com quem usa a mesa. */
  async abrirComanda(comOGrupo = false): Promise<void> {
    if (!this.podeAbrirComanda()) {
      return;
    }

    this.salvando.set(true);
    this.mensagem.set('');

    try {
      const mesa = this.localSelecionado === 'mesa' ? this.numeroMesa.trim() : null;
      if (mesa && !comOGrupo) {
        const situacao = await this.situacaoDaMesa(mesa);
        if (situacao !== 'livre') {
          this.pergunta.set(situacao);
          this.salvando.set(false);
          return;
        }
      }
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

  protected async estouComOGrupo(): Promise<void> {
    this.pergunta.set(null);
    await this.abrirComanda(true);
  }

  protected escolherOutraMesa(): void {
    this.pergunta.set(null);
    this.numeroMesa = '';
  }

  protected async entrarNaFila(): Promise<void> {
    if (this.mexendoNaFila()) return;
    this.mexendoNaFila.set(true);
    try {
      await this.comandaService.entrarNaFila(this.id(), this.numeroMesa.trim());
      this.pergunta.set(null);
      await this.verificarFila();
    } catch {
      this.pergunta.set(null);
      this.mensagem.set('Não foi possível entrar na fila. A mesa pode ter acabado de liberar: tente abrir a comanda de novo.');
    } finally {
      this.mexendoNaFila.set(false);
    }
  }

  protected async sairDaFila(): Promise<void> {
    if (this.mexendoNaFila()) return;
    this.mexendoNaFila.set(true);
    try {
      await this.comandaService.sairDaFila();
      this.fila.set(null);
    } catch {
      this.mensagem.set('Não foi possível sair da fila agora. Tente de novo.');
    } finally {
      this.mexendoNaFila.set(false);
    }
  }

  /** Sem resposta do banco, segue como livre: a liberação do atendente confere. */
  private async situacaoDaMesa(mesa: string): Promise<SituacaoMesa> {
    try {
      return await this.comandaService.situacaoMesa(this.id(), mesa);
    } catch {
      return 'livre';
    }
  }

  /** A espera do cliente na fila deste bar (a de outro bar não aparece aqui). */
  private async verificarFila(): Promise<void> {
    try {
      const espera = await this.comandaService.minhaFila();
      this.fila.set(espera?.estabelecimento_id === this.id() ? espera : null);
    } catch {
      // Segue com o que já estava na tela.
    }
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
        if (!this.salvando()) {
          void this.verificarComandaAtiva();
          // A mesa da fila liberou: o banco abriu a comanda e a fila acabou.
          void this.verificarFila();
        }
      },
    );
    this.destroyRef.onDestroy(pararDeEscutar);
  }

  voltar(): void {
    void this.router.navigate(['/cliente/estabelecimento', this.id()]);
  }
}
