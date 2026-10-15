/**
 * As funções e regras do banco (supabase/*.sql) recusam com uma frase já
 * escrita para quem está usando o app ("Este convite expirou...", "Solicitação
 * já respondida..."), sempre com o código P0001. Devolve essa frase, ou null
 * quando o erro é de outro tipo (rede, permissão), que pede uma mensagem genérica.
 */
export function mensagemDoBanco(erro: unknown): string | null {
  const { code, message } = (erro ?? {}) as { code?: string; message?: string };
  return code === 'P0001' && message ? message : null;
}
