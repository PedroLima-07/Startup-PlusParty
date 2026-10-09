import { TestBed } from '@angular/core/testing';
import {
  LinhaComandaMovimento,
  MovimentoService,
  calcularMovimento,
  inicioDaNoite,
} from './movimento.service';

describe('MovimentoService — números derivados', () => {
  let service: MovimentoService;

  beforeEach(() => {
    service = TestBed.inject(MovimentoService);
    service.comandasAbertas.set(34);
    service.comandasPagas.set(58);
    service.comandasAguardandoPagamento.set(3);
    service.faturamento.set(4820);
    service.metaFaturamento.set(6000);
    service.comandasEmMesa.set(27);
    service.comandasNoBalcao.set(7);
  });

  it('soma abertas, pagas e aguardando pagamento no total da noite', () => {
    expect(service.totalComandas()).toBe(95);
  });

  it('calcula o ticket médio só com as comandas pagas', () => {
    expect(service.ticketMedio()).toBeCloseTo(83.1, 1);
  });

  it('sem comanda paga, o ticket médio é zero em vez de dividir por zero', () => {
    service.comandasPagas.set(0);

    expect(service.ticketMedio()).toBe(0);
  });

  it('mostra quanto da meta já foi atingido', () => {
    expect(service.percentualDaMeta()).toBe(80);
  });

  it('acima da meta, o percentual para em 100', () => {
    service.faturamento.set(9000);

    expect(service.percentualDaMeta()).toBe(100);
  });

  it('sem meta definida, o percentual é zero', () => {
    service.metaFaturamento.set(null);

    expect(service.percentualDaMeta()).toBe(0);
  });

  it('calcula a parte das comandas já encerradas e a divisão entre mesas e balcão', () => {
    expect(service.percentualEncerradas()).toBe(61);
    expect(service.percentualEmMesa()).toBe(79);
  });

  it('conta como pedidos parados só os alertas desse tipo', () => {
    service.alertas.set([
      { id: '1', tipo: 'pedido_parado', titulo: '', detalhe: '', comanda: '12' },
      { id: '2', tipo: 'pagamento', titulo: '', detalhe: '', comanda: '07' },
      { id: '3', tipo: 'pedido_parado', titulo: '', detalhe: '', comanda: '15' },
    ]);

    expect(service.pedidosParados()).toBe(2);
  });
});

describe('inicioDaNoite', () => {
  it('à noite, a noite começou hoje às 6h', () => {
    expect(inicioDaNoite(new Date(2026, 9, 9, 23, 30))).toEqual(new Date(2026, 9, 9, 6, 0));
  });

  it('de madrugada, ainda vale a noite que começou ontem', () => {
    expect(inicioDaNoite(new Date(2026, 9, 10, 2, 15))).toEqual(new Date(2026, 9, 9, 6, 0));
  });
});

