import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AlertaGerente, ComandaResumo, TipoAlertaGerente } from '../../../models';
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
  imports: [CurrencyPipe, DatePipe, Icone, RouterLink],
  templateUrl: './movimento.html',
  styleUrl: './movimento.scss',
})
export class Movimento implements OnInit {
  protected readonly movimento = inject(MovimentoService);
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);

  private readonly listaDeComandas = viewChild<ElementRef<HTMLElement>>('listaDeComandas');

  protected readonly filtros = FILTROS;
  protected readonly hoje = new Date();
  protected readonly nomeDoBar = signal('');
  protected readonly filtro = signal<Filtro>('todas');
  protected readonly busca = signal('');
  /** O olho do cartão de faturamento: esconde os valores de quem está olhando por cima do ombro. */
  protected readonly valoresOcultos = signal(false);
  /** Alertas de liberação em que o gerente já tocou em "Avisar atendente". */
  protected readonly avisados = signal<ReadonlySet<string>>(new Set());

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
   * Botão do alerta. Os que apontam para uma comanda levam até ela na lista
   * de comandas do dia; o de liberação marca que o atendente foi avisado.
   */
  protected agir(alerta: AlertaGerente): void {
    if (alerta.comanda) {
      this.filtro.set('todas');
      this.busca.set(alerta.comanda);
      this.listaDeComandas()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    this.avisados.update((avisados) => new Set(avisados).add(alerta.id));
  }

  protected alternarValores(): void {
    this.valoresOcultos.update((ocultos) => !ocultos);
  }
}
