import { Injectable, inject } from '@angular/core';
import { HORA_VIRADA_DO_DIA, inicioDaNoite } from './movimento.service';
import { SupabaseService } from './supabase.service';

/** Quantas noites o perfil do atendente compara. */
export const NOITES_DO_PERFIL = 7;

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export interface BarraDesempenho {
  rotulo: string;
  valor: number;
}

/** Números de um atendente num período (a noite de hoje ou as últimas noites). */
export interface ResumoDesempenho {
  /** Pedidos com pelo menos um item que ele marcou como pronto. */
  pedidos: number;
  itens: number;
  comandasLiberadas: number;
  pagamentosConfirmados: number;
  barras: BarraDesempenho[];
}

export interface Desempenho {
  /** Barras por hora da noite. */
  hoje: ResumoDesempenho;
  /** Barras por noite, da mais antiga até hoje. */
  semana: ResumoDesempenho & {
    noitesTrabalhadas: number;
    /** Média de pedidos nas noites em que ele entregou algo (folga não conta). */
    mediaPorNoite: number;
  };
}

/** O que o banco registra de um atendente (ver supabase/equipe_convites.sql, parte 3). */
export interface RegistrosDesempenho {
  itens: { pedido_id: string; quantidade: number; pronto_em: string }[];
  liberacoes: string[];
  pagamentos: string[];
}

/** Início da noite mais antiga que o perfil mostra. */
export function inicioDasNoites(agora: Date): Date {
  const inicio = inicioDaNoite(agora);
  inicio.setDate(inicio.getDate() - (NOITES_DO_PERFIL - 1));
  return inicio;
}

/** Transforma os registros do banco nos números e barras do perfil. */
export function calcularDesempenho(registros: RegistrosDesempenho, agora: Date): Desempenho {
  const primeiraNoite = inicioDasNoites(agora);
  const noiteDeHoje = inicioDaNoite(agora);
  const deHoje = (data: string) => new Date(data) >= noiteDeHoje;

  // Um pedido conta uma vez só, na hora em que o primeiro item dele ficou pronto.
  const prontoPrimeiro = new Map<string, Date>();
  for (const item of registros.itens) {
    const quando = new Date(item.pronto_em);
    const anterior = prontoPrimeiro.get(item.pedido_id);
    if (!anterior || quando < anterior) prontoPrimeiro.set(item.pedido_id, quando);
  }

  const resumir = (filtro: (data: string) => boolean) => {
    const itens = registros.itens.filter((item) => filtro(item.pronto_em));
    return {
      pedidos: new Set(itens.map((item) => item.pedido_id)).size,
      itens: itens.reduce((total, item) => total + item.quantidade, 0),
      comandasLiberadas: registros.liberacoes.filter(filtro).length,
      pagamentosConfirmados: registros.pagamentos.filter(filtro).length,
    };
  };

  const porNoite = Array.from({ length: NOITES_DO_PERFIL }, () => 0);
  const porHora = new Map<number, number>();
  for (const quando of prontoPrimeiro.values()) {
    const noite = Math.round((inicioDaNoite(quando).getTime() - primeiraNoite.getTime()) / 86_400_000);
    if (noite >= 0 && noite < NOITES_DO_PERFIL) porNoite[noite]++;
    if (quando >= noiteDeHoje) porHora.set(quando.getHours(), (porHora.get(quando.getHours()) ?? 0) + 1);
  }

  const semana = resumir(() => true);
  const noitesTrabalhadas = porNoite.filter((pedidos) => pedidos > 0).length;

  return {
    hoje: { ...resumir(deHoje), barras: barrasPorHora(porHora) },
    semana: {
      ...semana,
      barras: porNoite.map((valor, noite) => ({
        rotulo: noite === NOITES_DO_PERFIL - 1 ? 'Hoje' : diaDaNoite(primeiraNoite, noite),
        valor,
      })),
      noitesTrabalhadas,
      mediaPorNoite: noitesTrabalhadas > 0 ? Math.round(semana.pedidos / noitesTrabalhadas) : 0,
    },
  };
}

