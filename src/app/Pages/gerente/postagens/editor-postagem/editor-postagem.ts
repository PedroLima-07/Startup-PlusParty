import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CartaoPostagem } from '../../../../components/cartao-postagem/cartao-postagem';
import { mensagemDoBanco } from '../../../../erros-banco';
import { prepararFotoDePostagem } from '../../../../foto';
import { NovaPostagem, Postagem, TipoPostagem } from '../../../../models';
import {
  EMOJI_DO_TIPO,
  FotoEditada,
  PostagemService,
} from '../../../../services/postagem.service';
import { Icone } from '../../componentes/icone';

type Etapa = 1 | 2 | 3;

const ETAPAS: { numero: Etapa; nome: string }[] = [
  { numero: 1, nome: 'Foto' },
  { numero: 2, nome: 'Detalhes' },
  { numero: 3, nome: 'Prévia' },
];

const TIPOS: { valor: TipoPostagem; rotulo: string }[] = [
  { valor: 'bebida', rotulo: '🍹 Bebida' },
  { valor: 'comida', rotulo: '🍔 Comida' },
  { valor: 'evento', rotulo: '🎶 Evento' },
  { valor: 'novidade', rotulo: '✨ Novidade' },
];

/** "9", "9,9", "9,90" ou "9.90" → 9.9; vazio → null; inválido → NaN. */
function lerPreco(texto: string): number | null {
  const limpo = texto.trim().replace('R$', '').trim().replace(',', '.');
  if (!limpo) return null;
  return /^\d+(\.\d{1,2})?$/.test(limpo) ? Number(limpo) : NaN;
}

/** 9.9 → "9,90", como o gerente digita. */
function escreverPreco(valor: number | null): string {
  return valor === null ? '' : valor.toFixed(2).replace('.', ',');
}

