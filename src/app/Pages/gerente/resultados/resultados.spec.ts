import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ResultadosPeriodo, TotaisResultados } from '../../../models';
import { GerenteBarService } from '../../../services/gerente-bar.service';
import { MovimentoService } from '../../../services/movimento.service';
import { Resultados, variacao } from './resultados';

registerLocaleData(localePt);

function totais(parcial: Partial<TotaisResultados>): TotaisResultados {
  return {
    faturamento: 0,
    comandas_pagas: 0,
    ticket_medio: null,
    nao_pagas: 0,
    valor_nao_pago: 0,
    recusadas: 0,
    canceladas: 0,
    clientes: 0,
    clientes_que_voltaram: 0,
    comandas_na_mesa: 0,
    comandas_no_balcao: 0,
    itens_vendidos: 0,
    faturamento_bar: 0,
    faturamento_cozinha: 0,
    minutos_permanencia: null,
    minutos_para_liberar: null,
    minutos_para_pagar: null,
    minutos_preparo_bar: null,
    minutos_preparo_cozinha: null,
    ...parcial,
  };
}

const SETE_DIAS: ResultadosPeriodo = {
  periodo: { dias: 7, de: '2026-10-23', ate: '2026-10-29' },
  totais: totais({ faturamento: 1120, comandas_pagas: 10, ticket_medio: 112, clientes: 9, nao_pagas: 1, valor_nao_pago: 86 }),
  anterior: totais({ faturamento: 1000, comandas_pagas: 10, ticket_medio: 100, clientes: 0 }),
  por_dia: [
    { dia: '2026-10-28', faturamento: 200, comandas_pagas: 2 },
    { dia: '2026-10-29', faturamento: 400, comandas_pagas: 4 },
  ],
  calor: [{ dia_semana: 5, hora: 22, comandas: 9 }],
  mais_vendidos: [{ nome: 'Chope Pilsen', quantidade: 40, receita: 480 }],
  mais_receita: [],
  sem_venda: [{ nome: 'Negroni', categoria: 'Drinks' }],
};

describe('Resultados (gerente)', () => {
  let fixture: ComponentFixture<Resultados>;
  let resultados: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll<HTMLButtonElement>('.periodos button')).find(
      (b) => b.textContent?.trim() === rotulo,
    )!;
  }

  beforeEach(async () => {
    resultados = vi.fn().mockResolvedValue(SETE_DIAS);
    await TestBed.configureTestingModule({
      imports: [Resultados],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: MovimentoService,
          useValue: {
            atualizar: vi.fn(),
            erro: signal(null),
            lotacaoPorHora: signal([]),
            maisVendidos: signal([]),
            minutosPreparoBar: signal(null),
            minutosPreparoCozinha: signal(null),
          },
        },
        {
          provide: GerenteBarService,
          useValue: {
            resultados,
            numerosDasAvaliacoes: async () => ({
              dias: 7,
              total: 6,
              media: 4.2,
              sem_resposta: 2,
              distribuicao: { 1: 0, 2: 1, 3: 0, 4: 2, 5: 3 },
              anterior: { total: 0, media: null },
            }),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Resultados);
  });

  it('abre em Hoje, com a leitura da noite', () => {
    expect(tela().textContent).toContain('Lotação por hora');
    expect(resultados).not.toHaveBeenCalled();
  });

  it('7 dias mostra os números do banco comparados com o período anterior', async () => {
    botao('7 dias').click();
    await fixture.whenStable();
    const texto = tela().textContent ?? '';

    expect(resultados).toHaveBeenCalledWith(7);
    expect(texto).toContain('Últimos 7 dias');
    expect(texto).toMatch(/R\$\s1\.120/);
    expect(texto).toContain('▲ 12%');
    expect(texto).toContain('sem comparação');
    expect(texto).toContain('Sex às 22h');
    expect(texto).toContain('Negroni');
    expect(texto).toContain('★ 4,2 em 6 avaliações');
    expect(texto).toContain('2 sem resposta');
  });

  it('voltar a um período já aberto não busca de novo', async () => {
    botao('7 dias').click();
    await fixture.whenStable();
    botao('Hoje').click();
    botao('7 dias').click();
    await fixture.whenStable();

    expect(resultados).toHaveBeenCalledTimes(1);
  });
});

describe('variacao', () => {
  it('calcula a mudança em % e não compara com zero', () => {
    expect(variacao(112, 100)).toEqual({ texto: '▲ 12%', sentido: 'subiu' });
    expect(variacao(90, 100)).toEqual({ texto: '▼ 10%', sentido: 'caiu' });
    expect(variacao(100, 100)?.sentido).toBe('igual');
    expect(variacao(5, 0)).toBeNull();
    expect(variacao(null, 10)).toBeNull();
  });
});
