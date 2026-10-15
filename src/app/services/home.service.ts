import { Injectable, inject } from '@angular/core';
import { Comanda, Estabelecimento } from '../models';
import { EstabelecimentosService } from './estabelecimentos.service';
import { SupabaseService } from './supabase.service';

const LIMIAR_LOTACAO = 0.5;

@Injectable({
  providedIn: 'root',
})
export class HomeService {
  private supabase = inject(SupabaseService);
  private estabelecimentosService = inject(EstabelecimentosService);

  /**
   * Da maior nota para a menor, reaproveitando a lista que o Discovery também
   * usa. Bares sem nota vêm primeiro, como na ordenação que o banco fazia.
   */
  async listarEstabelecimentos(): Promise<Estabelecimento[]> {
    const nota = (estabelecimento: Estabelecimento) => estabelecimento.avaliacao ?? Number.MAX_VALUE;
    const lista = await this.estabelecimentosService.listar();
    return [...lista].sort((a, b) => nota(b) - nota(a));
  }

  /** Paga e recusada são finais: nenhuma das duas prende o cliente à comanda. */
  async buscarComandaAtiva(usuarioId: string): Promise<Comanda | null> {
    const { data, error } = await this.supabase.client
      .from('comandas')
      .select('*')
      .eq('usuario_id', usuarioId)
      .not('status', 'in', '(paga,recusada)')
      .order('criada_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as Comanda | null;
  }

  /**
   * Comandas abertas de cada bar, numa consulta só (ver supabase/lotacao.sql).
   * Bares sem comanda aberta não vêm na resposta.
   */
  async contarComandasAbertasPorBar(): Promise<Map<string, number>> {
    const { data, error } = await this.supabase.client.rpc('lotacao_estabelecimentos');

    if (error) throw error;
    const linhas = (data ?? []) as { estabelecimento_id: string; comandas_abertas: number }[];
    return new Map(linhas.map((linha) => [linha.estabelecimento_id, linha.comandas_abertas]));
  }

  /** Limiar simples (sem histerese) — ver nota no PR sobre a simplificação. */
  calcularLotacao(comandasAbertas: number, capacidade: number | null): 'normal' | 'quente' {
    if (!capacidade) return 'normal';
    return comandasAbertas / capacidade >= LIMIAR_LOTACAO ? 'quente' : 'normal';
  }
}