/** Data no formato do campo de data (aaaa-mm-dd), no fuso de quem usa. */
function diaNoCampo(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/**
 * Janela de nova postagem, em três etapas: a foto (ou o fundo do tipo), os
 * detalhes e a prévia de como sai no Feed. Com `postagem`, edita a que já
 * existe, com os campos preenchidos.
 */
@Component({
  selector: 'app-editor-postagem',
  imports: [CartaoPostagem, Icone],
  templateUrl: './editor-postagem.html',
  styleUrl: './editor-postagem.scss',
  host: { '(document:keydown.escape)': 'fechar.emit()' },
})
export class EditorPostagem implements OnInit {
  private readonly servico = inject(PostagemService);

  /** A postagem que está sendo editada; sem ela, é uma nova. */
  readonly postagem = input<Postagem | null>(null);
  readonly salva = output<Postagem>();
  readonly fechar = output<void>();

  protected readonly etapas = ETAPAS;
  protected readonly tipos = TIPOS;
  protected readonly hoje = diaNoCampo(new Date());

  protected readonly etapa = signal<Etapa>(1);
  protected readonly tipo = signal<TipoPostagem>('bebida');
  protected readonly titulo = signal('');
  protected readonly texto = signal('');
  protected readonly preco = signal('');
  protected readonly precoAntigo = signal('');
  protected readonly validaAte = signal('');
  /** Foto escolhida agora; a da postagem editada fica só na prévia. */
  protected readonly fotoNova = signal<File | null>(null);
  protected readonly fotoPrevia = signal<string | null>(null);

  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly editando = computed(() => this.postagem() !== null);
  protected readonly emoji = computed(() => EMOJI_DO_TIPO[this.tipo()]);

  /** Evento não tem preço; novidade tem preço, mas não "de/por". */
  protected readonly temPreco = computed(() => this.tipo() !== 'evento');
  protected readonly temPrecoAntigo = computed(
    () => this.tipo() === 'bebida' || this.tipo() === 'comida',
  );

  /** A postagem como vai sair, enquanto o gerente preenche. */
  protected readonly previa = computed<Postagem>(() => {
    const valido = (valor: number | null) => (valor === null || Number.isNaN(valor) ? null : valor);
    const preco = valido(this.temPreco() ? lerPreco(this.preco()) : null);
    const precoAntigo = valido(this.temPrecoAntigo() ? lerPreco(this.precoAntigo()) : null);

    return {
      id: 'previa',
      estabelecimento_id: '',
      tipo: this.tipo(),
      titulo: this.titulo().trim() || 'Título da postagem',
      texto: this.texto().trim() || null,
      imagem_url: this.fotoPrevia(),
      preco,
      preco_antigo: preco === null ? null : precoAntigo,
      valida_ate: this.validadeEmIso(),
      criada_em: this.postagem()?.criada_em ?? new Date().toISOString(),
    };
  });

  ngOnInit(): void {
    const postagem = this.postagem();
    if (!postagem) return;

    this.tipo.set(postagem.tipo);
    this.titulo.set(postagem.titulo ?? '');
    this.texto.set(postagem.texto ?? '');
    this.preco.set(escreverPreco(postagem.preco));
    this.precoAntigo.set(escreverPreco(postagem.preco_antigo));
    this.validaAte.set(postagem.valida_ate ? diaNoCampo(new Date(postagem.valida_ate)) : '');
    this.fotoPrevia.set(postagem.imagem_url);
  }

  protected campo(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected escolherFoto(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    // Permite escolher o mesmo arquivo de novo depois de remover a foto.
    campo.value = '';
    if (!arquivo) return;

    this.fotoNova.set(arquivo);
    const leitor = new FileReader();
    leitor.onload = () => this.fotoPrevia.set(leitor.result as string);
    leitor.readAsDataURL(arquivo);
  }

  protected removerFoto(): void {
    this.fotoNova.set(null);
    this.fotoPrevia.set(null);
  }

  /** Dos detalhes para a prévia, só com tudo certo. */
  protected avancar(): void {
    if (this.etapa() === 2) {
      const problema = this.montar();
      if (typeof problema === 'string') {
        this.erro.set(problema);
        return;
      }
    }
    this.erro.set(null);
    this.etapa.update((e) => Math.min(3, e + 1) as Etapa);
  }

  protected voltar(): void {
    this.erro.set(null);
    this.etapa.update((e) => Math.max(1, e - 1) as Etapa);
  }

  protected async salvar(): Promise<void> {
    const dados = this.montar();
    if (typeof dados === 'string') {
      this.erro.set(dados);
      this.etapa.set(2);
      return;
    }

    this.erro.set(null);
    this.salvando.set(true);
    try {
      const arquivo = this.fotoNova();
      const foto = arquivo ? await prepararFotoDePostagem(arquivo) : null;
      const original = this.postagem();
      const postagem = original
        ? await this.servico.editar(original, dados, this.fotoEditada(foto))
        : await this.servico.publicar(dados, foto);
      this.salva.emit(postagem);
    } catch (erro) {
      const acao = this.editando() ? 'salvar' : 'publicar';
      this.erro.set(mensagemDoBanco(erro) ?? `Não foi possível ${acao}. Tente de novo.`);
    } finally {
      this.salvando.set(false);
    }
  }

  private fotoEditada(nova: Blob | null): FotoEditada {
    if (nova) return nova;
    const tinhaFoto = this.postagem()?.imagem_url != null;
    return tinhaFoto && !this.fotoPrevia() ? 'remover' : 'manter';
  }

  /** A postagem pronta para gravar, ou a frase do que falta corrigir. */
  private montar(): NovaPostagem | string {
    const titulo = this.titulo().trim();
    if (!titulo) return 'Dê um título para a postagem.';

    const preco = this.temPreco() ? lerPreco(this.preco()) : null;
    const precoAntigo = this.temPrecoAntigo() ? lerPreco(this.precoAntigo()) : null;
    if (Number.isNaN(preco) || Number.isNaN(precoAntigo)) {
      return 'Escreva o preço só com números, como 9,90.';
    }
    if (precoAntigo !== null && preco === null) return 'Informe o preço da promoção.';
    if (precoAntigo !== null && preco !== null && precoAntigo <= preco) {
      return 'O preço normal precisa ser maior que o da promoção.';
    }
    // Na edição, a validade que já estava salva (mesmo vencida) pode ficar.
    const original = this.postagem()?.valida_ate;
    const mesmaValidade = original && this.validaAte() === diaNoCampo(new Date(original));
    if (this.validaAte() && this.validaAte() < this.hoje && !mesmaValidade) {
      return 'A validade precisa ser hoje ou depois.';
    }

    return {
      tipo: this.tipo(),
      titulo,
      texto: this.texto().trim() || null,
      preco,
      preco_antigo: precoAntigo,
      valida_ate: this.validadeEmIso(),
    };
  }

  /** Vale até o fim do dia escolhido. */
  private validadeEmIso(): string | null {
    const dia = this.validaAte();
    return dia ? new Date(`${dia}T23:59:59`).toISOString() : null;
  }
}
