import { Injectable, computed, inject, signal } from '@angular/core';
import { AvaliacaoPendente } from '../models';
import { SupabaseService } from './supabase.service';

/**
 * O pedido de avaliação depois de pagar (supabase/avaliacoes.sql).
 *
 * Quem guarda o pedido é o banco: ele volta a cada acesso, em qualquer
 * aparelho, até o cliente responder (avaliar) ou dispensar. Fechar no X só
 * adia até o próximo acesso, e isso fica só na memória desta aba.
 */
@Injectable({
  providedIn: 'root',
})
export class AvaliacaoService {
  private supabase = inject(SupabaseService);
  private iniciado = false;

  private readonly encontrada = signal<AvaliacaoPendente | null>(null);
  /** Comandas que o cliente fechou no X nesta visita. */
  private readonly adiadas = signal<ReadonlySet<string>>(new Set());

  /** O pedido a mostrar agora; null se não há ou se foi adiado. */
  readonly pendente = computed(() => {
    const pendente = this.encontrada();
    return pendente && !this.adiadas().has(pendente.comanda_id) ? pendente : null;
  });

  /** Confere de novo a cada login (e ao abrir o app já logado). */
  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;

    this.supabase.client.auth.onAuthStateChange((_evento, sessao) => {
      // O Supabase pede para não usar o próprio cliente dentro deste aviso.
      setTimeout(() => {
        if (sessao) {
          void this.verificar();
        } else {
          this.encontrada.set(null);
          this.adiadas.set(new Set());
        }
      });
    });
  }

  /** Busca o pedido mais recente. Uma falha só deixa de mostrar o aviso. */
  async verificar(): Promise<void> {
    try {
      const { data, error } = await this.supabase.client.rpc('avaliacao_pendente');
      if (error) throw error;
      this.encontrada.set(((data ?? []) as AvaliacaoPendente[])[0] ?? null);
    } catch {
      this.encontrada.set(null);
    }
  }

  async avaliar(nota: number, comentario: string): Promise<void> {
    const pendente = this.encontrada();
    if (!pendente) return;

    const { error } = await this.supabase.client.rpc('avaliar', {
      p_comanda: pendente.comanda_id,
      p_nota: nota,
      p_comentario: comentario.trim() || null,
    });
    if (error) throw error;
    this.encontrada.set(null);
  }

  /** "Não quero avaliar": o banco não pergunta mais sobre esta conta. */
  async dispensar(): Promise<void> {
    const pendente = this.encontrada();
    if (!pendente) return;

    this.encontrada.set(null);
    await this.supabase.client.rpc('dispensar_avaliacao', { p_comanda: pendente.comanda_id });
  }

  /** Fechar no X: some até o próximo acesso, sem avisar o banco. */
  adiar(): void {
    const pendente = this.encontrada();
    if (!pendente) return;
    this.adiadas.update((adiadas) => new Set(adiadas).add(pendente.comanda_id));
  }
}
