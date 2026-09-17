import { Injectable, inject } from '@angular/core';
import { Perfil } from '../models';
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
   * signUp() sozinho não basta: sem a linha em `perfis`, as funções que o RLS
   * usa (meu_tipo(), meu_estabelecimento_id()) voltam vazias e todas as
   * políticas bloqueiam o acesso, mesmo autenticado.
   */
  async cadastrar(nome: string, email: string, senha: string): Promise<void> {
    const { data, error: erroCadastro } = await this.supabase.client.auth.signUp({
      email,
      password: senha,
    });

    if (erroCadastro) throw erroCadastro;

    const perfil: Omit<Perfil, 'criado_em'> = {
      id: data.user!.id,
      nome,
      email,
      telefone: null,
      tipo: 'cliente',
      estabelecimento_id: null,
    };

    const { error: erroPerfil } = await this.supabase.client.from('perfis').insert(perfil);

    if (erroPerfil) throw erroPerfil;
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
}
