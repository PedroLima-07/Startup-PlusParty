import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TipoPerfil } from '../../models';
import { AuthService } from '../../services/auth.service';
import { RedefinirSenhaPage } from './redefinir-senha';

describe('RedefinirSenhaPage', () => {
  let fixture: ComponentFixture<RedefinirSenhaPage>;
  let authService: {
    buscarTipoAtual: ReturnType<typeof vi.fn>;
    definirNovaSenha: ReturnType<typeof vi.fn>;
    telaInicial: (tipo: TipoPerfil | null) => string;
  };
  let router: Router;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function preencher(senha: string, confirmacao: string): void {
    const [campoSenha, campoConfirmacao] = Array.from(tela().querySelectorAll('input'));
    campoSenha.value = senha;
    campoSenha.dispatchEvent(new Event('input'));
    campoConfirmacao.value = confirmacao;
    campoConfirmacao.dispatchEvent(new Event('input'));
  }

  async function enviar(): Promise<void> {
    tela().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  async function abrir(tipo: TipoPerfil | null): Promise<void> {
    authService = {
      buscarTipoAtual: vi.fn().mockResolvedValue(tipo),
      definirNovaSenha: vi.fn().mockResolvedValue(undefined),
      telaInicial: (t) => (t === 'gerente' ? '/gerente/movimento' : '/cliente/home'),
    };

    await TestBed.configureTestingModule({
      imports: [RedefinirSenhaPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(RedefinirSenhaPage);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('sem sessão, avisa que o link é inválido e não mostra o formulário', async () => {
    await abrir(null);

    expect(tela().textContent).toContain('Link inválido ou expirado');
    expect(tela().querySelector('form')).toBeNull();
  });

  it('não salva se as duas senhas forem diferentes', async () => {
    await abrir('cliente');
    preencher('novaSenha1', 'outraSenha');

    await enviar();

    expect(authService.definirNovaSenha).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('As senhas não são iguais');
  });

  it('não salva senha com menos de 6 caracteres', async () => {
    await abrir('cliente');
    preencher('123', '123');

    await enviar();

    expect(authService.definirNovaSenha).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Mínimo de 6 caracteres');
  });

  it('salva a nova senha e leva o usuário para a tela inicial dele', async () => {
    await abrir('gerente');
    preencher('novaSenha1', 'novaSenha1');

    await enviar();

    expect(authService.definirNovaSenha).toHaveBeenCalledWith('novaSenha1');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/gerente/movimento', { replaceUrl: true });
  });

  it('mostra o motivo quando o Supabase recusa a senha', async () => {
    await abrir('cliente');
    authService.definirNovaSenha.mockRejectedValueOnce(
      new Error('New password should be different from the old password.'),
    );
    preencher('mesmaSenha', 'mesmaSenha');

    await enviar();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('A nova senha precisa ser diferente da atual');
  });
});
