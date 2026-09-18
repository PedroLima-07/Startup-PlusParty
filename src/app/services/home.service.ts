import { Injectable, inject } from '@angular/core';
import { Comanda, Estabelecimento } from '../models';
import { SupabaseService } from './supabase.service';

const LIMIAR_LOTACAO = 0.5;

@Injectable({
  providedIn: 'root',
})
export class HomeService {
  private supabase = inject(SupabaseService);

  async listarEstabelecimentos(): Promise<Estabelecimento[]> {
    const { data, error } = await this.supabase.client
      .from('estabelecimentos')
      .select('*')
      .order('avaliacao', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Estabelecimento[];
  }

  async buscarComandaAtiva(usuarioId: string): Promise<Comanda | null> {
    const { data, error } = await this.supabase.client
      .from('comandas')
      .select('*')
      .eq('usuario_id', usuarioId)
      .neq('status', 'paga')
      .order('criada_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as Comanda | null;
  }

  async contarComandasAbertas(estabelecimentoId: string): Promise<number> {
    const { count, error } = await this.supabase.client
      .from('comandas')
      .select('id', { count: 'exact', head: true })
      .eq('estabelecimento_id', estabelecimentoId)
      .in('status', ['aguardando_liberacao', 'aberta']);

    if (error) throw error;
    return count ?? 0;
  }

  /** Limiar simples (sem histerese) — ver nota no PR sobre a simplificação. */
  calcularLotacao(comandasAbertas: number, capacidade: number | null): 'normal' | 'quente' {
    if (!capacidade) return 'normal';
    return comandasAbertas / capacidade >= LIMIAR_LOTACAO ? 'quente' : 'normal';
  }
}
