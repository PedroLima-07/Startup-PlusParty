import { RegistrosDesempenho, calcularDesempenho, contarPedidosPorAtendente } from './desempenho.service';

/** Quinta, 15/10/2026, 23h: a noite de hoje começou às 6h. */
const AGORA = new Date(2026, 9, 15, 23, 0);

function em(dia: number, hora: number, minuto = 0): string {
  return new Date(2026, 9, dia, hora, minuto).toISOString();
}

function registros(parcial: Partial<RegistrosDesempenho>): RegistrosDesempenho {
  return { itens: [], liberacoes: [], pagamentos: [], ...parcial };
}

describe('calcularDesempenho', () => {
  it('conta cada pedido uma vez, mesmo com vários itens dele', () => {
    const resultado = calcularDesempenho(
      registros({
        itens: [
          { pedido_id: 'p1', quantidade: 2, pronto_em: em(15, 21, 10) },
          { pedido_id: 'p1', quantidade: 1, pronto_em: em(15, 21, 12) },
          { pedido_id: 'p2', quantidade: 3, pronto_em: em(15, 22, 5) },
        ],
      }),
      AGORA,
    );

    expect(resultado.hoje.pedidos).toBe(2);
    expect(resultado.hoje.itens).toBe(6);
  });

  it('separa a noite de hoje das anteriores, e a madrugada conta na noite que começou antes', () => {
    const resultado = calcularDesempenho(
      registros({
        itens: [
          { pedido_id: 'hoje', quantidade: 1, pronto_em: em(15, 20) },
          { pedido_id: 'madrugada', quantidade: 1, pronto_em: em(15, 2) },
          { pedido_id: 'ontem', quantidade: 1, pronto_em: em(14, 22) },
        ],
        liberacoes: [em(15, 19), em(14, 21)],
        pagamentos: [em(15, 22)],
      }),
      AGORA,
    );

    expect(resultado.hoje).toMatchObject({ pedidos: 1, comandasLiberadas: 1, pagamentosConfirmados: 1 });
    expect(resultado.semana).toMatchObject({ pedidos: 3, comandasLiberadas: 2, pagamentosConfirmados: 1 });
    // A madrugada de 15/10 pertence à noite de 14/10 (quarta).
    expect(resultado.semana.barras.at(-2)).toEqual({ rotulo: 'Qua', valor: 2 });
    expect(resultado.semana.barras.at(-1)).toEqual({ rotulo: 'Hoje', valor: 1 });
  });

  it('desenha as horas de hoje da primeira à última entrega, sem buracos', () => {
    const resultado = calcularDesempenho(
      registros({
        itens: [
          { pedido_id: 'a', quantidade: 1, pronto_em: em(15, 21, 10) },
          { pedido_id: 'b', quantidade: 1, pronto_em: em(15, 21, 40) },
          { pedido_id: 'c', quantidade: 1, pronto_em: em(15, 23, 5) },
        ],
      }),
      AGORA,
    );

    expect(resultado.hoje.barras).toEqual([
      { rotulo: '21h', valor: 2 },
      { rotulo: '22h', valor: 0 },
      { rotulo: '23h', valor: 1 },
    ]);
  });

  it('mostra as 7 noites, da mais antiga até hoje', () => {
    const resultado = calcularDesempenho(registros({}), AGORA);

    expect(resultado.semana.barras.map((b) => b.rotulo)).toEqual([
      'Sex',
      'Sáb',
      'Dom',
      'Seg',
      'Ter',
      'Qua',
      'Hoje',
    ]);
  });

  it('a média por noite ignora as folgas', () => {
    const resultado = calcularDesempenho(
      registros({
        itens: [
          { pedido_id: 'a', quantidade: 1, pronto_em: em(15, 21) },
          { pedido_id: 'b', quantidade: 1, pronto_em: em(15, 22) },
          { pedido_id: 'c', quantidade: 1, pronto_em: em(12, 22) },
        ],
      }),
      AGORA,
    );

    expect(resultado.semana.noitesTrabalhadas).toBe(2);
    expect(resultado.semana.mediaPorNoite).toBe(2);
  });

  it('sem nada registrado, tudo zero e nenhuma barra de hoje', () => {
    const resultado = calcularDesempenho(registros({}), AGORA);

    expect(resultado.hoje).toEqual({
      pedidos: 0,
      itens: 0,
      comandasLiberadas: 0,
      pagamentosConfirmados: 0,
      barras: [],
    });
    expect(resultado.semana.mediaPorNoite).toBe(0);
  });
});

describe('contarPedidosPorAtendente', () => {
  it('conta pedidos distintos de cada atendente', () => {
    const contagem = contarPedidosPorAtendente([
      { pedido_id: 'p1', pronto_por: 'ana' },
      { pedido_id: 'p1', pronto_por: 'ana' },
      { pedido_id: 'p2', pronto_por: 'ana' },
      { pedido_id: 'p3', pronto_por: 'rafa' },
    ]);

    expect(contagem.get('ana')).toBe(2);
    expect(contagem.get('rafa')).toBe(1);
  });
});
