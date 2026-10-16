import { Component, computed, inject, signal } from '@angular/core';
import { CartaoPostagem } from '../../../components/cartao-postagem/cartao-postagem';
import { mensagemDoBanco } from '../../../erros-banco';
import { prepararFotoDePostagem } from '../../../foto';
import { NovaPostagem, Postagem, TipoPostagem } from '../../../models';
import { PostagemService } from '../../../services/postagem.service';
import { Icone } from '../componentes/icone';

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

/** Data de hoje no formato do campo de data (aaaa-mm-dd), no fuso de quem usa. */
function hojeNoCampo(): string {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${hoje.getFullYear()}-${mes}-${dia}`;
}

/**
 * O gerente publica promoções, eventos e novidades do bar no Feed dos
 * clientes, vendo ao lado a prévia de como o cartão vai aparecer. Os
 * clientes que já abriram comanda no bar recebem um aviso.
 */
@Component({
  selector: 'app-postagens',
  imports: [CartaoPostagem, Icone],
  templateUrl: './postagens.html',
  styleUrl: './postagens.scss',
})
export class Postagens {
  private readonly servico = inject(PostagemService);

  protected readonly tipos = TIPOS;
  protected readonly hoje = hojeNoCampo();

  protected readonly tipo = signal<TipoPostagem>('bebida');
  protected readonly titulo = signal('');
  protected readonly texto = signal('');
  protected readonly preco = signal('');
  protected readonly precoAntigo = signal('');
  protected readonly validaAte = signal('');
  protected readonly foto = signal<File | null>(null);
  protected readonly fotoPrevia = signal<string | null>(null);

  protected readonly publicando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly publicada = signal(false);

  protected readonly postagens = signal<Postagem[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erroCarregar = signal(false);
  protected readonly confirmarApagar = signal<string | null>(null);
  protected readonly apagando = signal(false);

  /** Evento não tem preço; novidade tem preço, mas não "de/por". */
  protected readonly temPreco = computed(() => this.tipo() !== 'evento');
  protected readonly temPrecoAntigo = computed(
    () => this.tipo() === 'bebida' || this.tipo() === 'comida',
  );

  /** A postagem como vai sair, enquanto o gerente preenche. */
  protected readonly previa = computed<Postagem>(() => {
    const preco = this.temPreco() ? lerPreco(this.preco()) : null;
    const precoAntigo = this.temPrecoAntigo() ? lerPreco(this.precoAntigo()) : null;
    const valido = (valor: number | null) => (valor === null || Number.isNaN(valor) ? null : valor);

    return {
      id: 'previa',
      estabelecimento_id: '',
      tipo: this.tipo(),
      titulo: this.titulo().trim() || 'Título da postagem',
      texto: this.texto().trim() || null,
      imagem_url: this.fotoPrevia(),
      preco: valido(preco),
      preco_antigo: valido(preco) === null ? null : valido(precoAntigo),
      valida_ate: this.validadeEmIso(),
      criada_em: new Date().toISOString(),
    };
  });

  constructor() {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    try {
      this.postagens.set(await this.servico.listarDoMeuBar());
      this.erroCarregar.set(false);
    } catch {
      this.erroCarregar.set(true);
    } finally {
      this.carregando.set(false);
    }
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

    this.foto.set(arquivo);
    const leitor = new FileReader();
    leitor.onload = () => this.fotoPrevia.set(leitor.result as string);
    leitor.readAsDataURL(arquivo);
  }

  protected removerFoto(): void {
    this.foto.set(null);
    this.fotoPrevia.set(null);
  }

  protected async publicar(): Promise<void> {
    this.publicada.set(false);
    const nova = this.montar();
    if (typeof nova === 'string') {
      this.erro.set(nova);
      return;
    }

    this.erro.set(null);
    this.publicando.set(true);
    try {
      const arquivo = this.foto();
      const foto = arquivo ? await prepararFotoDePostagem(arquivo) : null;
      const postagem = await this.servico.publicar(nova, foto);

      this.postagens.update((lista) => [postagem, ...lista]);
      this.limpar();
      this.publicada.set(true);
    } catch (erro) {
      this.erro.set(mensagemDoBanco(erro) ?? 'Não foi possível publicar. Tente de novo.');
    } finally {
      this.publicando.set(false);
    }
  }

  protected async apagar(postagem: Postagem): Promise<void> {
    this.apagando.set(true);
    try {
      await this.servico.apagar(postagem);
      this.postagens.update((lista) => lista.filter((p) => p.id !== postagem.id));
      this.confirmarApagar.set(null);
    } catch {
      this.erro.set('Não foi possível apagar a postagem. Tente de novo.');
    } finally {
      this.apagando.set(false);
    }
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
    if (this.validaAte() && this.validaAte() < this.hoje) {
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

  private limpar(): void {
    this.titulo.set('');
    this.texto.set('');
    this.preco.set('');
    this.precoAntigo.set('');
    this.validaAte.set('');
    this.removerFoto();
  }
}