describe('calcularMovimento', () => {
  const AGORA = new Date(2026, 9, 9, 23, 0);

  /** Horário de hoje em ISO, ex.: em(21, 30) = 21h30. */
  function em(hora: number, minuto = 0): string {
    return new Date(2026, 9, 9, hora, minuto).toISOString();
  }

  function item(
    nome: string,
    setor: 'bar' | 'cozinha',
    quantidade: number,
    preco: number,
    status: 'novo' | 'em_andamento' | 'pronto' = 'pronto',
  ) {
    return { quantidade, preco_unitario: preco, status, item: { nome, setor } };
  }

  function comanda(
    parcial: Partial<LinhaComandaMovimento> & Pick<LinhaComandaMovimento, 'id'>,
  ): LinhaComandaMovimento {
    return {
      status: 'aberta',
      mesa: null,
      criada_em: em(20),
      fechada_em: null,
      cliente: { nome: 'Cliente' },
      pedidos: [],
      ...parcial,
    };
  }

  const NOITE: LinhaComandaMovimento[] = [
    comanda({
      id: 'paga',
      status: 'paga',
      mesa: '3',
      criada_em: em(19, 10),
      fechada_em: em(20, 40),
      cliente: { nome: 'Marina Duarte' },
      pedidos: [
        {
          id: 'p1',
          criado_em: em(19, 20),
          pedido_itens: [item('Chope', 'bar', 4, 12), item('Batata', 'cozinha', 1, 30)],
        },
      ],
    }),
    comanda({
      id: 'aberta',
      status: 'aberta',
      mesa: '8',
      criada_em: em(20, 30),
      cliente: { nome: 'João Pedro' },
      pedidos: [
        {
          id: 'p2',
          criado_em: em(22, 30),
          pedido_itens: [
            item('Chope', 'bar', 2, 12),
            item('Iscas', 'cozinha', 1, 35, 'em_andamento'),
          ],
        },
      ],
    }),
    comanda({
      id: 'balcao',
      status: 'aberta',
      criada_em: em(21, 50),
      pedidos: [
        {
          id: 'p3',
          criado_em: em(22, 55),
          pedido_itens: [item('Caipirinha', 'bar', 1, 20, 'novo')],
        },
      ],
    }),
    comanda({
      id: 'conta',
      status: 'aguardando_pagamento',
      mesa: '12',
      criada_em: em(21),
      fechada_em: em(22, 35),
      cliente: { nome: 'Carlos Souza' },
      pedidos: [{ id: 'p4', criado_em: em(21, 5), pedido_itens: [item('Chope', 'bar', 3, 12)] }],
    }),
    comanda({
      id: 'entrando',
      status: 'aguardando_liberacao',
      mesa: '4',
      criada_em: em(22, 50),
      cliente: { nome: 'Ana Lima' },
    }),
  ];

  const numeros = calcularMovimento(NOITE, AGORA);

  it('conta as comandas por situação e soma os valores de cada grupo', () => {
    expect(numeros.comandasAbertas).toBe(2);
    expect(numeros.comandasPagas).toBe(1);
    expect(numeros.comandasAguardandoPagamento).toBe(1);
    expect(numeros.faturamento).toBe(78);
    expect(numeros.valorEmAberto).toBe(79);
    expect(numeros.valorAguardandoPagamento).toBe(36);
  });

  it('divide as comandas abertas entre mesa e balcão', () => {
    expect(numeros.comandasEmMesa).toBe(1);
    expect(numeros.comandasNoBalcao).toBe(1);
  });

  it('soma itens por setor e separa pedidos prontos dos em preparo', () => {
    expect(numeros.itensVendidos).toBe(12);
    expect(numeros.itensDoBar).toBe(10);
    expect(numeros.itensDaCozinha).toBe(2);
    expect(numeros.pedidos).toBe(4);
    expect(numeros.pedidosProntos).toBe(2);
    expect(numeros.pedidosEmPreparo).toBe(2);
  });

  it('ordena os mais vendidos pela quantidade', () => {
    expect(numeros.maisVendidos[0]).toEqual({ nome: 'Chope', quantidade: 9 });
    expect(numeros.maisVendidos.map((i) => i.nome)).toEqual([
      'Chope',
      'Batata',
      'Caipirinha',
      'Iscas',
    ]);
  });

  it('numera as comandas pela ordem de abertura e lista da mais nova para a mais antiga, sem as que aguardam liberação', () => {
    expect(numeros.comandas.map((c) => c.numero)).toEqual(['04', '03', '02', '01']);
    expect(numeros.comandas[0]).toMatchObject({ mesa: 'Balcão', horario: '21:50', valor: 20 });
    expect(numeros.comandas.at(-1)).toMatchObject({
      cliente: 'Marina Duarte',
      mesa: '3',
      status: 'paga',
    });
  });

  it('conta uma comanda em cada hora em que ela esteve aberta', () => {
    expect(numeros.lotacaoPorHora).toEqual([
      { hora: '19h', comandas: 1 },
      { hora: '20h', comandas: 2 },
      { hora: '21h', comandas: 3 },
      { hora: '22h', comandas: 4 },
      { hora: '23h', comandas: 3 },
    ]);
  });

  it('gera os alertas que passaram do tempo, com o pagamento primeiro', () => {
    expect(numeros.alertas.map((a) => a.tipo)).toEqual(['pagamento', 'pedido_parado', 'liberacao']);
    expect(numeros.alertas[0]).toMatchObject({
      titulo: 'Comanda sem pagamento há 25 min',
      comanda: '03',
    });
    expect(numeros.alertas[1].detalhe).toBe('Comanda 02 · Cozinha · 1× Iscas');
    expect(numeros.alertas[2]).toMatchObject({ detalhe: 'Mesa 4 · Ana Lima', comanda: null });
  });

  it('avisa da comanda aberta há muito tempo sem pedido novo', () => {
    const parada = comanda({
      id: 'x',
      criada_em: em(20),
      pedidos: [{ id: 'p', criado_em: em(20, 10), pedido_itens: [item('Chope', 'bar', 1, 12)] }],
    });

    expect(calcularMovimento([parada], AGORA).alertas[0].titulo).toBe(
      'Comanda aberta há 2h50 sem novo pedido',
    );
  });

  it('noite sem comandas fica toda zerada, sem barras de lotação', () => {
    const vazia = calcularMovimento([], AGORA);

    expect(vazia.faturamento).toBe(0);
    expect(vazia.lotacaoPorHora).toEqual([]);
    expect(vazia.alertas).toEqual([]);
  });
});
