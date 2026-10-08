/** Troca as mensagens de erro do Supabase Auth por um texto para quem está usando o app. */
export function traduzirErroAuth(erro: unknown): string {
  const mensagem = erro instanceof Error ? erro.message : '';

  if (mensagem.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (mensagem.includes('already registered') || mensagem.includes('User already registered')) {
    return 'Esse e-mail já está cadastrado.';
  }
  if (mensagem.includes('Password should be at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }
  if (mensagem.includes('rate limit') || mensagem.includes('For security purposes')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  }
  if (mensagem.includes('Email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar — verifique sua caixa de entrada.';
  }

  return 'Não foi possível concluir. Tente novamente.';
}
