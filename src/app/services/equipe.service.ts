import { Injectable, inject, signal } from '@angular/core';
import { Funcionario, MinhaSolicitacaoEquipe, SolicitacaoPendente } from '../models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

export const ROTA_CADASTRO_ATENDENTE = '/atendente/cadastro';
export const ROTA_AGUARDANDO_GERENTE = '/atendente/aguardando';

/** Formato de cada linha que a consulta de solicitações pendentes devolve. */
interface LinhaSolicitacaoPendente {
  id: string;
  telefone: string;
  criada_em: string;
  candidato: { nome: string; email: string } | null;
}

/**
 * Entrada e saída de atendentes de um bar (ver supabase/equipe.sql): a pessoa
 * pede para entrar, o gerente do bar aprova, recusa ou remove.
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
  // Quem pede para entrar
  // ------------------------------------------------------------------

  /** Pede para trabalhar no bar. O perfil só muda quando o gerente aprovar. */
  async solicitar(estabelecimentoId: string, telefone: string): Promise<void> {
    const usuario = await this.authService.usuarioAtual();
    if (!usuario) throw new Error('Usuário não autenticado.');

    const { error } = await this.supabase.client.from('solicitacoes_equipe').insert({
      usuario_id: usuario.id,
      estabelecimento_id: estabelecimentoId,
      telefone,
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

  /** Cancela um pedido pendente ou dispensa um recusado, liberando um novo. */
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
  // Gerente
  // ------------------------------------------------------------------

  /** Atualiza `pendentes` com os pedidos esperando resposta, do mais antigo ao mais novo. */
  async carregarPendentes(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('solicitacoes_equipe')
      .select('id, telefone, criada_em, candidato:perfis(nome, email)')
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
        criada_em: linha.criada_em,
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
      .select('id, nome, email, telefone')
      .eq('tipo', 'funcionario')
      .eq('estabelecimento_id', await this.barDoGerente())
      .order('nome');

    if (error) throw error;
    return (data ?? []) as Funcionario[];
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
