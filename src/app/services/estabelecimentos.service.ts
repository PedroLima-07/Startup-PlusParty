import { Injectable, inject } from '@angular/core';
import { Estabelecimento } from '../models';

export type RedesELocalizacao = Pick<
  Estabelecimento,
  'instagram' | 'tiktok' | 'whatsapp' | 'latitude' | 'longitude'
>;

/** O banco recusou um dos campos de redes ou localização (regra *_check). */
export class RedeInvalidaError extends Error {
  constructor(readonly campo: 'instagram' | 'tiktok' | 'whatsapp' | 'localizacao') {
    super(`Campo inválido: ${campo}`);
  }
}
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

  /**
   * O gerente grava as redes e o ponto do bar no mapa. O banco limpa o que foi
   * digitado ("@bardoze", "(11) 98765-4321") e devolve como ficou gravado.
   * Recusa com `RedeInvalidaError` o que continua inválido.
   */
  async salvarRedesELocalizacao(id: string, dados: RedesELocalizacao): Promise<RedesELocalizacao> {
    const { data, error } = await this.supabase.client
      .from('estabelecimentos')
      .update(dados)
      .eq('id', id)
      .select('instagram, tiktok, whatsapp, latitude, longitude')
      .single();

    if (error) {
      const regra = /estabelecimentos_(instagram|tiktok|whatsapp|localizacao)_check/.exec(error.message ?? '');
      if (regra) throw new RedeInvalidaError(regra[1] as RedeInvalidaError['campo']);
      throw error;
    }
    // A lista guardada ficou velha para este bar.
    this.guardada = null;
    return data as RedesELocalizacao;
  }

  /** Ids dos bares com evento hoje (o dia do bar vira às 6h). */
  async baresComEventoHoje(): Promise<Set<string>> {
    const { data, error } = await this.supabase.client.rpc('bares_com_evento_hoje');
    if (error) throw error;
    return new Set((data ?? []) as string[]);
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
