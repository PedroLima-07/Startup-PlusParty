import { TestBed } from '@angular/core/testing';
import { MovimentoService } from './movimento.service';

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
    service.metaFaturamento.set(0);

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
