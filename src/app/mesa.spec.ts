import { normalizarMesa } from './mesa';

describe('normalizarMesa', () => {
  it('ignora espaços, maiúsculas e zeros à esquerda', () => {
    expect(normalizarMesa(' 04 ')).toBe('4');
    expect(normalizarMesa('012')).toBe('12');
    expect(normalizarMesa('A3')).toBe('a3');
  });

  it('o zero sozinho continua zero; vazio vira null', () => {
    expect(normalizarMesa('0')).toBe('0');
    expect(normalizarMesa('   ')).toBeNull();
    expect(normalizarMesa(null)).toBeNull();
  });
});
