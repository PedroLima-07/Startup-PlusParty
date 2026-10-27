/**
 * "Mesa 04", " 4 " e "4" são a mesma mesa: sem espaços, minúsculas e sem
 * zeros à esquerda. Igual a normalizar_mesa em supabase/mesa_fila.sql.
 */
export function normalizarMesa(mesa: string | null | undefined): string | null {
  const limpa = (mesa ?? '').trim().toLowerCase().replace(/^0+(?=\d)/, '');
  return limpa || null;
}
