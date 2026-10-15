import { Injectable, inject, signal } from '@angular/core';
import {
  ConviteEquipe,
  ConviteInfo,
  Funcionario,
  FuncionarioDetalhe,
  MinhaSolicitacaoEquipe,
  SolicitacaoPendente,
} from '../models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

export const ROTA_AGUARDANDO_GERENTE = '/atendente/aguardando';
/** Início do endereço do link de convite: /convite/<código>. */
export const ROTA_CONVITE = '/convite/';

/** Formato de cada linha que a consulta de solicitações pendentes devolve. */
interface LinhaSolicitacaoPendente {
  id: string;
  telefone: string;
  criada_em: string;
  convite_id: string | null;
  candidato: { nome: string; email: string; foto_url: string | null } | null;
}

/**
 * Entrada e saída de atendentes de um bar (ver supabase/equipe.sql e
 * supabase/equipe_convites.sql): o gerente gera um link de convite, a pessoa
 * aceita, o gerente aprova, recusa ou remove.
 */
@Injectable({
  providedIn: 'root',
})
export class EquipeService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);

  /**
   * Pedidos esperando resposta no bar do gerente logado. Fica aqui para a aba
   * Equipe e o contador do menu do gerente mostrarem a mesma lista.
   */
  readonly pendentes = signal<SolicitacaoPendente[]>([]);

  // ------------------------------------------------------------------
  // Quem recebeu o convite
  // ------------------------------------------------------------------

  /** Bar e situação do convite; null se o código não existe. Funciona sem login. */
  async verConvite(codigo: string): Promise<ConviteInfo | null> {
    const { data, error } = await this.supabase.client.rpc('ver_convite', { p_codigo: codigo });

    if (error) throw error;
    return ((data ?? []) as ConviteInfo[])[0] ?? null;
  }

  /**
   * Usa o convite e cria o pedido para entrar na equipe do bar dele. O perfil
   * só muda quando o gerente aprovar.
   */
  async aceitarConvite(codigo: string, telefone: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('aceitar_convite', {
      p_codigo: codigo,
      p_telefone: telefone,
    });

    if (error) throw error;
  }

  /** O pedido mais recente de quem está logado, ou null se nunca pediu. */
  async buscarMinhaSolicitacao(): Promise<MinhaSolicitacaoEquipe | null> {
    const usuario = await this.authService.usuarioAtual();
    if (!usuario) return null;

    const { data, error } = await this.supabase.client
      .from('solicitacoes_equipe')
      .select('id, status, estabelecimento:estabelecimentos(nome)')
      .eq('usuario_id', usuario.id)
      .order('criada_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as unknown as MinhaSolicitacaoEquipe | null;
  }

  /** Cancela um pedido pendente ou dispensa um recusado. */
  async desistir(solicitacaoId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('solicitacoes_equipe')
      .delete()
      .eq('id', solicitacaoId);

    if (error) throw error;
  }

  /**
   * Onde a pessoa logada começa, ou null sem sessão. É a tela inicial do tipo
   * dela, com uma exceção: o cliente que pediu para trabalhar num bar vai para
   * a tela de espera, que mostra a resposta do gerente.
   */
  async telaInicial(): Promise<string | null> {
    const [tipo, solicitacao] = await Promise.all([
      this.authService.buscarTipoAtual(),
      // O pedido é um desvio opcional: se a consulta falhar, segue o caminho normal.
      this.buscarMinhaSolicitacao().catch(() => null),
    ]);

    if (!tipo) return null;
    if (tipo === 'cliente' && solicitacao) return ROTA_AGUARDANDO_GERENTE;
    return this.authService.telaInicial(tipo);
  }

  // ------------------------------------------------------------------
  // Gerente: convites
  // ------------------------------------------------------------------

  /** Gera um link novo, válido por 48 horas e para uma pessoa só. */
  async criarConvite(): Promise<ConviteEquipe> {
    const { data, error } = await this.supabase.client.rpc('criar_convite');

    if (error) throw error;
    const { id, codigo, criado_em, expira_em } = data as ConviteEquipe;
    return { id, codigo, criado_em, expira_em };
  }

  /** Convites do bar ainda não usados e dentro da validade, do mais novo ao mais antigo. */
  async listarConvitesAbertos(): Promise<ConviteEquipe[]> {
    const { data, error } = await this.supabase.client
      .from('convites_equipe')
      .select('id, codigo, criado_em, expira_em')
      .eq('estabelecimento_id', await this.barDoGerente())
      .is('usado_em', null)
      .gt('expira_em', new Date().toISOString())
      .order('criado_em', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ConviteEquipe[];
  }

  /** O link para de funcionar na hora. */
  async cancelarConvite(conviteId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('convites_equipe')
      .delete()
      .eq('id', conviteId);

    if (error) throw error;
  }

  // ------------------------------------------------------------------
  // Gerente: equipe
  // ------------------------------------------------------------------

  /** Atualiza `pendentes` com os pedidos esperando resposta, do mais antigo ao mais novo. */
  async carregarPendentes(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('solicitacoes_equipe')
      .select('id, telefone, criada_em, convite_id, candidato:perfis(nome, email, foto_url)')
      .eq('estabelecimento_id', await this.barDoGerente())
      .eq('status', 'pendente')
      .order('criada_em');

    if (error) throw error;
    this.pendentes.set(
      ((data ?? []) as unknown as LinhaSolicitacaoPendente[]).map((linha) => ({
        id: linha.id,
        nome: linha.candidato?.nome.trim() || 'Sem nome',
        email: linha.candidato?.email ?? '',
        telefone: linha.telefone,
        foto_url: linha.candidato?.foto_url ?? null,
        criada_em: linha.criada_em,
        peloConvite: linha.convite_id !== null,
      })),
    );
  }

  /**
   * Atendentes do bar do gerente. O filtro pelo bar é necessário: o RLS também
   * deixa o gerente ver o perfil de quem tem comanda no bar, e um atendente de
   * outro lugar pode estar ali como cliente.
   */
  async listarFuncionarios(): Promise<Funcionario[]> {
    const { data, error } = await this.supabase.client
      .from('perfis')
      .select('id, nome, email, telefone, foto_url')
      .eq('tipo', 'funcionario')
      .eq('estabelecimento_id', await this.barDoGerente())
      .order('nome');

    if (error) throw error;
    return (data ?? []) as Funcionario[];
  }

  /** Um atendente do bar do gerente, com a data em que entrou; null se não é da equipe. */
  async buscarFuncionario(usuarioId: string): Promise<FuncionarioDetalhe | null> {
    const bar = await this.barDoGerente();

    const [perfil, entrada] = await Promise.all([
      this.supabase.client
        .from('perfis')
        .select('id, nome, email, telefone, foto_url')
        .eq('id', usuarioId)
        .eq('tipo', 'funcionario')
        .eq('estabelecimento_id', bar)
        .maybeSingle(),
      this.supabase.client
        .from('solicitacoes_equipe')
        .select('respondida_em, convite_id')
        .eq('usuario_id', usuarioId)
        .eq('estabelecimento_id', bar)
        .eq('status', 'aprovada')
        .order('respondida_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (perfil.error) throw perfil.error;
    if (entrada.error) throw entrada.error;
    if (!perfil.data) return null;

    const aprovacao = entrada.data as { respondida_em: string | null; convite_id: string | null } | null;
    return {
      ...(perfil.data as Funcionario),
      naEquipeDesde: aprovacao?.respondida_em ?? null,
      peloConvite: Boolean(aprovacao?.convite_id),
    };
  }

  /** Aprovar transforma quem pediu em funcionário do bar; recusar só encerra o pedido. */
  async responder(solicitacaoId: string, aprovar: boolean): Promise<void> {
    const { error } = await this.supabase.client.rpc('responder_solicitacao', {
      p_solicitacao_id: solicitacaoId,
      p_aprovar: aprovar,
    });

    if (error) throw error;
  }

  /** O funcionário volta a ser cliente e perde o acesso aos pedidos do bar. */
  async remover(usuarioId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('remover_funcionario', {
      p_usuario_id: usuarioId,
    });

    if (error) throw error;
  }

  private async barDoGerente(): Promise<string> {
    const bar = (await this.authService.perfilAtual())?.estabelecimento?.id;
    if (!bar) throw new Error('O usuário logado não está vinculado a um bar.');
    return bar;
  }
}
