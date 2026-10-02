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
   * que lê o `nome` de `options.data` e sempre cria como cliente.
   * Não inserir manualmente em `perfis`: um insert duplicado colidiria com a chave primária.
   */
  async cadastrar(nome: string, email: string, senha: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });

    if (error) throw error;
  }

  /**
   * Pede ao Supabase o e-mail de recuperação. O link do e-mail abre
   * /redefinir-senha já com uma sessão de recuperação. O endereço precisa estar
   * em Authentication → URL Configuration → Redirect URLs.
   * Para e-mail não cadastrado o Supabase também responde sem erro, de propósito.
   */
  async pedirRedefinicaoSenha(email: string): Promise<void> {
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/redefinir-senha`,
    });

    if (error) throw error;
  }

  /** Troca a senha do usuário da sessão atual (a sessão aberta pelo link do e-mail). */
  async definirNovaSenha(senha: string): Promise<void> {
    const { error } = await this.supabase.client.auth.updateUser({ password: senha });
    if (error) throw error;
  }

  async sair(): Promise<void> {
    const { error } = await this.supabase.client.auth.signOut();
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

  /** Tela onde cada tipo de usuário começa depois de entrar. */
  telaInicial(tipo: TipoPerfil | null): string {
    switch (tipo) {
      case 'gerente':
        return '/gerente/movimento';
      case 'funcionario':
        return '/atendente/pedidos';
      default:
        return '/cliente/home';
    }
  }

  /** Nome do estabelecimento ao qual o funcionário/gerente logado pertence. */
  async buscarNomeEstabelecimentoAtual(): Promise<string | null> {
    const {
      data: { user },
    } = await this.supabase.client.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.supabase.client
      .from('perfis')
      .select('estabelecimento:estabelecimentos(nome)')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    const estabelecimento = data.estabelecimento as unknown as { nome: string } | null;
    return estabelecimento?.nome ?? null;
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
