import { Injectable, inject } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { TipoPerfil } from '../models';
import { SupabaseService } from './supabase.service';

/** O que as telas e os guards precisam saber de quem está logado. */
export interface PerfilAtual {
  nome: string;
  tipo: TipoPerfil;
  /** Bar do funcionário/gerente; `null` para cliente. */
  estabelecimento: { nome: string } | null;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private supabase = inject(SupabaseService);

  /**
   * Perfil de quem está logado, buscado uma vez por login. Guarda a promessa
   * (e não o resultado) para que duas telas pedindo ao mesmo tempo dividam a
   * mesma consulta.
   */
  private perfilGuardado: { usuarioId: string; perfil: Promise<PerfilAtual> } | null = null;

  async login(email: string, senha: string): Promise<void> {
    this.perfilGuardado = null;
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
    this.perfilGuardado = null;
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
    this.perfilGuardado = null;
    const { error } = await this.supabase.client.auth.signOut();
    if (error) throw error;
  }

  /**
   * Usuário da sessão guardada na aba, ou null se ninguém entrou. Não vai à
   * rede (só quando o token vence e precisa ser renovado), ao contrário de
   * `auth.getUser()`, que pergunta ao servidor toda vez.
   *
   * Serve para decidir o que mostrar. Quem protege os dados é o RLS, que
   * confere o token em cada consulta.
   */
  async usuarioAtual(): Promise<User | null> {
    const { data } = await this.supabase.client.auth.getSession();
    return data.session?.user ?? null;
  }

  /**
   * Perfil de quem está logado, ou null sem sessão. A primeira chamada depois
   * do login consulta o banco; as seguintes reaproveitam a resposta. Se o
   * perfil mudar no banco, a aba só percebe no próximo login.
   */
  async perfilAtual(): Promise<PerfilAtual | null> {
    const usuario = await this.usuarioAtual();
    if (!usuario) return null;

    if (this.perfilGuardado?.usuarioId !== usuario.id) {
      const perfil = this.buscarPerfil(usuario.id);
      this.perfilGuardado = { usuarioId: usuario.id, perfil };
      // Falhou? Não guarda o erro: a próxima chamada tenta de novo.
      perfil.catch(() => {
        if (this.perfilGuardado?.perfil === perfil) this.perfilGuardado = null;
      });
    }

    return this.perfilGuardado.perfil;
  }

  async buscarNomeAtual(): Promise<string> {
    return (await this.perfilAtual())?.nome ?? '';
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
    return (await this.perfilAtual())?.estabelecimento?.nome ?? null;
  }

  /** Tipo do usuário logado, ou null se não houver sessão. */
  async buscarTipoAtual(): Promise<TipoPerfil | null> {
    return (await this.perfilAtual())?.tipo ?? null;
  }

  private async buscarPerfil(usuarioId: string): Promise<PerfilAtual> {
    const { data, error } = await this.supabase.client
      .from('perfis')
      .select('nome, tipo, estabelecimento:estabelecimentos(nome)')
      .eq('id', usuarioId)
      .single();

    if (error) throw error;
    return data as unknown as PerfilAtual;
  }
}
