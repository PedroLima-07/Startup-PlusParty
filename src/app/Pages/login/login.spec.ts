import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EquipeService } from '../../services/equipe.service';
import { LoginPage } from './login';

describe('LoginPage — recuperar senha', () => {
  let fixture: ComponentFixture<LoginPage>;
  let authService: {
    pedirRedefinicaoSenha: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
  };

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(texto: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.includes(texto),
    )!;
  }

  function preencherEmail(email: string): void {
    const campo = tela().querySelector<HTMLInputElement>('input[type=email]')!;
    campo.value = email;
    campo.dispatchEvent(new Event('input'));
  }

  async function enviar(): Promise<void> {
    tela().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    authService = {
      pedirRedefinicaoSenha: vi.fn().mockResolvedValue(undefined),
      login: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: EquipeService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    botao('Esqueceu a senha').click();
  });

  it('no modo recuperar, pede só o e-mail', () => {
    expect(tela().querySelector('input[type=password]')).toBeNull();
    expect(tela().querySelector('input[type=email]')).not.toBeNull();
    expect(tela().textContent).toContain('ENVIAR LINK');
  });

  it('pede o link ao Supabase e mostra a mesma mensagem para qualquer e-mail', async () => {
    preencherEmail('alguem@party.app');

    await enviar();

    expect(authService.pedirRedefinicaoSenha).toHaveBeenCalledWith('alguem@party.app');
    expect(authService.login).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Se esse e-mail estiver cadastrado');
  });

  it('não envia com e-mail inválido', async () => {
    preencherEmail('nao-e-email');

    await enviar();

    expect(authService.pedirRedefinicaoSenha).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Informe um e-mail válido');
  });

  it('avisa quando o limite de envios foi atingido', async () => {
    authService.pedirRedefinicaoSenha.mockRejectedValueOnce(new Error('email rate limit exceeded'));
    preencherEmail('alguem@party.app');

    await enviar();

    expect(tela().textContent).toContain('Muitas tentativas');
  });

  it('voltar para o login traz o campo de senha de volta', () => {
    botao('Entrar').click();

    expect(tela().querySelector('input[type=password]')).not.toBeNull();
    expect(tela().textContent).toContain('LOGIN');
  });
});
