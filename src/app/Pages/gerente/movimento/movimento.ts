import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AlertaGerente,
  ComandaResumo,
  MINUTOS_ALERTA_PAGAMENTO,
  StatusComanda,
  StatusPedidoItem,
  TipoAlertaGerente,
} from '../../../models';
import { Carregando } from '../../../components/carregando/carregando';
import { AuthService } from '../../../services/auth.service';
import { MovimentoService } from '../../../services/movimento.service';
import { SupabaseService } from '../../../services/supabase.service';
import { Icone, NomeIcone } from '../componentes/icone';

type Filtro = 'todas' | ComandaResumo['status'];

/**
 * Os alertas dependem de quanto tempo passou (pedido parado há 15 min etc.),
 * então o painel também se atualiza sozinho de tempos em tempos.
 */
const INTERVALO_ATUALIZACAO_MS = 60_000;

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'aberta', rotulo: 'Abertas' },
  { valor: 'aguardando_pagamento', rotulo: 'Aguardando pagamento' },
  { valor: 'paga', rotulo: 'Pagas' },
];

const ROTULOS_STATUS: Record<ComandaResumo['status'], string> = {
  aberta: 'Aberta',
  aguardando_pagamento: 'Aguardando pagamento',
  paga: 'Paga',
  nao_paga: 'Não paga',
};

const ROTULOS_ITEM: Record<StatusPedidoItem, string> = {
  novo: 'Novo',
  em_andamento: 'Em preparo',
  pronto: 'Pronto',
};

/** Como cada tipo de alerta aparece: o ícone e o texto do botão. */
const APARENCIA_ALERTA: Record<TipoAlertaGerente, { icone: NomeIcone; acao: string }> = {
  pagamento: { icone: 'alerta', acao: 'Ver detalhes' },
  pedido_parado: { icone: 'relogio', acao: 'Ver na cozinha' },
  liberacao: { icone: 'relogio', acao: 'Avisar atendente' },
  sem_pedido: { icone: 'casa', acao: 'Ver comanda' },
};

