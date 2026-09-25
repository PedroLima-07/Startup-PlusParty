import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface TabelaEscutada {
  tabela: string;
  /** Filtro do Supabase Realtime, ex.: 'id=eq.123'. */
  filtro?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  /**
   * A sessão fica no sessionStorage: cada aba tem o seu login. Com o padrão
   * (localStorage) todas as abas compartilham um login, e entrar como cliente
   * numa aba fazia a tela do atendente, aberta em outra, agir como cliente.
   * Custo: fechar a aba encerra a sessão.
   */
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey, {
    auth: { storage: sessionStorage },
  });

  /**
   * Chama `aoMudar` quando alguma linha visível dessas tabelas for criada ou
   * alterada. Vários avisos seguidos (ex.: um pedido com 3 itens) viram uma
   * chamada só. Devolve a função que para de escutar.
   *
   * Só funciona para tabelas na publicação `supabase_realtime`
   * (ver supabase/realtime.sql). O RLS também vale aqui: cada um só recebe
   * avisos das linhas que pode ver.
   */
  escutarMudancas(tabelas: TabelaEscutada[], aoMudar: () => void): () => void {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const avisar = () => {
      clearTimeout(espera);
      espera = setTimeout(aoMudar, 300);
    };

    const canal = this.client.channel(`mudancas-${crypto.randomUUID()}`);
    for (const { tabela, filtro } of tabelas) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela, filter: filtro }, avisar);
    }
    canal.subscribe();

    return () => {
      clearTimeout(espera);
      void this.client.removeChannel(canal);
    };
  }
}
