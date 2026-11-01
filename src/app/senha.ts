import { Validators } from '@angular/forms';

/** Regra de senha nova. Quem entra com uma senha antiga, mais curta, continua conseguindo. */
export const REGRA_SENHA = 'Mínimo de 8 caracteres, com letras e números.';

export const VALIDADORES_SENHA_NOVA = [
  Validators.required,
  Validators.minLength(8),
  Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/),
];
