import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ComandaAtendente,
  HistoricoNaoPaga,
  MINUTOS_ALERTA_LIBERACAO,
  MINUTOS_ALERTA_PAGAMENTO,
} from '../../models';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import {
  ComandaJaMudouError,
  ComandasAtendenteService,
} from '../../services/comandas-atendente.service';
import { Carregando } from '../../components/carregando/carregando';
import { NavAtendente } from '../../components/nav-atendente/nav-atendente';
import { telaDesktop } from '../../tela';
import { minutosDesde, relogio } from '../../tempo';

type Acao = 'liberar' | 'recusar' | 'pagar';

type TipoLista = ComandaAtendente['status'];

/** Os três cartões, na ordem em que aparecem: quem espera na porta vem primeiro. */
const TIPOS: { tipo: TipoLista; rotulo: string; curto: string; titulo: string; vazio: string }[] = [
  {
    tipo: 'aguardando_liberacao',
    rotulo: 'Liberar entrada',
    curto: 'Liberar',
    titulo: 'Liberar entrada',
    vazio: 'Nada para liberar',
  },
  {
    tipo: 'aguardando_pagamento',
    rotulo: 'Receber',
    curto: 'Receber',
    titulo: 'Receber pagamento',
    vazio: 'Nada para receber',
  },
  { tipo: 'aberta', rotulo: 'Abertas', curto: 'Abertas', titulo: 'Comandas abertas', vazio: 'Nenhuma aberta' },
];

/** A partir de quantos minutos a mais antiga deixa o cartão (e a linha) em vermelho. */
const LIMITE_URGENTE: Partial<Record<TipoLista, number>> = {
  aguardando_liberacao: MINUTOS_ALERTA_LIBERACAO,
  aguardando_pagamento: MINUTOS_ALERTA_PAGAMENTO,
};

/** Quanto tempo o número do cartão pisca quando chega comanda nova. */
const DURACAO_PISCADA_MS = 1200;

/** De quando conta a espera: a chegada para liberar, o fechamento da conta para receber. */
function inicioDaEspera(comanda: ComandaAtendente): string {
  return comanda.status === 'aguardando_pagamento' && comanda.fechada_em
    ? comanda.fechada_em
    : comanda.criada_em;
}

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
  styleUrls: [
    './atendente-comandas.scss',
    './atendente-comandas.desktop.scss',
    './atendente-comandas.conta.scss',
    './atendente-comandas.cartoes.scss',
  ],
})
export class AtendenteComandas implements OnInit {
  private comandasService = inject(ComandasAtendenteService);
  private supabase = inject(SupabaseService);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private router = inject(Router);
  private agora = relogio();
  private desktop = telaDesktop();

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

  /** Cartão escolhido. No desktop, null é a tela inicial com os três cartões. */
  private readonly tipoEscolhido = signal<TipoLista | null>(null);

  /** Cartões cujo número acabou de subir: piscam uma vez. */
  protected readonly pulsando = signal<ReadonlySet<TipoLista>>(new Set());

  /** Os três cartões com o número, o valor, a espera da mais antiga e a urgência. */
  protected readonly cartoes = computed(() =>
    TIPOS.map((definicao) => {
      const lista = this.doTipo(definicao.tipo);
      const maisAntiga = lista[0];
      const minutos = maisAntiga ? minutosDesde(inicioDaEspera(maisAntiga), this.agora()) : null;
      const limite = LIMITE_URGENTE[definicao.tipo];

      return {
        ...definicao,
        quantidade: lista.length,
        valor: lista.reduce((soma, comanda) => soma + comanda.total, 0),
        minutos,
        urgente: limite !== undefined && minutos !== null && minutos >= limite,
      };
    }),
  );

  /**
   * A lista na tela. No celular sempre há uma: sem escolha, a do primeiro
   * cartão com alguém esperando.
   */
  protected readonly tipoAtivo = computed(() => {
    const escolhido = this.tipoEscolhido();
    if (escolhido || this.desktop()) return escolhido;
    return this.cartoes().find((cartao) => cartao.quantidade > 0)?.tipo ?? 'aguardando_liberacao';
  });

  protected readonly cartaoAtivo = computed(
    () => this.cartoes().find((cartao) => cartao.tipo === this.tipoAtivo()) ?? null,
  );

  /** As comandas do cartão ativo, da que espera há mais tempo para a mais nova. */
  protected readonly lista = computed(() => {
    const tipo = this.tipoAtivo();
    if (!tipo) return [];

    const limite = LIMITE_URGENTE[tipo];
    return this.doTipo(tipo).map((comanda) => {
      const minutos = minutosDesde(inicioDaEspera(comanda), this.agora());
      return { comanda, minutos, urgente: limite !== undefined && minutos >= limite };
    });
  });

  /** Subtítulo do desktop: quantas esperam o atendente e por quê. */
  protected readonly resumoPendencias = computed(() => {
    const comandas = this.comandas();
    const liberar = comandas.filter((c) => c.status === 'aguardando_liberacao').length;
    const receber = comandas.filter((c) => c.status === 'aguardando_pagamento').length;
    const total = liberar + receber;
    if (total === 0) return 'Nenhuma comanda esperando por você.';

    const partes = [
      liberar > 0 ? `${liberar} para liberar` : '',
      receber > 0 ? `${receber} para receber` : '',
    ].filter(Boolean);
    return `${total} ${total === 1 ? 'espera' : 'esperam'} por você: ${partes.join(' e ')}`;
  });

