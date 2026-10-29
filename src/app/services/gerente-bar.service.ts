import { Injectable, inject } from '@angular/core';
import {
  AvaliacaoGerente,
  AvaliacoesPeriodo,
  EventoDoBar,
  NovoEvento,
  ResultadosPeriodo,
} from '../models';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

/**
 * O que o gerente consulta e cuida do próprio bar: resultados por período,
 * avaliações (responder e denunciar) e a agenda de eventos. As somas e as
 * regras ficam no banco (resultados_periodo.sql, avaliacoes.sql,
 * agenda_eventos.sql); aqui só se pede e se grava.
 */
@Injectable({ providedIn: 'root' })
export class GerenteBarService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);

  // ------------------------------------------------------------ resultados
  async resultados(dias: number): Promise<ResultadosPeriodo> {
    const { data, error } = await this.supabase.client.rpc('resultados_periodo', { p_dias: dias });
    if (error) throw error;
    return data as ResultadosPeriodo;
  }

  // ------------------------------------------------------------ avaliações
  async numerosDasAvaliacoes(dias: number): Promise<AvaliacoesPeriodo> {
    const { data, error } = await this.supabase.client.rpc('avaliacoes_periodo', { p_dias: dias });
    if (error) throw error;
    return data as AvaliacoesPeriodo;
  }

  /** Avaliações do bar no período, das mais novas, com o primeiro nome de quem avaliou. */
  async avaliacoes(dias: number): Promise<AvaliacaoGerente[]> {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
    const { data, error } = await this.supabase.client
      .from('avaliacoes')
      .select(
        'id, nota, comentario, criada_em, resposta, respondida_em, denunciada_em, autor:perfis!avaliacoes_usuario_id_fkey(nome)',
      )
      .eq('estabelecimento_id', await this.meuBar())
      .gte('criada_em', desde)
      .order('criada_em', { ascending: false })
      .limit(100);

    if (error) throw error;
    type Linha = Omit<AvaliacaoGerente, 'autor'> & { autor: { nome: string | null } | null };
    return ((data ?? []) as unknown as Linha[]).map((linha) => ({
      ...linha,
      autor: primeiroNome(linha.autor?.nome),
    }));
  }

  async responder(avaliacaoId: string, texto: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('responder_avaliacao', {
      p_avaliacao: avaliacaoId,
      p_texto: texto,
    });
    if (error) throw error;
  }

  async denunciar(avaliacaoId: string, motivo: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('denunciar_avaliacao', {
      p_avaliacao: avaliacaoId,
      p_motivo: motivo,
    });
    if (error) throw error;
  }

  // ---------------------------------------------------------------- agenda
  /**
   * Eventos do bar que ainda vão acontecer (os semanais sempre), com o número
   * de interessados. Cancelados vêm por último.
   */
  async eventos(): Promise<EventoDoBar[]> {
    const bar = await this.meuBar();
    const [eventos, agenda] = await Promise.all([
      this.supabase.client
        .from('eventos')
        .select('id, titulo, descricao, inicio, fim, entrada, repete_semanal, cancelado_em')
        .eq('estabelecimento_id', bar)
        .or(`repete_semanal.eq.true,inicio.gte.${new Date(Date.now() - 6 * 3_600_000).toISOString()}`)
        .order('inicio'),
      this.supabase.client.rpc('agenda_do_bar', { p_estabelecimento: bar, p_dias: 120 }),
    ]);
    if (eventos.error) throw eventos.error;

    // O gerente não lê quem marcou interesse; a contagem vem da agenda pública.
    const interessados = new Map<string, number>();
    for (const linha of (agenda.data ?? []) as { evento_id: string; interessados: number }[]) {
      interessados.set(linha.evento_id, linha.interessados);
    }

    return ((eventos.data ?? []) as Omit<EventoDoBar, 'interessados'>[])
      .map((evento) => ({ ...evento, interessados: interessados.get(evento.id) ?? 0 }))
      .sort((a, b) => Number(!!a.cancelado_em) - Number(!!b.cancelado_em));
  }

  async criarEvento(evento: NovoEvento): Promise<void> {
    const { error } = await this.supabase.client
      .from('eventos')
      .insert({ ...evento, estabelecimento_id: await this.meuBar() });
    if (error) throw error;
  }

  async editarEvento(id: string, evento: NovoEvento): Promise<void> {
    const { error } = await this.supabase.client.from('eventos').update(evento).eq('id', id);
    if (error) throw error;
  }

  /** Cancela (a série inteira, se for semanal). O banco avisa quem marcou interesse. */
  async cancelarEvento(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('eventos')
      .update({ cancelado_em: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  private async meuBar(): Promise<string> {
    const id = (await this.auth.perfilAtual())?.estabelecimento?.id;
    if (!id) throw new Error('Gerente sem bar');
    return id;
  }
}

function primeiroNome(nome: string | null | undefined): string {
  return nome?.trim().split(/\s+/)[0] || 'Cliente';
}
