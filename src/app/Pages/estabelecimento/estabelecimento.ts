import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { CartaoPostagem } from '../../components/cartao-postagem/cartao-postagem';
import { MINIMO_AVALIACOES, NotaBar } from '../../components/nota-bar/nota-bar';
import { formatarHora, resumirDias, statusHorario } from '../../horario-funcionamento';
import { AvaliacaoDoBar, Estabelecimento, EventoAgenda, PostagemFeed } from '../../models';
import { AgendaService } from '../../services/agenda.service';
import { AuthService } from '../../services/auth.service';
import { AvaliacaoService } from '../../services/avaliacao.service';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';
import { linkComoChegar } from '../../services/google-maps.service';
import { PostagemService } from '../../services/postagem.service';
import { haQuantoTempo } from '../../tempo';
import { NavCliente } from '../../components/nav-cliente/nav-cliente';
import { Carregando } from '../../components/carregando/carregando';
import { ErroCarregar } from '../../components/erro-carregar/erro-carregar';

const NOTA_BEM_AVALIADO = 4.5;

export type Aba = 'sobre' | 'agenda' | 'novidades' | 'avaliacoes';

/** As abas da página; "Cardápio" fica entre elas, mas abre a página do cardápio. */
const ABAS: { valor: Aba | 'cardapio'; rotulo: string }[] = [
  { valor: 'sobre', rotulo: 'Sobre' },
  { valor: 'cardapio', rotulo: 'Cardápio' },
  { valor: 'agenda', rotulo: 'Agenda' },
  { valor: 'novidades', rotulo: 'Novidades' },
  { valor: 'avaliacoes', rotulo: 'Avaliações' },
];

/** O que cada aba carregou do banco; `null` enquanto carrega, `'erro'` se falhou. */
type Carga<T> = T[] | null | 'erro';

/**
 * Perfil do bar visto pelo cliente: capa, nota, horário, como chegar, redes,
 * e as abas Sobre, Cardápio, Agenda, Novidades e Avaliações. O botão
 * "Abrir comanda aqui" só aparece com o bar aberto.
 * `?aba=agenda` abre direto numa aba (o lembrete de evento usa isso).
 */
@Component({
  selector: 'app-estabelecimento',
  standalone: true,
  imports: [CartaoPostagem, Carregando, CurrencyPipe, DatePipe, ErroCarregar, NavCliente, NotaBar],
  templateUrl: './estabelecimento.html',
  styleUrls: ['./estabelecimento.scss', './estabelecimento.abas.scss'],
})
export class EstabelecimentoPage implements OnInit {
  private readonly router = inject(Router);
  private readonly estabelecimentosService = inject(EstabelecimentosService);
  private readonly agendaService = inject(AgendaService);
  private readonly avaliacaoService = inject(AvaliacaoService);
  private readonly postagemService = inject(PostagemService);
  private readonly authService = inject(AuthService);

  id = input.required<string>();
  /** Aba pedida no link (`?aba=agenda`). */
  aba = input<string | undefined>();

  protected readonly abas = ABAS;
  protected readonly abaAtual = signal<Aba>('sobre');
  protected readonly carregando = signal(true);
  protected readonly erroCarregar = signal(false);
  protected readonly estabelecimento = signal<Estabelecimento | null>(null);
  protected readonly enderecoCopiado = signal(false);
  protected readonly linkCopiado = signal(false);

  protected readonly agenda = signal<Carga<EventoAgenda>>(null);
  protected readonly novidades = signal<Carga<PostagemFeed>>(null);
  protected readonly avaliacoes = signal<Carga<AvaliacaoDoBar>>(null);
  /** Evento cujo interesse está sendo gravado (o botão fica esperando). */
  protected readonly gravandoInteresse = signal<string | null>(null);
  protected readonly erroInteresse = signal<string | null>(null);

  protected readonly status = computed(() => {
    const e = this.estabelecimento();
    return e ? statusHorario(e) : null;
  });

  protected readonly horario = computed(() => {
    const e = this.estabelecimento();
    if (!e?.horario_abre || !e.horario_fecha || e.dias_abertos.length === 0) return null;
    return `${resumirDias(e.dias_abertos)} · ${formatarHora(e.horario_abre)} às ${formatarHora(e.horario_fecha)}`;
  });

  /** "Aberto até 2h" para a linha do topo; fechado, o texto do horário. */
  protected readonly situacao = computed(() => {
    const e = this.estabelecimento();
    const s = this.status();
    if (!e || !s) return null;
    return s.aberto && e.horario_fecha ? `Aberto até ${formatarHora(e.horario_fecha)}` : s.texto;
  });

  protected readonly bemAvaliado = computed(
    () =>
      (this.estabelecimento()?.total_avaliacoes ?? 0) >= MINIMO_AVALIACOES &&
      (this.estabelecimento()?.nota_media ?? 0) >= NOTA_BEM_AVALIADO,
  );

  protected readonly comoChegar = computed(() => {
    const e = this.estabelecimento();
    return e ? linkComoChegar(e) : null;
  });

