import { formatDate } from '@angular/common';
import { Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { Postagem } from '../../../models';
import {
  EMOJI_DO_TIPO,
  PostagemService,
  ResumoBar,
  descontoPercentual,
  emVigor,
} from '../../../services/postagem.service';
import { Confirmar } from '../componentes/confirmar';
import { Icone } from '../componentes/icone';
import { EditorPostagem } from './editor-postagem/editor-postagem';

type Aba = 'ativas' | 'encerradas';

const ABAS: { valor: Aba; nome: string; icone: 'grade' | 'arquivo' }[] = [
  { valor: 'ativas', nome: 'Ativas', icone: 'grade' },
  { valor: 'encerradas', nome: 'Encerradas', icone: 'arquivo' },
];

/** O que a janela de postagem está fazendo: criando uma nova ou editando uma. */
type Editor = { nova: true } | { postagem: Postagem };

/**
 * As postagens do bar no estilo de um perfil do Instagram: o topo com o bar
 * e os números, e a grade de fotos. Publicar e editar acontecem numa janela
 * em etapas. O que sai daqui aparece no Feed dos clientes.
 */
@Component({
  selector: 'app-postagens',
  imports: [Confirmar, EditorPostagem, Icone],
  templateUrl: './postagens.html',
  styleUrl: './postagens.scss',
  host: { '(document:keydown.escape)': 'menuAberto.set(null)' },
})
export class Postagens {
  private readonly servico = inject(PostagemService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly abas = ABAS;
  protected readonly emoji = EMOJI_DO_TIPO;

  protected readonly postagens = signal<Postagem[]>([]);
  protected readonly resumo = signal<ResumoBar | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erroCarregar = signal(false);

  protected readonly aba = signal<Aba>('ativas');
  protected readonly editor = signal<Editor | null>(null);
  /** Postagem com o menu "⋯" aberto (no toque). */
  protected readonly menuAberto = signal<string | null>(null);
  protected readonly confirmarApagar = signal<Postagem | null>(null);
  protected readonly apagando = signal(false);
  protected readonly erroApagar = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly ativas = computed(() => this.postagens().filter((p) => emVigor(p)));
  protected readonly encerradas = computed(() => this.postagens().filter((p) => !emVigor(p)));
  protected readonly visiveis = computed(() =>
    this.aba() === 'ativas' ? this.ativas() : this.encerradas(),
  );

  protected readonly editando = computed(() => {
    const editor = this.editor();
    return editor && 'postagem' in editor ? editor.postagem : null;
  });

  constructor() {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    try {
      const [postagens, resumo] = await Promise.all([
        this.servico.listarDoMeuBar(),
        // O topo é um detalhe: sem ele, a grade abre do mesmo jeito.
        this.servico.resumoDoMeuBar().catch(() => null),
      ]);
      this.postagens.set(postagens);
      this.resumo.set(resumo);
      this.erroCarregar.set(false);
    } catch {
      this.erroCarregar.set(true);
    } finally {
      this.carregando.set(false);
    }
  }

  protected desconto(postagem: Postagem): number | null {
    return descontoPercentual(postagem);
  }

  protected validade(postagem: Postagem): string | null {
    if (!postagem.valida_ate) return null;
    if (!emVigor(postagem)) return 'Encerrada';
    return `Até ${formatDate(postagem.valida_ate, 'dd/MM', this.locale)}`;
  }

  protected inicial(nome: string): string {
    return nome.charAt(0).toUpperCase();
  }

  protected novaPostagem(): void {
    this.aviso.set(null);
    this.editor.set({ nova: true });
  }

  protected editar(postagem: Postagem): void {
    this.menuAberto.set(null);
    this.aviso.set(null);
    this.editor.set({ postagem });
  }

  protected pedirParaApagar(postagem: Postagem): void {
    this.menuAberto.set(null);
    this.erroApagar.set(null);
    this.confirmarApagar.set(postagem);
  }

  protected alternarMenu(postagem: Postagem): void {
    this.menuAberto.update((aberto) => (aberto === postagem.id ? null : postagem.id));
  }

  /** A nova entra no topo; a editada fica no lugar. Vai para a aba em que ela aparece. */
  protected aoSalvar(postagem: Postagem): void {
    const nova = this.editando() === null;
    this.postagens.update((lista) =>
      nova ? [postagem, ...lista] : lista.map((p) => (p.id === postagem.id ? postagem : p)),
    );
    this.aba.set(emVigor(postagem) ? 'ativas' : 'encerradas');
    this.editor.set(null);
    this.aviso.set(
      nova
        ? 'Publicada! Já está no Feed, e os clientes que já vieram ao bar foram avisados.'
        : 'Alterações salvas.',
    );
  }

  protected async apagar(): Promise<void> {
    const postagem = this.confirmarApagar();
    if (!postagem) return;

    this.apagando.set(true);
    try {
      await this.servico.apagar(postagem);
      this.postagens.update((lista) => lista.filter((p) => p.id !== postagem.id));
      this.confirmarApagar.set(null);
    } catch {
      this.erroApagar.set('Não foi possível apagar a postagem. Tente de novo.');
    } finally {
      this.apagando.set(false);
    }
  }
}
