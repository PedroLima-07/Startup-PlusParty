import { Injectable, signal } from '@angular/core';
import { PostagemGerente } from '../models';

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Postagens do bar.
 *
 * TODO: dados de exemplo, guardados só na memória da aba. Ainda não grava na
 * tabela `postagens` do Supabase.
 */
@Injectable({
  providedIn: 'root',
})
export class PostagemService {
  readonly postagens = signal<PostagemGerente[]>([
    {
      id: '1',
      texto: 'Hoje tem roda de samba a partir das 20h! Chegue cedo para garantir mesa. 🎶',
      fotoUrl: 'img/estabelecimentos/bar-dze.jpg',
      criadoEm: new Date(Date.now() - 2 * UM_DIA),
    },
    {
      id: '2',
      texto: 'Novo drink no cardápio: Gin Tropical com maracujá. Venha experimentar!',
      criadoEm: new Date(Date.now() - 5 * UM_DIA),
    },
  ]);

  /** A postagem nova entra no topo da lista. */
  publicar(texto: string, fotoUrl?: string): void {
    const novaPostagem: PostagemGerente = {
      id: crypto.randomUUID(),
      texto,
      fotoUrl,
      criadoEm: new Date(),
    };
    this.postagens.update((postagens) => [novaPostagem, ...postagens]);
  }
}
