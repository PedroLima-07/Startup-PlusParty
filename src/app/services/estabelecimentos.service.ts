import { Injectable, inject } from '@angular/core';
import { Estabelecimento } from '../models';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class EstabelecimentosService {
  private supabase = inject(SupabaseService);

  async listar(): Promise<Estabelecimento[]> {
    const { data, error } = await this.supabase.client
      .from('estabelecimentos')
      .select('*')
      .order('nome');

    if (error) throw error;
    return (data ?? []) as Estabelecimento[];
  }

  async buscarPorId(id: string): Promise<Estabelecimento | null> {
    const { data, error } = await this.supabase.client
      .from('estabelecimentos')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Estabelecimento | null;
  }
}