  /** Só as redes que o bar preencheu. */
  protected readonly redes = computed(() => {
    const e = this.estabelecimento();
    if (!e) return [];
    return [
      e.instagram && { nome: 'Instagram', link: `https://instagram.com/${e.instagram}` },
      e.tiktok && { nome: 'TikTok', link: `https://www.tiktok.com/@${e.tiktok}` },
      e.whatsapp && { nome: 'WhatsApp', link: `https://wa.me/${e.whatsapp}` },
    ].filter((rede): rede is { nome: string; link: string } => !!rede);
  });

  constructor() {
    effect(() => {
      const pedida = this.aba();
      if (ABAS.some((a) => a.valor === pedida && pedida !== 'cardapio')) {
        untracked(() => this.escolherAba(pedida as Aba));
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erroCarregar.set(false);

    try {
      this.estabelecimento.set(await this.estabelecimentosService.buscarPorId(this.id()));
    } catch {
      this.erroCarregar.set(true);
    } finally {
      this.carregando.set(false);
    }
  }

  /** Cada aba busca o que mostra na primeira vez que é aberta. */
  protected escolherAba(aba: Aba | 'cardapio'): void {
    if (aba === 'cardapio') {
      this.verCardapio();
      return;
    }
    this.abaAtual.set(aba);
    if (aba === 'agenda' && this.agenda() !== 'erro' && this.agenda() === null) void this.carregarAgenda();
    if (aba === 'novidades' && this.novidades() === null) void this.carregarNovidades();
    if (aba === 'avaliacoes' && this.avaliacoes() === null) void this.carregarAvaliacoes();
  }

  protected async carregarAgenda(): Promise<void> {
    this.agenda.set(null);
    this.agenda.set(await this.agendaService.doBar(this.id()).catch(() => 'erro' as const));
  }

  protected async carregarNovidades(): Promise<void> {
    this.novidades.set(null);
    this.novidades.set(await this.postagemService.listarDoBar(this.id()).catch(() => 'erro' as const));
  }

  protected async carregarAvaliacoes(): Promise<void> {
    this.avaliacoes.set(null);
    this.avaliacoes.set(await this.avaliacaoService.doBar(this.id()).catch(() => 'erro' as const));
  }

  /** Liga e desliga o "Tenho interesse"; sem login, leva para entrar. */
  protected async alternarInteresse(evento: EventoAgenda): Promise<void> {
    if (this.gravandoInteresse()) return;
    if (!(await this.authService.usuarioAtual())) {
      void this.router.navigateByUrl('/login');
      return;
    }

    this.gravandoInteresse.set(evento.evento_id);
    this.erroInteresse.set(null);
    try {
      if (evento.tenho_interesse) await this.agendaService.desmarcarInteresse(evento.evento_id);
      else await this.agendaService.marcarInteresse(evento.evento_id);

      const marcado = !evento.tenho_interesse;
      // Evento semanal aparece uma vez por semana: todas as vezes mudam juntas.
      this.agenda.update((lista) =>
        Array.isArray(lista)
          ? lista.map((e) =>
              e.evento_id === evento.evento_id
                ? { ...e, tenho_interesse: marcado, interessados: e.interessados + (marcado ? 1 : -1) }
                : e,
            )
          : lista,
      );
    } catch {
      this.erroInteresse.set('Não foi possível salvar agora. Tente de novo.');
    } finally {
      this.gravandoInteresse.set(null);
    }
  }

  protected voltar(): void {
    void this.router.navigate(['/cliente/discovery']);
  }

  protected abrirComanda(): void {
    void this.router.navigate(['/cliente/abrir-comanda', this.id()]);
  }

  protected verCardapio(): void {
    void this.router.navigate(['/cliente/estabelecimento', this.id(), 'cardapio']);
  }

  protected async compartilhar(nome: string): Promise<void> {
    const url = `${location.origin}/cliente/estabelecimento/${this.id()}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: nome, text: `Bora no ${nome}?`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.linkCopiado.set(true);
      setTimeout(() => this.linkCopiado.set(false), 2000);
    } catch {
      // O cliente fechou o compartilhar, ou o navegador não deixou copiar.
    }
  }

  protected async copiarEndereco(endereco: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(endereco);
      this.enderecoCopiado.set(true);
      setTimeout(() => this.enderecoCopiado.set(false), 2000);
    } catch {
      // Clipboard indisponível (ex: contexto sem permissão) — sem tratamento especial.
    }
  }

  protected lista<T>(carga: Carga<T>): T[] | null {
    return Array.isArray(carga) ? carga : null;
  }

  protected estrelas(nota: number): string {
    return '★★★★★'.slice(0, nota) + '☆☆☆☆☆'.slice(0, 5 - nota);
  }

  protected quando(data: string): string {
    return haQuantoTempo(data);
  }

  /** "HOJE", "AMANHÃ" ou "SEX 31". */
  protected diaDoEvento(inicio: string): string {
    const dia = new Date(inicio);
    const hoje = new Date();
    const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
    if (dia.toDateString() === hoje.toDateString()) return 'HOJE';
    if (dia.toDateString() === amanha.toDateString()) return 'AMANHÃ';
    const semana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][dia.getDay()];
    return `${semana} ${String(dia.getDate()).padStart(2, '0')}`;
  }
}
