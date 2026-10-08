import { Injectable, inject } from '@angular/core';
import { Estabelecimento } from '../models';
import { SupabaseService } from './supabase.service';

/** Por quanto tempo a lista guardada vale. Depois disso é buscada de novo. */
const VALIDADE_MS = 5 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class EstabelecimentosService {
  private supabase = inject(SupabaseService);

  /**
   * Lista de bares guardada em memória. São dados públicos, que mudam pouco e
   * que as telas pedem uma atrás da outra (Home, Discovery, perfil do bar,
   * abrir comanda, cardápio). Guarda a promessa para que pedidos simultâneos
   * dividam a mesma consulta.
   */
  private guardada: { buscadaEm: number; lista: Promise<Estabelecimento[]> } | null = null;

  /** Em ordem alfabética. O array é compartilhado entre as telas: não altere. */
  listar(): Promise<Estabelecimento[]> {
    const guardada = this.listaGuardada();
    if (guardada) return guardada;

    const lista = this.buscarLista();
    this.guardada = { buscadaEm: Date.now(), lista };
    // Falhou? Não guarda o erro: a próxima chamada tenta de novo.
    lista.catch(() => {
      if (this.guardada?.lista === lista) this.guardada = null;
    });
    return lista;
  }

  /** Usa a lista guardada quando ela ainda vale; senão busca só esse bar. */
  async buscarPorId(id: string): Promise<Estabelecimento | null> {
    const lista = await this.listaGuardada()?.catch(() => []);
    const guardado = lista?.find((estabelecimento) => estabelecimento.id === id);
    if (guardado) return guardado;

    const { data, error } = await this.supabase.client
      .from('estabelecimentos')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Estabelecimento | null;
  }

  private listaGuardada(): Promise<Estabelecimento[]> | null {
    if (!this.guardada || Date.now() - this.guardada.buscadaEm > VALIDADE_MS) return null;
    return this.guardada.lista;
  }

  private async buscarLista(): Promise<Estabelecimento[]> {
    const { data, error } = await this.supabase.client
      .from('estabelecimentos')
      .select('*')
      .order('nome');

    if (error) throw error;
    return (data ?? []) as Estabelecimento[];
  }
}
