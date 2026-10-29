import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvaliacoesPeriodo, ResultadosPeriodo, TotaisResultados } from '../../../models';
import { GerenteBarService } from '../../../services/gerente-bar.service';
import { MovimentoService } from '../../../services/movimento.service';
import { GraficoHoras } from '../componentes/grafico-horas';
import { MaisVendidos } from '../componentes/mais-vendidos';
import { TempoPreparo } from '../componentes/tempo-preparo';

export type Periodo = 'hoje' | 3 | 7 | 15 | 30;

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: 3, rotulo: '3 dias' },
  { valor: 7, rotulo: '7 dias' },
  { valor: 15, rotulo: '15 dias' },
  { valor: 30, rotulo: '30 dias' },
];

const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Comparação com o período anterior: "▲ 12%", "▼ 3%" ou "=". */
export interface Variacao {
  texto: string;
  sentido: 'subiu' | 'caiu' | 'igual';
}

export function variacao(atual: number | null, anterior: number | null): Variacao | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  const porcento = Math.round(((atual - anterior) / anterior) * 100);
  if (porcento === 0) return { texto: '= igual', sentido: 'igual' };
  return porcento > 0
    ? { texto: `▲ ${porcento}%`, sentido: 'subiu' }
    : { texto: `▼ ${Math.abs(porcento)}%`, sentido: 'caiu' };
}

/**
 * Resultados do gerente. "Hoje" é a leitura da noite (lotação por hora, mais
 * vendidos e preparo). 3, 7, 15 e 30 dias vêm somados pelo banco
 * (resultados_periodo), cada número comparado com o período anterior.
 */
@Component({
  selector: 'app-resultados',
  imports: [CurrencyPipe, DatePipe, GraficoHoras, MaisVendidos, RouterLink, TempoPreparo],
  templateUrl: './resultados.html',
  styleUrls: ['./resultados.scss', './resultados.desktop.scss', './resultados.periodo.scss'],
})
export class Resultados implements OnInit {
  protected readonly movimento = inject(MovimentoService);
  private readonly gerente = inject(GerenteBarService);

  protected readonly periodos = PERIODOS;
  protected readonly periodo = signal<Periodo>('hoje');
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly dados = signal<ResultadosPeriodo | null>(null);
  protected readonly avaliacoes = signal<AvaliacoesPeriodo | null>(null);
  /** Guardados por período: trocar de volta não busca de novo. */
  private readonly guardados = new Map<number, { dados: ResultadosPeriodo; avaliacoes: AvaliacoesPeriodo | null }>();

  protected readonly cartoes = computed(() => {
    const d = this.dados();
    if (!d) return [];
    const { totais: t, anterior: a } = d;
    return [
      { rotulo: 'Faturamento', valor: t.faturamento, moeda: true, variacao: variacao(t.faturamento, a.faturamento) },
      { rotulo: 'Comandas pagas', valor: t.comandas_pagas, moeda: false, variacao: variacao(t.comandas_pagas, a.comandas_pagas) },
      { rotulo: 'Ticket médio', valor: t.ticket_medio ?? 0, moeda: true, variacao: variacao(t.ticket_medio, a.ticket_medio) },
      { rotulo: 'Clientes', valor: t.clientes, moeda: false, variacao: variacao(t.clientes, a.clientes) },
    ];
  });

  /** Barras do faturamento por dia, em % do maior dia. */
  protected readonly barras = computed(() => {
    const dias = this.dados()?.por_dia ?? [];
    const maior = Math.max(0, ...dias.map((d) => d.faturamento));
    return dias.map((d) => ({
      ...d,
      altura: maior ? Math.max(4, Math.round((d.faturamento / maior) * 100)) : 4,
      semana: DIAS_DA_SEMANA[new Date(`${d.dia}T12:00:00`).getDay()],
    }));
  });

  /** O dia da semana e a hora com mais comandas abertas no período. */
  protected readonly picos = computed(() => {
    const calor = [...(this.dados()?.calor ?? [])].sort((a, b) => b.comandas - a.comandas).slice(0, 3);
    return calor.map((c) => ({ ...c, texto: `${DIAS_DA_SEMANA[c.dia_semana]} às ${c.hora}h` }));
  });

  protected readonly totais = computed<TotaisResultados | null>(() => this.dados()?.totais ?? null);

  ngOnInit(): void {
    void this.movimento.atualizar();
  }

  protected async escolher(periodo: Periodo): Promise<void> {
    this.periodo.set(periodo);
    if (periodo === 'hoje') return;
    await this.carregar(periodo);
  }

  protected async carregar(dias: number): Promise<void> {
    const guardado = this.guardados.get(dias);
    if (guardado) {
      this.dados.set(guardado.dados);
      this.avaliacoes.set(guardado.avaliacoes);
      return;
    }

    this.carregando.set(true);
    this.erro.set(null);
    try {
      // As avaliações são um detalhe da tela: se falharem, os números aparecem sem elas.
      const [dados, avaliacoes] = await Promise.all([
        this.gerente.resultados(dias),
        this.gerente.numerosDasAvaliacoes(dias).catch(() => null),
      ]);
      this.guardados.set(dias, { dados, avaliacoes });
      if (this.periodo() !== dias) return;
      this.dados.set(dados);
      this.avaliacoes.set(avaliacoes);
    } catch {
      this.erro.set('Não foi possível carregar os resultados do período. Tente de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected tentarDeNovo(): void {
    const periodo = this.periodo();
    if (periodo !== 'hoje') void this.carregar(periodo);
  }

  protected minutos(valor: number | null): string {
    return valor === null ? '—' : `${valor} min`;
  }

  protected media(valor: number | null): string {
    return valor === null ? '—' : valor.toFixed(1).replace('.', ',');
  }
}
