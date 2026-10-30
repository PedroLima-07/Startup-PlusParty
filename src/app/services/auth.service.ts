import { Injectable, inject } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { TipoPerfil } from '../models';
import { SupabaseService } from './supabase.service';

const BUCKET_FOTOS = 'fotos-perfil';

/** O que as telas e os guards precisam saber de quem está logado. */
export interface PerfilAtual {
  nome: string;
  tipo: TipoPerfil;
  /** Bar do funcionário/gerente; `null` para cliente. */
  estabelecimento: { id: string; nome: string } | null;
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
   *
   * Com "Confirm email" ligado no Supabase, o cadastro não abre a sessão: o
   * Supabase manda um código de 6 dígitos por e-mail, e a conta só entra
   * depois de `confirmarEmail`. Quem chama descobre isso por `precisaConfirmar`.
   */
  async cadastrar(
    nome: string,
    email: string,
    senha: string,
  ): Promise<{ precisaConfirmar: boolean }> {
    this.perfilGuardado = null;
    const { data, error } = await this.supabase.client.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });

    if (error) throw error;

    // E-mail já cadastrado e confirmado: com a confirmação ligada o Supabase não
    // responde com erro (para não revelar quem tem conta) e devolve um usuário
    // sem identidades, sem mandar código nenhum. Aqui vira o erro de sempre.
    if (data.user && data.user.identities?.length === 0) {
      throw new Error('User already registered');
    }

    return { precisaConfirmar: !data.session };
  }

  /**
   * Confere o código de 6 dígitos do e-mail de cadastro. Deu certo: a conta
   * fica confirmada e a sessão abre, como num login.
   */
  async confirmarEmail(email: string, codigo: string): Promise<void> {
    this.perfilGuardado = null;
    const { error } = await this.supabase.client.auth.verifyOtp({
      email,
      token: codigo,
      type: 'email',
    });

    if (error) throw error;
  }

  /** Manda outro código de confirmação para quem se cadastrou e ainda não confirmou. */
  async reenviarCodigo(email: string): Promise<void> {
    const { error } = await this.supabase.client.auth.resend({ type: 'signup', email });
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

  /**
   * Envia a foto de perfil de quem está logado (bucket fotos-perfil, na pasta
   * com o id da pessoa, ver supabase/equipe_convites.sql) e grava o endereço
   * no perfil. Um arquivo novo a cada troca: o endereço muda e nenhum
   * navegador fica mostrando a foto antiga guardada.
   */
  async atualizarFoto(foto: Blob): Promise<void> {
    const usuario = await this.usuarioAtual();
    if (!usuario) throw new Error('Usuário não autenticado.');

    const caminho = `${usuario.id}/${Date.now()}.jpg`;
    const armazenamento = this.supabase.client.storage.from(BUCKET_FOTOS);
    const envio = await armazenamento.upload(caminho, foto, { contentType: 'image/jpeg' });
    if (envio.error) throw envio.error;

    const { error } = await this.supabase.client
      .from('perfis')
      .update({ foto_url: armazenamento.getPublicUrl(caminho).data.publicUrl })
      .eq('id', usuario.id);

    if (error) throw error;
  }

  /**
   * Exclui a conta de quem está logado (supabase/excluir_conta.sql): apaga a
   * foto de perfil, apaga ou anonimiza os dados no banco e encerra a sessão.
   * O banco recusa conta da equipe e quem tem comanda em andamento; a
   * mensagem dele vem no erro.
   */
  async excluirConta(): Promise<void> {
    const usuario = await this.usuarioAtual();
    if (!usuario) throw new Error('Usuário não autenticado.');

    // A foto sai primeiro: depois da exclusão, a pasta não é mais de ninguém.
    const armazenamento = this.supabase.client.storage.from(BUCKET_FOTOS);
    const { data: fotos } = await armazenamento.list(usuario.id);
    if (fotos?.length) {
      await armazenamento.remove(fotos.map((foto) => `${usuario.id}/${foto.name}`));
    }

    const { error } = await this.supabase.client.rpc('excluir_minha_conta');
    if (error) throw new Error(error.message);

    this.perfilGuardado = null;
    // A sessão já foi apagada no banco; aqui só limpa a aba.
    await this.supabase.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
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

  /**
   * Faz a próxima consulta ao perfil ir ao banco. Para quando se sabe que ele
   * mudou por lá, como logo depois de o gerente aprovar o atendente.
   */
  esquecerPerfil(): void {
    this.perfilGuardado = null;
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
      .select('nome, tipo, estabelecimento:estabelecimentos(id, nome)')
      .eq('id', usuarioId)
      .single();

    if (error) throw error;
    return data as unknown as PerfilAtual;
  }
}
