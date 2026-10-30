/** Valor digitado do jeito brasileiro: "15,00" → 15; "R$ 1.250,50" → 1250.5; vazio → null. */
export function lerEntrada(texto: string): number | null | 'invalida' {
  const limpo = texto.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (!limpo) return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor >= 0 ? valor : 'invalida';
}
