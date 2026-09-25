import { Injectable, inject } from '@angular/core';
import { Perfil, TipoPerfil } from '../models';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private supabase = inject(SupabaseService);

  async login(email: string, senha: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) throw error;
  }

  /**
   * O perfil é criado pelo trigger `ao_criar_usuario` (supabase/trigger_criar_perfil.sql),
   * que lê `nome`/`tipo` de raw_user_meta_data — por isso vão em `options.data` aqui.
   * Não inserir manualmente em `perfis`: o trigger já roda como SECURITY DEFINER,
   * e um insert duplicado colidiria com a chave primária (id).
   */
  async cadastrar(nome: string, email: string, senha: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signUp({
      email,
      password: senha,
      options: { data: { nome, tipo: 'cliente' } },
    });

    if (error) throw error;
  }

  async buscarNomeAtual(): Promise<string> {
    const { data: sessionData, error: erroSessao } = await this.supabase.client.auth.getUser();
    if (erroSessao) throw erroSessao;

    const { data, error } = await this.supabase.client
      .from('perfis')
      .select('nome')
      .eq('id', sessionData.user.id)
      .single();

    if (error) throw error;
    return (data as Pick<Perfil, 'nome'>).nome;
  }

  /** Tipo do usuário logado, ou null se não houver sessão. */
  async buscarTipoAtual(): Promise<TipoPerfil | null> {
    const {
      data: { user },
    } = await this.supabase.client.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.supabase.client
      .from('perfis')
      .select('tipo')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return (data as Pick<Perfil, 'tipo'>).tipo;
  }
}
