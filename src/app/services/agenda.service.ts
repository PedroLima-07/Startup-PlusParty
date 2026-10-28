import { Injectable, inject } from '@angular/core';
import { EventoAgenda } from '../models';
import { SupabaseService } from './supabase.service';

/**
 * Agenda de eventos de um bar, vista pelo cliente (supabase/agenda_eventos.sql).
 * Quem marca interesse recebe um lembrete 2 horas antes, enviado pelo banco.
 */
@Injectable({ providedIn: 'root' })
export class AgendaService {
  private supabase = inject(SupabaseService);

  /** Próximos eventos (30 dias), em ordem de data. Cancelados vêm marcados. */
  async doBar(estabelecimentoId: string, dias = 30): Promise<EventoAgenda[]> {
    const { data, error } = await this.supabase.client.rpc('agenda_do_bar', {
      p_estabelecimento: estabelecimentoId,
      p_dias: dias,
    });
    if (error) throw error;
    return (data ?? []) as EventoAgenda[];
  }

  async marcarInteresse(eventoId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('marcar_interesse', { p_evento: eventoId });
    if (error) throw error;
  }

  async desmarcarInteresse(eventoId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('desmarcar_interesse', { p_evento: eventoId });
    if (error) throw error;
  }
}
