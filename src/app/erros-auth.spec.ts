import { emailNaoConfirmado, segundosParaReenviar, traduzirErroAuth } from './erros-auth';

function erroDoSupabase(mensagem: string, code?: string): Error {
  return Object.assign(new Error(mensagem), code ? { code } : {});
}

describe('erros do Supabase Auth', () => {
  it('traduz os erros do código de confirmação', () => {
    expect(traduzirErroAuth(erroDoSupabase('Token has expired or is invalid', 'otp_expired'))).toBe(
      'Código incorreto ou vencido. Confira os números ou peça um novo código.',
    );
    expect(
      traduzirErroAuth(erroDoSupabase('For security purposes, you can only request this after 37 seconds.')),
    ).toBe('Aguarde 37 segundos para pedir outro código.');
    expect(traduzirErroAuth(erroDoSupabase('Email rate limit exceeded', 'over_email_send_rate_limit'))).toBe(
      'Muitos e-mails enviados agora. Tente de novo em alguns minutos.',
    );
  });

  it('reconhece a conta que ainda não confirmou o e-mail, pelo código ou pela mensagem', () => {
    expect(emailNaoConfirmado(erroDoSupabase('Email not confirmed', 'email_not_confirmed'))).toBe(true);
    expect(emailNaoConfirmado(erroDoSupabase('Email not confirmed'))).toBe(true);
    expect(emailNaoConfirmado(erroDoSupabase('Invalid login credentials'))).toBe(false);
  });

  it('lê quantos segundos faltam para reenviar', () => {
    expect(segundosParaReenviar(erroDoSupabase('...request this after 1 second.'))).toBe(1);
    expect(segundosParaReenviar(erroDoSupabase('Invalid login credentials'))).toBeNull();
  });

  it('mantém as traduções que já existiam', () => {
    expect(traduzirErroAuth(erroDoSupabase('Invalid login credentials'))).toBe('E-mail ou senha incorretos.');
    expect(traduzirErroAuth(erroDoSupabase('User already registered'))).toBe('Esse e-mail já está cadastrado.');
    expect(traduzirErroAuth(new Error('qualquer outra coisa'))).toBe('Não foi possível concluir. Tente novamente.');
  });
});
