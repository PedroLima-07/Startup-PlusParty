import { FormControl } from '@angular/forms';
import { VALIDADORES_SENHA_NOVA } from './senha';

describe('VALIDADORES_SENHA_NOVA', () => {
  const valida = (senha: string) => new FormControl(senha, VALIDADORES_SENHA_NOVA).valid;

  it('aceita 8 caracteres com letras e números', () => {
    expect(valida('abcd1234')).toBe(true);
  });

  it('recusa senha curta, só com letras ou só com números', () => {
    expect(valida('abc123')).toBe(false);
    expect(valida('abcdefgh')).toBe(false);
    expect(valida('12345678')).toBe(false);
  });
});
