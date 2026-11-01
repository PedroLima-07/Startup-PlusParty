import { Injectable, inject } from '@angular/core';
import { ItemNaoRecebido } from '../models';
import { SupabaseService } from './supabase.service';

const CAMPOS = 'id, comanda_id, nome, setor, quantidade, preco_unitario, status_no_fechamento, motivo, criado_em, ciente_em';

/** Itens que saíram da conta porque o cliente fechou sem recebê-los. O RLS limita ao que cada um pode ver. */
@Injectable({ providedIn: 'root' })
export class ItensNaoRecebidosService {
  private readonly supabase = inject(SupabaseService);

  async daComanda(comandaId: string): Promise<ItemNaoRecebido[]> {
    const { data, error } = await this.supabase.client
      .from('itens_nao_recebidos')
      .select(CAMPOS)
      .eq('comanda_id', comandaId)
      .order('criado_em');
    if (error) throw error;
    return (data ?? []) as ItemNaoRecebido[];
  }

  /** O que a equipe ainda precisa ver para parar o preparo ou conferir. */
  async pendentesDaEquipe(): Promise<ItemNaoRecebido[]> {
    const { data, error } = await this.supabase.client
      .from('itens_nao_recebidos')
      .select(CAMPOS)
      .is('ciente_em', null)
      .order('criado_em');
    if (error) throw error;
    return (data ?? []) as ItemNaoRecebido[];
  }

  async marcarCiente(id: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('marcar_item_nao_recebido_ciente', { p_id: id });
    if (error) throw error;
  }
}
