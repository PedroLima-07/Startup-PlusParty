import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificacoesService } from '../../services/notificacoes.service';
import { ContaPage } from './conta';

describe('ContaPage', () => {
  let fixture: ComponentFixture<ContaPage>;
  let excluirConta: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === rotulo,
    )!;
  }

  async function digitar(valor: string): Promise<void> {
    const campo = tela().querySelector<HTMLInputElement>('input[name="confirmacao"]')!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    excluirConta = vi.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [ContaPage],
      providers: [
        provideRouter([]),
        { provide: NotificacoesService, useValue: { naoLidas: () => 0 } },
        {
          provide: AuthService,
          useValue: {
            usuarioAtual: async () => ({ email: 'cliente@exemplo.com' }),
            perfilAtual: async () => ({ nome: 'Mariana' }),
            excluirConta,
            sair: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ContaPage);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('mostra quem está logado', () => {
    expect(tela().textContent).toContain('Mariana');
    expect(tela().textContent).toContain('cliente@exemplo.com');
  });

  it('só exclui depois de digitar EXCLUIR, e volta para o login avisando', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    botao('Excluir minha conta').click();
    expect(botao('Excluir para sempre').disabled).toBe(true);

    await digitar('excluir');
    expect(botao('Excluir para sempre').disabled).toBe(false);
    botao('Excluir para sempre').click();
    await fixture.whenStable();

    expect(excluirConta).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith('/login?conta=excluida');
  });

  it('mostra o motivo quando o banco recusa (comanda em andamento)', async () => {
    excluirConta.mockRejectedValue(new Error('Você tem uma comanda em andamento.'));
    botao('Excluir minha conta').click();
    await digitar('EXCLUIR');
    botao('Excluir para sempre').click();
    await fixture.whenStable();

    expect(tela().querySelector('.erro')?.textContent).toContain('comanda em andamento');
  });
});
