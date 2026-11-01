import { REGRA_SENHA } from './senha';

/** O que o Supabase Auth manda nos erros: `code` nas versões novas, sempre `message`. */
function lerErro(erro: unknown): { codigo: string; mensagem: string } {
  const comCodigo = erro as { code?: unknown } | null;
  return {
    codigo: typeof comCodigo?.code === 'string' ? comCodigo.code : '',
    mensagem: erro instanceof Error ? erro.message : '',
  };
}

/**
 * A conta existe, mas o e-mail ainda não foi confirmado com o código.
 * O login usa para levar a pessoa direto à tela do código.
 */
export function emailNaoConfirmado(erro: unknown): boolean {
  const { codigo, mensagem } = lerErro(erro);
  return codigo === 'email_not_confirmed' || mensagem.includes('Email not confirmed');
}

/**
 * Quantos segundos faltam para poder pedir outro código, quando o Supabase
 * recusa o reenvio por ter sido cedo demais ("...after 42 seconds").
 */
export function segundosParaReenviar(erro: unknown): number | null {
  const { mensagem } = lerErro(erro);
  const encontrado = /after (\d+) seconds?/.exec(mensagem);
  return encontrado ? Number(encontrado[1]) : null;
}

/** Troca as mensagens de erro do Supabase Auth por um texto para quem está usando o app. */
export function traduzirErroAuth(erro: unknown): string {
  const { codigo, mensagem } = lerErro(erro);

  if (mensagem.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (mensagem.includes('already registered') || mensagem.includes('User already registered')) {
    return 'Esse e-mail já está cadastrado.';
  }
  if (mensagem.includes('Password should')) {
    return REGRA_SENHA;
  }
  if (codigo === 'otp_expired' || mensagem.includes('Token has expired or is invalid')) {
    return 'Código incorreto ou vencido. Confira os números ou peça um novo código.';
  }
  const segundos = segundosParaReenviar(erro);
  if (segundos !== null) {
    return `Aguarde ${segundos} segundos para pedir outro código.`;
  }
  if (codigo === 'over_email_send_rate_limit' || mensagem.includes('Email rate limit exceeded')) {
    return 'Muitos e-mails enviados agora. Tente de novo em alguns minutos.';
  }
  if (mensagem.includes('rate limit') || mensagem.includes('For security purposes')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  }
  if (emailNaoConfirmado(erro)) {
    return 'Confirme seu e-mail com o código que enviamos antes de entrar.';
  }

  return 'Não foi possível concluir. Tente novamente.';
}
