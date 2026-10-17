import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

describe('AuthService — cadastro com confirmação de e-mail', () => {
  let service: AuthService;
  let signUp: ReturnType<typeof vi.fn>;
  let verifyOtp: ReturnType<typeof vi.fn>;
  let resend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    signUp = vi.fn();
    verifyOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    resend = vi.fn().mockResolvedValue({ data: {}, error: null });

    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { auth: { signUp, verifyOtp, resend } } } },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it('sem sessão depois do cadastro, a conta precisa do código', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] }, session: null }, error: null });

    expect(await service.cadastrar('Gil', 'gil@party.app', 'senha123')).toEqual({ precisaConfirmar: true });
    expect(signUp).toHaveBeenCalledWith({
      email: 'gil@party.app',
      password: 'senha123',
      options: { data: { nome: 'Gil' } },
    });
  });

  it('com a confirmação desligada, a sessão já abre no cadastro', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{}] }, session: { user: { id: 'u1' } } },
      error: null,
    });

    expect(await service.cadastrar('Gil', 'gil@party.app', 'senha123')).toEqual({ precisaConfirmar: false });
  });

  it('e-mail que já tem conta vira erro, mesmo o Supabase respondendo sem erro', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [] }, session: null }, error: null });

    await expect(service.cadastrar('Gil', 'gil@party.app', 'senha123')).rejects.toThrow(
      'User already registered',
    );
  });

  it('confere o código do e-mail e reenvia um código novo', async () => {
    await service.confirmarEmail('gil@party.app', '123456');
    await service.reenviarCodigo('gil@party.app');

    expect(verifyOtp).toHaveBeenCalledWith({ email: 'gil@party.app', token: '123456', type: 'email' });
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'gil@party.app' });
  });

  it('código recusado chega a quem chamou', async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: new Error('Token has expired or is invalid') });

    await expect(service.confirmarEmail('gil@party.app', '000000')).rejects.toThrow('Token has expired');
  });
});
