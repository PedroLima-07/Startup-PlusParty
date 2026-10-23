import { Injectable, inject } from '@angular/core';
import { NovaPostagem, Postagem, PostagemFeed, TipoPostagem } from '../models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/** Bucket das fotos das postagens (supabase/feed_notificacoes.sql). */
const BUCKET_POSTAGENS = 'postagens';

const COLUNAS =
  'id, estabelecimento_id, tipo, titulo, texto, imagem_url, preco, preco_antigo, valida_ate, criada_em';

/** Desenho de quem não mandou foto: um fundo colorido com o emoji do tipo. */
export const EMOJI_DO_TIPO: Record<TipoPostagem, string> = {
  bebida: '🍹',
  comida: '🍔',
  evento: '🎶',
  novidade: '✨',
};

/** Na edição: a foto continua, sai, ou dá lugar a uma nova. */
export type FotoEditada = 'manter' | 'remover' | Blob;

/** O topo de perfil da tela de Postagens. */
export interface ResumoBar {
  nome: string;
  foto_url: string | null;
  /** Clientes que recebem o aviso de cada postagem nova. */
  clientes: number;
}

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

  /**
   * Salva a edição de uma postagem do bar. A foto pode continuar, ser trocada
   * (a nova vai antes, a antiga sai depois de gravar) ou ser removida. A data
   * de publicação não muda: o banco garante (supabase/bar_redes_localizacao.sql).
   */
  async editar(original: Postagem, dados: NovaPostagem, foto: FotoEditada): Promise<Postagem> {
    const armazenamento = this.supabase.client.storage.from(BUCKET_POSTAGENS);

    let caminho: string | null = null;
    let imagem_url = original.imagem_url;
    if (foto === 'remover') {
      imagem_url = null;
    } else if (foto !== 'manter') {
      caminho = `${original.estabelecimento_id}/${Date.now()}.jpg`;
      const envio = await armazenamento.upload(caminho, foto, { contentType: 'image/jpeg' });
      if (envio.error) throw envio.error;
      imagem_url = armazenamento.getPublicUrl(caminho).data.publicUrl;
    }

    const { data, error } = await this.supabase.client
      .from('postagens')
      .update({ ...dados, imagem_url })
      .eq('id', original.id)
      .select(COLUNAS)
      .single();

    if (error) {
      if (caminho) void armazenamento.remove([caminho]);
      throw error;
    }
    if (imagem_url !== original.imagem_url) this.apagarFoto(original.imagem_url);
    return comPrecos(data as Postagem);
  }

  async apagar(postagem: Postagem): Promise<void> {
    const { error } = await this.supabase.client.from('postagens').delete().eq('id', postagem.id);
    if (error) throw error;
    this.apagarFoto(postagem.imagem_url);
  }

  /**
   * Nome e foto do bar do gerente, e quantos clientes recebem o aviso de uma
   * postagem nova: os mesmos que o banco avisa (quem já teve comanda no bar,
   * menos as recusadas; supabase/feed_notificacoes.sql).
   */
  async resumoDoMeuBar(): Promise<ResumoBar> {
    const bar = await this.meuBar();
    const [estabelecimento, comandas] = await Promise.all([
      this.supabase.client.from('estabelecimentos').select('nome, foto_url').eq('id', bar).single(),
      this.supabase.client
        .from('comandas')
        .select('usuario_id, cliente:perfis!comandas_usuario_id_fkey!inner(tipo)')
        .eq('estabelecimento_id', bar)
        .neq('status', 'recusada')
        .eq('cliente.tipo', 'cliente'),
    ]);

    if (estabelecimento.error) throw estabelecimento.error;
    if (comandas.error) throw comandas.error;
    const clientes = new Set((comandas.data ?? []).map((c) => c.usuario_id as string));
    return { ...(estabelecimento.data as Omit<ResumoBar, 'clientes'>), clientes: clientes.size };
  }

  /** A foto enviada pelo app sai junto com a postagem. Se falhar, sobra só o arquivo. */
  private apagarFoto(url: string | null): void {
    const marcador = `/object/public/${BUCKET_POSTAGENS}/`;
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
