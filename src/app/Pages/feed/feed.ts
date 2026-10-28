import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CartaoPostagem } from '../../components/cartao-postagem/cartao-postagem';
import { Carregando } from '../../components/carregando/carregando';
import { ErroCarregar } from '../../components/erro-carregar/erro-carregar';
import { NavCliente } from '../../components/nav-cliente/nav-cliente';
import { PostagemFeed, TipoPostagem } from '../../models';
import { PostagemService } from '../../services/postagem.service';

type Filtro = 'tudo' | TipoPostagem;

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'tudo', rotulo: 'Tudo' },
  { valor: 'bebida', rotulo: 'Bebidas' },
  { valor: 'comida', rotulo: 'Comidas' },
  { valor: 'evento', rotulo: 'Eventos' },
  { valor: 'novidade', rotulo: 'Avisos' },
];

/**
 * Novidades: promoções de bebida e comida, eventos e avisos de todos os bares,
 * numa coluna só, das mais novas para as mais antigas. Aberto sem login, como
 * o Descobrir. Uma postagem nova do gerente aparece aqui na hora.
 * (O endereço antigo, /cliente/feed, leva para cá.)
 */
@Component({
  selector: 'app-feed',
  imports: [CartaoPostagem, Carregando, ErroCarregar, NavCliente],
  templateUrl: './feed.html',
  styleUrl: './feed.scss',
})
export class FeedPage {
  private readonly servico = inject(PostagemService);

  protected readonly filtros = FILTROS;
  protected readonly filtro = signal<Filtro>('tudo');
  protected readonly carregando = signal(true);
  protected readonly erroCarregar = signal(false);
  protected readonly postagens = signal<PostagemFeed[]>([]);

  protected readonly visiveis = computed(() => {
    const filtro = this.filtro();
    const postagens = this.postagens();
    return filtro === 'tudo' ? postagens : postagens.filter((p) => p.tipo === filtro);
  });

  constructor() {
    const pararDeEscutar = this.servico.escutar(() => void this.carregar(false));
    inject(DestroyRef).onDestroy(pararDeEscutar);
    void this.carregar();
  }

  protected async carregar(mostrarCarregando = true): Promise<void> {
    if (mostrarCarregando) this.carregando.set(true);

    try {
      this.postagens.set(await this.servico.listarFeed());
      this.erroCarregar.set(false);
    } catch {
      // Já tinha postagens na tela? Mantém; o próximo aviso tenta de novo.
      if (mostrarCarregando) this.erroCarregar.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
