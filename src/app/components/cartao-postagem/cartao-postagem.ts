import { CurrencyPipe, formatDate } from '@angular/common';
import { Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Estabelecimento, Postagem, TipoPostagem } from '../../models';
import { descontoPercentual, ehPromocao, emVigor } from '../../services/postagem.service';
import { haQuantoTempo } from '../../tempo';

/** Desenho de quem não mandou foto: um fundo colorido com o emoji do tipo. */
const EMOJI: Record<TipoPostagem, string> = {
  bebida: '🍹',
  comida: '🍔',
  evento: '🎶',
  novidade: '✨',
};

const NOME_DO_TIPO: Record<TipoPostagem, string> = {
  bebida: 'Bebida',
  comida: 'Comida',
  evento: 'Evento',
  novidade: 'Novidade',
};

/**
 * Uma postagem do bar, como no Feed. Com `bar`, mostra quem publicou e o
 * botão para o bar ou o cardápio; sem, é a prévia da área do gerente.
 */
@Component({
  selector: 'app-cartao-postagem',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './cartao-postagem.html',
  styleUrl: './cartao-postagem.scss',
})
export class CartaoPostagem {
  private readonly locale = inject(LOCALE_ID);

  readonly postagem = input.required<Postagem>();
  readonly bar = input<Pick<Estabelecimento, 'id' | 'nome' | 'foto_url'> | null>(null);

  protected readonly emoji = computed(() => EMOJI[this.postagem().tipo]);
  protected readonly desconto = computed(() => descontoPercentual(this.postagem()));
  protected readonly publicada = computed(() => haQuantoTempo(this.postagem().criada_em));
  protected readonly vigente = computed(() => emVigor(this.postagem()));

  protected readonly etiqueta = computed(() => {
    const postagem = this.postagem();
    const tipo = NOME_DO_TIPO[postagem.tipo];
    return ehPromocao(postagem) ? `Promoção · ${tipo}` : tipo;
  });

  protected readonly validade = computed(() => {
    const ate = this.postagem().valida_ate;
    if (!ate) return null;
    if (!this.vigente()) return 'Encerrada';
    return `Até ${formatDate(ate, 'dd/MM', this.locale)}`;
  });

  /** Promoção de bebida ou comida leva ao cardápio; evento e novidade, ao bar. */
  protected readonly destino = computed(() => {
    const bar = this.bar();
    if (!bar) return null;
    const noCardapio = this.postagem().tipo === 'bebida' || this.postagem().tipo === 'comida';
    return {
      link: noCardapio
        ? ['/cliente/estabelecimento', bar.id, 'cardapio']
        : ['/cliente/estabelecimento', bar.id],
      rotulo: noCardapio ? 'Ver no cardápio' : 'Conhecer o bar',
    };
  });
}
