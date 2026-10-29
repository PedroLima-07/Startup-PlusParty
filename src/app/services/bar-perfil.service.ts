import { Injectable, inject } from '@angular/core';
import { DadosDoBar, Estabelecimento } from '../models';
import { AuthService } from './auth.service';
import { EstabelecimentosService } from './estabelecimentos.service';
import { SupabaseService } from './supabase.service';

/** A foto de capa vai para o mesmo bucket das postagens, na pasta do bar (supabase/feed_notificacoes.sql). */
const BUCKET = 'postagens';

/**
 * Dados públicos do bar que o gerente edita em Configurações: lê e grava na
 * tabela `estabelecimentos` (só o gerente do próprio bar pode, pelo RLS).
 */
@Injectable({
  providedIn: 'root',
})
export class BarPerfilService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private estabelecimentos = inject(EstabelecimentosService);

  async carregar(): Promise<Estabelecimento> {
    const bar = await this.estabelecimentos.buscarPorId(await this.meuBar());
    if (!bar) throw new Error('Bar não encontrado');
    return bar;
  }

  /** Grava os dados e, se veio, a foto nova de capa. Devolve o bar como ficou. */
  async salvar(dados: DadosDoBar, foto: File | null): Promise<Estabelecimento> {
    const bar = await this.meuBar();
    let foto_url: string | undefined;

    if (foto) {
      const extensao = foto.type === 'image/png' ? 'png' : foto.type === 'image/webp' ? 'webp' : 'jpg';
      const caminho = `${bar}/capa-${Date.now()}.${extensao}`;
      const armazenamento = this.supabase.client.storage.from(BUCKET);
      const envio = await armazenamento.upload(caminho, foto, { contentType: foto.type || 'image/jpeg' });
      if (envio.error) throw envio.error;
      foto_url = armazenamento.getPublicUrl(caminho).data.publicUrl;
    }

    const { data, error } = await this.supabase.client
      .from('estabelecimentos')
      .update(foto_url ? { ...dados, foto_url } : dados)
      .eq('id', bar)
      .select('*')
      .single();

    if (error) throw error;
    this.estabelecimentos.esquecerLista();
    return data as Estabelecimento;
  }

  private async meuBar(): Promise<string> {
    const id = (await this.auth.perfilAtual())?.estabelecimento?.id;
    if (!id) throw new Error('Gerente sem bar');
    return id;
  }
}