/** Pedidos entregues hoje por atendente, a partir dos itens marcados como prontos. */
export function contarPedidosPorAtendente(
  itens: { pedido_id: string; pronto_por: string }[],
): Map<string, number> {
  const pedidos = new Map<string, Set<string>>();
  for (const item of itens) {
    const doAtendente = pedidos.get(item.pronto_por) ?? new Set<string>();
    doAtendente.add(item.pedido_id);
    pedidos.set(item.pronto_por, doAtendente);
  }
  return new Map(Array.from(pedidos, ([atendente, ids]) => [atendente, ids.size]));
}

/**
 * Da primeira à última hora com entrega, sem buracos, na ordem da noite
 * (22h, 23h, 0h, 1h...).
 */
function barrasPorHora(porHora: Map<number, number>): BarraDesempenho[] {
  if (porHora.size === 0) return [];

  const ordemNaNoite = (hora: number) => (hora - HORA_VIRADA_DO_DIA + 24) % 24;
  const ordens = Array.from(porHora.keys()).map(ordemNaNoite);
  const barras: BarraDesempenho[] = [];
  for (let ordem = Math.min(...ordens); ordem <= Math.max(...ordens); ordem++) {
    const hora = (ordem + HORA_VIRADA_DO_DIA) % 24;
    barras.push({ rotulo: `${hora}h`, valor: porHora.get(hora) ?? 0 });
  }
  return barras;
}

function diaDaNoite(primeiraNoite: Date, noite: number): string {
  const dia = new Date(primeiraNoite);
  dia.setDate(dia.getDate() + noite);
  return DIAS_DA_SEMANA[dia.getDay()];
}

/**
 * Desempenho dos atendentes, a partir do que o banco registra sobre quem
 * marcou cada item como pronto e quem liberou e recebeu cada comanda. O RLS
 * limita tudo ao bar do gerente logado.
 */
@Injectable({
  providedIn: 'root',
})
export class DesempenhoService {
  private supabase = inject(SupabaseService);

  /** Pedidos entregues na noite de hoje, por atendente (id → quantidade). */
  async pedidosDeHojePorAtendente(): Promise<Map<string, number>> {
    const { data, error } = await this.supabase.client
      .from('pedido_itens')
      .select('pedido_id, pronto_por')
      .not('pronto_por', 'is', null)
      .gte('pronto_em', inicioDaNoite(new Date()).toISOString());

    if (error) throw error;
    return contarPedidosPorAtendente((data ?? []) as { pedido_id: string; pronto_por: string }[]);
  }

  /** Números da noite de hoje e das últimas noites de um atendente. */
  async buscar(atendenteId: string): Promise<Desempenho> {
    const agora = new Date();
    const desde = inicioDasNoites(agora).toISOString();

    const [itens, liberacoes, pagamentos] = await Promise.all([
      this.supabase.client
        .from('pedido_itens')
        .select('pedido_id, quantidade, pronto_em')
        .eq('pronto_por', atendenteId)
        .gte('pronto_em', desde),
      this.supabase.client
        .from('comandas')
        .select('liberada_em')
        .eq('liberada_por', atendenteId)
        .gte('liberada_em', desde),
      this.supabase.client
        .from('comandas')
        .select('pagamento_em')
        .eq('pagamento_por', atendenteId)
        .gte('pagamento_em', desde),
    ]);

    for (const resposta of [itens, liberacoes, pagamentos]) {
      if (resposta.error) throw resposta.error;
    }

    return calcularDesempenho(
      {
        itens: (itens.data ?? []) as RegistrosDesempenho['itens'],
        liberacoes: ((liberacoes.data ?? []) as { liberada_em: string }[]).map((c) => c.liberada_em),
        pagamentos: ((pagamentos.data ?? []) as { pagamento_em: string }[]).map((c) => c.pagamento_em),
      },
      agora,
    );
  }
}
