import { duracaoEspera } from './tempo';

describe('duracaoEspera', () => {
  it('mostra minutos, horas ou dias', () => {
    expect(duracaoEspera(12)).toBe('12 min');
    expect(duracaoEspera(125)).toBe('2 h 5 min');
    expect(duracaoEspera(1440)).toBe('1 dia');
    expect(duracaoEspera(30393)).toBe('21 dias');
  });
});
