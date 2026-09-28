import { Injectable, signal } from '@angular/core';
import { PostagemGerente } from '../models';

@Injectable({
  providedIn: 'root'
})
export class PostagemService {
  postagens = signal<PostagemGerente[]>([
    { id: '1', texto: 'Hoje tem dose dupla de chopp até as 20h!', criadoEm: new Date(Date.now() - 3600000) },
    { id: '2', texto: 'Música ao vivo com a banda Rock in Roll, couvert R$ 15,00', criadoEm: new Date(Date.now() - 86400000) }
  ]);

  publicar(texto: string, fotoUrl?: string) {
    const novaPostagem: PostagemGerente = {
      id: Math.random().toString(36).substring(2, 9),
      texto,
      fotoUrl,
      criadoEm: new Date()
    };
    // Add to the top
    this.postagens.update(posts => [novaPostagem, ...posts]);
  }
}
