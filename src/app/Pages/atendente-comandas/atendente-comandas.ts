import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ComandaAtendente } from '../../models';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import {
  ComandaJaMudouError,
  ComandasAtendenteService,
} from '../../services/comandas-atendente.service';
import { Carregando } from '../../components/carregando/carregando';
import { NavAtendente } from '../../components/nav-atendente/nav-atendente';

type Acao = 'liberar' | 'recusar' | 'pagar';

const ROTULOS_STATUS: Record<ComandaAtendente['status'], string> = {
  aguardando_liberacao: 'Aguardando liberação',
  aguardando_pagamento: 'Aguardando pagamento',
  aberta: 'Aberta',
};

const TITULOS_DETALHE: Record<ComandaAtendente['status'], string> = {
  aguardando_liberacao: 'Liberar comanda',
  aguardando_pagamento: 'Conferir pagamento',
  aberta: 'Comanda aberta',
};

/** Quanto tempo "Comanda liberada" e afins ficam na tela. */
const DURACAO_AVISO_MS = 3000;

@Component({
  selector: 'app-atendente-comandas',
  imports: [Carregando, CurrencyPipe, DatePipe, NavAtendente],
  templateUrl: './atendente-comandas.html',
  styleUrl: './atendente-comandas.scss',
})
export class AtendenteComandas implements OnInit {
  private comandasService = inject(ComandasAtendenteService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private router = inject(Router);

  /** Tudo o que a tela mostra sai daqui, já na ordem em que aparece. */
  protected readonly comandas = signal<ComandaAtendente[]>([]);
  protected readonly carregando = signal(true);
  /** Falha ao buscar a lista; some sozinha quando uma busca dá certo. */
  protected readonly erroLista = signal<string | null>(null);
  /** Falha de uma ação (liberar, recusar, confirmar); fica até a próxima ação. */
  protected readonly erro = signal<string | null>(null);
  /** Mensagem temporária depois de uma ação que deu certo. */
  protected readonly aviso = signal<string | null>(null);
  /** Ação em andamento, para travar os botões e trocar o texto de um deles. */
  protected readonly processando = signal<Acao | null>(null);

  private readonly selecionadaId = signal<string | null>(null);

  /**
   * Comanda aberta na tela de detalhe. Sai sempre da lista atual: se o total
   * mudar ou a comanda sumir enquanto a tela está aberta, ela acompanha.
   */
  protected readonly selecionada = computed(
    () => this.comandas().find((comanda) => comanda.id === this.selecionadaId()) ?? null,
  );

  private esperaDoAviso: ReturnType<typeof setTimeout> | undefined;

  async ngOnInit(): Promise<void> {
    // Comanda aberta ou fechada pelo cliente aparece sozinha; itens mudam o total.
    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'comandas' }, { tabela: 'pedido_itens' }],
      () => void this.atualizarLista(true),
    );
    this.destroyRef.onDestroy(() => {
      pararDeEscutar();
      clearTimeout(this.esperaDoAviso);
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

    try {
      const estabelecimentoId = (await this.authService.perfilAtual())?.estabelecimento?.id;
      if (!estabelecimentoId) {
        this.erroLista.set('Sua conta não está ligada a nenhum bar. Saia e entre de novo.');
        return;
      }

      this.comandas.set(await this.comandasService.listar(estabelecimentoId));
      this.erroLista.set(null);
    } catch {
      this.erroLista.set(
        'Não foi possível carregar as comandas. Toque em atualizar para tentar de novo.',
      );
    } finally {
      this.carregando.set(false);
    }
  }

  protected rotuloLocal(comanda: ComandaAtendente): string {
    return comanda.mesa ? `Mesa ${comanda.mesa}` : 'Balcão';
  }

  protected rotuloStatus(comanda: ComandaAtendente): string {
    return ROTULOS_STATUS[comanda.status];
  }

  protected tituloDetalhe(comanda: ComandaAtendente): string {
    return TITULOS_DETALHE[comanda.status];
  }

  /** O id do banco é um UUID; o começo dele basta para falar da comanda no balcão. */
  protected identificador(comanda: ComandaAtendente): string {
    return `#${comanda.id.slice(0, 4).toUpperCase()}`;
  }

  protected abrir(comanda: ComandaAtendente): void {
    this.erro.set(null);
    this.selecionadaId.set(comanda.id);
  }

  protected fechar(): void {
    if (this.processando()) return;
    this.erro.set(null);
    this.selecionadaId.set(null);
  }

  protected async liberar(): Promise<void> {
    await this.executar('liberar', 'Comanda liberada', (comanda) =>
      this.comandasService.liberar(comanda.id),
    );
  }

  protected async recusar(): Promise<void> {
    await this.executar('recusar', 'Comanda recusada', (comanda) =>
      this.comandasService.recusar(comanda.id),
    );
  }

  protected async confirmarPagamento(): Promise<void> {
    await this.executar('pagar', 'Pagamento confirmado', (comanda) =>
      this.comandasService.confirmarPagamento(comanda.id),
    );
  }

  /**
   * Roda a ação na comanda aberta no detalhe. Deu certo: volta para a lista,
   * mostra o aviso e recarrega. Deu errado: fica no detalhe com o erro, a não
   * ser que a comanda já tenha mudado por outro caminho.
   */
  private async executar(
    acao: Acao,
    mensagem: string,
    rodar: (comanda: ComandaAtendente) => Promise<void>,
  ): Promise<void> {
    const comanda = this.selecionada();
    if (!comanda || this.processando()) return;

    this.processando.set(acao);
    this.erro.set(null);

    try {
      await rodar(comanda);
    } catch (erro) {
      this.processando.set(null);
      this.erro.set(mensagemDeErro(erro, acao));
      if (erro instanceof ComandaJaMudouError) {
        this.selecionadaId.set(null);
        await this.atualizarLista(true);
      }
      return;
    }

    // A tela já reflete o resultado antes de a nova consulta voltar.
    this.comandas.update((lista) =>
      acao === 'liberar'
        ? this.comandasService.ordenar(
            lista.map((c) => (c.id === comanda.id ? { ...c, status: 'aberta' as const } : c)),
          )
        : lista.filter((c) => c.id !== comanda.id),
    );
    this.selecionadaId.set(null);
    this.processando.set(null);
    this.avisar(mensagem);

    await this.atualizarLista(true);
  }

  private avisar(mensagem: string): void {
    clearTimeout(this.esperaDoAviso);
    this.aviso.set(mensagem);
    this.esperaDoAviso = setTimeout(() => this.aviso.set(null), DURACAO_AVISO_MS);
  }
}

function mensagemDeErro(erro: unknown, acao: Acao): string {
  if (erro instanceof ComandaJaMudouError) {
    return 'Esta comanda já tinha sido atualizada por outra pessoa. A lista foi recarregada.';
  }

  const codigo = (erro as { code?: string } | null)?.code;

  // Sem o script aplicado, o trigger (P0001) ou a regra da coluna (23514) barram a recusa.
  if (acao === 'recusar' && (codigo === 'P0001' || codigo === '23514')) {
    return 'O banco não aceitou a recusa. Confira se o script supabase/recusar_comanda.sql já foi aplicado.';
  }

  // Erro levantado pelas regras do banco (supabase/protecoes.sql), não por rede.
  if (codigo === 'P0001') {
    return 'Sem permissão para esta ação. Saia e entre de novo com a conta de atendente.';
  }

  return 'Não foi possível atualizar a comanda. Tente novamente.';
}