  /**
   * Comanda aberta na tela de detalhe. Sai sempre da lista atual: se o total
   * mudar ou a comanda sumir enquanto a tela está aberta, ela acompanha.
   * No desktop, sem escolha, é a primeira da lista: entrar num cartão já
   * mostra a mais antiga, e depois de cada ação entra a próxima.
   */
  protected readonly selecionada = computed(() => {
    const escolhida = this.comandas().find((comanda) => comanda.id === this.selecionadaId());
    if (escolhida) return escolhida;
    return this.desktop() && this.tipoAtivo() ? (this.lista()[0]?.comanda ?? null) : null;
  });

  /** Muda só quando muda a comanda a liberar no detalhe, não a cada recarga da lista. */
  private readonly comandaParaHistorico = computed(() => {
    const comanda = this.selecionada();
    return comanda?.status === 'aguardando_liberacao' ? comanda.id : null;
  });

  /** Minutos desde que o cliente da comanda aberta no detalhe fechou a conta. */
  protected readonly minutosEsperandoPagamento = computed(() => {
    const comanda = this.selecionada();
    if (comanda?.status !== 'aguardando_pagamento' || !comanda.fechada_em) return null;
    return minutosDesde(comanda.fechada_em, this.agora());
  });

  /** Passou do prazo: o gerente também já recebeu o alerta. */
  protected readonly pagamentoAtrasado = computed(
    () => (this.minutosEsperandoPagamento() ?? 0) >= MINUTOS_ALERTA_PAGAMENTO,
  );

  /** Se o cliente da comanda a liberar já saiu sem pagar alguma vez. */
  protected readonly historicoNaoPaga = signal<HistoricoNaoPaga | null>(null);

  private esperaDoAviso: ReturnType<typeof setTimeout> | undefined;
  private esperaDaPiscada: ReturnType<typeof setTimeout> | undefined;
  private quantidadesAnteriores: ReadonlyMap<TipoLista, number> | null = null;

  constructor() {
    effect(() => {
      const id = this.comandaParaHistorico();
      untracked(() => {
        this.historicoNaoPaga.set(null);
        const comanda = this.comandas().find((c) => c.id === id);
        if (comanda) void this.buscarHistorico(comanda);
      });
    });
  }

  async ngOnInit(): Promise<void> {
    // Comanda aberta ou fechada pelo cliente aparece sozinha; itens mudam o total.
    const pararDeEscutar = this.supabase.escutarMudancas(
      [{ tabela: 'comandas' }, { tabela: 'pedido_itens' }],
      () => void this.atualizarLista(true),
    );
    this.destroyRef.onDestroy(() => {
      pararDeEscutar();
      clearTimeout(this.esperaDoAviso);
      clearTimeout(this.esperaDaPiscada);
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

      const comandas = await this.comandasService.listar(estabelecimentoId);
      this.comandas.set(comandas);
      this.piscarOsQueSubiram(comandas);
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

  /** Entra no cartão (ou troca de cartão pelas abas). */
  protected escolher(tipo: TipoLista): void {
    if (this.processando()) return;
    this.erro.set(null);
    this.selecionadaId.set(null);
    this.tipoEscolhido.set(tipo);
  }

  /** Desktop: volta para os três cartões. */
  protected voltarAosCartoes(): void {
    if (this.processando()) return;
    this.erro.set(null);
    this.selecionadaId.set(null);
    this.tipoEscolhido.set(null);
  }

  /** "esperando há 7 min", "fechou há 34 min" ou "aberta às 21:10". */
  protected textoDaEspera(comanda: ComandaAtendente, minutos: number): string {
    if (comanda.status === 'aguardando_liberacao') return `esperando há ${minutos} min`;
    if (comanda.status === 'aguardando_pagamento') return `fechou há ${minutos} min`;
    const abertura = new Date(comanda.liberada_em ?? comanda.criada_em);
    const hora = String(abertura.getHours()).padStart(2, '0');
    const minuto = String(abertura.getMinutes()).padStart(2, '0');
    return `aberta às ${hora}:${minuto}`;
  }

  private doTipo(tipo: TipoLista): ComandaAtendente[] {
    return this.comandas()
      .filter((comanda) => comanda.status === tipo)
      .sort(
        (a, b) => new Date(inicioDaEspera(a)).getTime() - new Date(inicioDaEspera(b)).getTime(),
      );
  }

  /** O número do cartão subiu (chegou comanda nova): ele pisca uma vez. */
  private piscarOsQueSubiram(comandas: ComandaAtendente[]): void {
    const quantidades = new Map(
      TIPOS.map(({ tipo }) => [tipo, comandas.filter((comanda) => comanda.status === tipo).length]),
    );
    const anteriores = this.quantidadesAnteriores;
    this.quantidadesAnteriores = quantidades;
    if (!anteriores) return;

    const subiram = TIPOS.map(({ tipo }) => tipo).filter(
      (tipo) => (quantidades.get(tipo) ?? 0) > (anteriores.get(tipo) ?? 0),
    );
    if (subiram.length === 0) return;

    clearTimeout(this.esperaDaPiscada);
    this.pulsando.set(new Set(subiram));
    this.esperaDaPiscada = setTimeout(() => this.pulsando.set(new Set()), DURACAO_PISCADA_MS);
  }

  /** Sem o histórico a liberação segue normal: ele só avisa, não decide. */
  private async buscarHistorico(comanda: ComandaAtendente): Promise<void> {
    try {
      const historico = await this.comandasService.historicoNaoPaga(comanda.usuario_id);
      // Só mostra se o atendente ainda está na mesma comanda.
      if (this.selecionada()?.id === comanda.id) this.historicoNaoPaga.set(historico);
    } catch {
      // Segue sem o aviso.
    }
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
