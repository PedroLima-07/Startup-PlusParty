import { Injectable, inject } from '@angular/core';
import { NovaPostagem, Postagem, PostagemFeed } from '../models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/** Bucket das fotos das postagens (supabase/feed_notificacoes.sql). */
const BUCKET_POSTAGENS = 'postagens';

const COLUNAS =
  'id, estabelecimento_id, tipo, titulo, texto, imagem_url, preco, preco_antigo, valida_ate, criada_em';

/** Promoção de verdade: tem o preço normal para comparar. */
export function ehPromocao(postagem: Pick<Postagem, 'preco' | 'preco_antigo'>): boolean {
  return postagem.preco !== null && postagem.preco_antigo !== null;
}

/** Desconto em %, arredondado; null se não for promoção. */
export function descontoPercentual(postagem: Pick<Postagem, 'preco' | 'preco_antigo'>): number | null {
  if (!ehPromocao(postagem) || !postagem.preco_antigo) return null;
  return Math.round((1 - postagem.preco! / postagem.preco_antigo) * 100);
}

/** Ainda aparece no Feed (sem prazo, ou o prazo não passou). */
export function emVigor(postagem: Pick<Postagem, 'valida_ate'>, agora = new Date()): boolean {
  return postagem.valida_ate === null || new Date(postagem.valida_ate) > agora;
}

/** O Supabase devolve `numeric` como número, mas não custa garantir. */
function comPrecos<T extends Postagem>(postagem: T): T {
  return {
    ...postagem,
    preco: postagem.preco === null ? null : Number(postagem.preco),
    preco_antigo: postagem.preco_antigo === null ? null : Number(postagem.preco_antigo),
  };
}

/**
 * Postagens dos bares: promoções de bebida e comida, eventos e novidades.
 * Ler é aberto a todos (o Feed funciona sem login); publicar e apagar, só o
 * gerente, e só no próprio bar (o RLS garante).
 */
@Injectable({
  providedIn: 'root',
})
export class PostagemService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);

  /** Postagens em vigor de todos os bares, das mais novas para as mais antigas. */
  async listarFeed(): Promise<PostagemFeed[]> {
    const agora = new Date().toISOString();
    const { data, error } = await this.supabase.client
      .from('postagens')
      .select(`${COLUNAS}, estabelecimento:estabelecimentos(id, nome, foto_url)`)
      .or(`valida_ate.is.null,valida_ate.gt.${agora}`)
      .order('criada_em', { ascending: false })
      .limit(60);

    if (error) throw error;
    return ((data ?? []) as unknown as PostagemFeed[]).map(comPrecos);
  }

  /** Todas as postagens do bar do gerente, inclusive as que já venceram. */
  async listarDoMeuBar(): Promise<Postagem[]> {
    const { data, error } = await this.supabase.client
      .from('postagens')
      .select(COLUNAS)
      .eq('estabelecimento_id', await this.meuBar())
      .order('criada_em', { ascending: false })
      .limit(50);

    if (error) throw error;
    return ((data ?? []) as Postagem[]).map(comPrecos);
  }

  /**
   * Publica no bar do gerente. A foto (opcional) vai antes, para a postagem
   * já nascer com ela; se a postagem não for gravada, a foto é apagada.
   * O banco avisa os clientes que já foram ao bar.
   */
  async publicar(nova: NovaPostagem, foto: Blob | null): Promise<Postagem> {
    const bar = await this.meuBar();
    const armazenamento = this.supabase.client.storage.from(BUCKET_POSTAGENS);

    let caminho: string | null = null;
    let imagem_url: string | null = null;
    if (foto) {
      caminho = `${bar}/${Date.now()}.jpg`;
      const envio = await armazenamento.upload(caminho, foto, { contentType: 'image/jpeg' });
      if (envio.error) throw envio.error;
      imagem_url = armazenamento.getPublicUrl(caminho).data.publicUrl;
    }

    const { data, error } = await this.supabase.client
      .from('postagens')
      .insert({ ...nova, estabelecimento_id: bar, imagem_url })
      .select(COLUNAS)
      .single();

    if (error) {
      if (caminho) void armazenamento.remove([caminho]);
      throw error;
    }
    return comPrecos(data as Postagem);
  }

  async apagar(postagem: Postagem): Promise<void> {
    const { error } = await this.supabase.client.from('postagens').delete().eq('id', postagem.id);
    if (error) throw error;

    // A foto enviada pelo app vai junto. Se falhar, sobra só o arquivo.
    const marcador = `/object/public/${BUCKET_POSTAGENS}/`;
    const url = postagem.imagem_url;
    if (url?.includes(marcador)) {
      void this.supabase.client.storage
        .from(BUCKET_POSTAGENS)
        .remove([url.slice(url.indexOf(marcador) + marcador.length)]);
    }
  }

  /** Avisa quando alguma postagem é publicada ou apagada. Devolve a função que para. */
  escutar(aoMudar: () => void): () => void {
    return this.supabase.escutarMudancas([{ tabela: 'postagens' }], aoMudar);
  }

  private async meuBar(): Promise<string> {
    const bar = (await this.auth.perfilAtual())?.estabelecimento?.id;
    if (!bar) throw new Error('Só o gerente de um bar publica postagens.');
    return bar;
  }
}