/** Painel principal do gerente: o que precisa de atenção, o faturamento e as comandas do dia. */
@Component({
  selector: 'app-movimento',
  imports: [Carregando, CurrencyPipe, DatePipe, Icone, RouterLink],
  templateUrl: './movimento.html',
  styleUrls: ['./movimento.scss', './movimento.desktop.scss', './movimento.nao-paga.scss'],
  host: { '(document:keydown.escape)': 'aoApertarEsc()' },
})
export class Movimento implements OnInit {
  protected readonly movimento = inject(MovimentoService);
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);

  protected readonly filtros = FILTROS;
  protected readonly limitePagamento = MINUTOS_ALERTA_PAGAMENTO;
  protected readonly hoje = new Date();
  protected readonly nomeDoBar = signal('');
  protected readonly filtro = signal<Filtro>('todas');
  protected readonly busca = signal('');
  /** O olho do cartão de faturamento: esconde os valores de quem está olhando por cima do ombro. */
  protected readonly valoresOcultos = signal(false);
  /** Alertas de liberação em que o gerente já tocou em "Avisar atendente". */
  protected readonly avisados = signal<ReadonlySet<string>>(new Set());

  /** Id da comanda com o detalhe aberto. */
  protected readonly comandaAberta = signal<string | null>(null);
  /** Recalcula a cada atualização, então o detalhe aberto acompanha o banco. */
  protected readonly detalhe = computed(() => {
    const id = this.comandaAberta();
    return id ? this.movimento.detalhe(id) : null;
  });

  /** A confirmação de "não paga" está aberta por cima do detalhe. */
  protected readonly confirmandoNaoPaga = signal(false);
  protected readonly marcandoNaoPaga = signal(false);
  protected readonly erroNaoPaga = signal<string | null>(null);

  /** Antes da primeira resposta do banco os números seriam zeros enganosos. */
  protected readonly carregandoPrimeiraVez = computed(
    () => this.movimento.atualizadoEm() === null && this.movimento.erro() === null,
  );

  protected readonly comandasFiltradas = computed(() => {
    const filtro = this.filtro();
    const termo = this.busca().trim().toLocaleLowerCase();

    return this.movimento.comandas().filter((comanda) => {
      if (filtro !== 'todas' && comanda.status !== filtro) return false;
      if (!termo) return true;

      return [comanda.numero, comanda.cliente, this.local(comanda)].some((texto) =>
        texto.toLocaleLowerCase().includes(termo),
      );
    });
  });

  async ngOnInit(): Promise<void> {
    // Comanda aberta, paga ou pedido novo mudam os números sem recarregar a página.
    const atualizar = () => void this.movimento.atualizar();
    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'comandas' }, { tabela: 'pedido_itens' }],
      atualizar,
    );
    const relogio = setInterval(atualizar, INTERVALO_ATUALIZACAO_MS);
    this.destroyRef.onDestroy(() => {
      pararDeEscutar();
      clearInterval(relogio);
    });
    atualizar();

    const nome = await this.authService.buscarNomeEstabelecimentoAtual().catch(() => null);
    this.nomeDoBar.set(nome ?? '');
  }

  protected aparencia(alerta: AlertaGerente): { icone: NomeIcone; acao: string } {
    return APARENCIA_ALERTA[alerta.tipo];
  }

  protected rotuloStatus(comanda: ComandaResumo): string {
    return ROTULOS_STATUS[comanda.status];
  }

  protected local(comanda: ComandaResumo): string {
    return comanda.mesa === 'Balcão' ? 'Balcão' : `Mesa ${comanda.mesa}`;
  }

  /**
   * Botão do alerta. Os que apontam para uma comanda abrem o detalhe dela; o de
   * liberação marca que o atendente foi avisado. Nenhum tira o alerta da lista.
   */
  protected agir(alerta: AlertaGerente): void {
    if (alerta.comanda) {
      const comanda = this.movimento.comandas().find((c) => c.numero === alerta.comanda);
      if (comanda) this.comandaAberta.set(comanda.id);
      return;
    }

    this.avisados.update((avisados) => new Set(avisados).add(alerta.id));
  }

  protected abrirDetalhe(comanda: ComandaResumo): void {
    this.comandaAberta.set(comanda.id);
  }

  protected fecharDetalhe(): void {
    if (this.marcandoNaoPaga()) return;
    this.cancelarNaoPaga();
    this.comandaAberta.set(null);
  }

  /** Esc fecha primeiro a confirmação; com ela fechada, o detalhe. */
  protected aoApertarEsc(): void {
    if (this.confirmandoNaoPaga()) this.cancelarNaoPaga();
    else this.fecharDetalhe();
  }

  protected pedirConfirmacaoNaoPaga(): void {
    this.erroNaoPaga.set(null);
    this.confirmandoNaoPaga.set(true);
  }

  protected cancelarNaoPaga(): void {
    if (this.marcandoNaoPaga()) return;
    this.confirmandoNaoPaga.set(false);
    this.erroNaoPaga.set(null);
  }

  protected async confirmarNaoPaga(): Promise<void> {
    const id = this.comandaAberta();
    if (!id || this.marcandoNaoPaga()) return;

    this.marcandoNaoPaga.set(true);
    this.erroNaoPaga.set(null);
    try {
      await this.movimento.marcarNaoPaga(id);
      this.confirmandoNaoPaga.set(false);
    } catch {
      this.erroNaoPaga.set('Não foi possível marcar agora. Atualize o painel e tente de novo.');
    } finally {
      this.marcandoNaoPaga.set(false);
    }
  }

  protected rotuloStatusDetalhe(status: StatusComanda): string {
    if (status === 'aguardando_liberacao') return 'Aguardando liberação';
    if (status === 'recusada') return 'Recusada';
    if (status === 'cancelada') return 'Cancelada';
    return ROTULOS_STATUS[status];
  }

  protected rotuloItem(status: StatusPedidoItem): string {
    return ROTULOS_ITEM[status];
  }

  protected alternarValores(): void {
    this.valoresOcultos.update((ocultos) => !ocultos);
  }

  protected atualizar(): void {
    if (this.movimento.atualizando()) return;
    void this.movimento.atualizar();
  }
}
