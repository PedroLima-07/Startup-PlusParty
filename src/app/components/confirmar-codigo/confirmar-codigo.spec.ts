import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../services/auth.service';
import { ConfirmarCodigo, ESPERA_PARA_REENVIAR } from './confirmar-codigo';

describe('ConfirmarCodigo', () => {
  let fixture: ComponentFixture<ConfirmarCodigo>;
  let confirmarEmail: ReturnType<typeof vi.fn>;
  let reenviarCodigo: ReturnType<typeof vi.fn>;
  let confirmado: ReturnType<typeof vi.fn<() => void>>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function digitar(valor: string): void {
    const campo = tela().querySelector<HTMLInputElement>('.campo-codigo')!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
  }

  function caixas(): string[] {
    return Array.from(tela().querySelectorAll('.caixa')).map((c) => c.textContent?.trim() ?? '');
  }

  function botao(texto: string): HTMLButtonElement | undefined {
    return Array.from(tela().querySelectorAll('button')).find((b) => b.textContent?.includes(texto));
  }

  async function assentar(): Promise<void> {
    await fixture.whenStable();
    await new Promise((resolver) => setTimeout(resolver));
  }

  beforeEach(async () => {
    confirmarEmail = vi.fn().mockResolvedValue(undefined);
    reenviarCodigo = vi.fn().mockResolvedValue(undefined);
    confirmado = vi.fn<() => void>();

    await TestBed.configureTestingModule({
      imports: [ConfirmarCodigo],
      providers: [{ provide: AuthService, useValue: { confirmarEmail, reenviarCodigo } }],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmarCodigo);
    fixture.componentRef.setInput('email', 'gil@party.app');
    fixture.componentInstance.confirmado.subscribe(() => confirmado());
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('mostra para qual e-mail o código foi enviado, com 6 caixas', () => {
    expect(tela().textContent).toContain('gil@party.app');
    expect(caixas()).toEqual(['', '', '', '', '', '']);
  });

  it('aceita só números e confere sozinho ao completar os 6', async () => {
    digitar('12a3');
    expect(caixas()).toEqual(['1', '2', '3', '', '', '']);
    expect(confirmarEmail).not.toHaveBeenCalled();

    digitar('123456');
    await assentar();

    expect(confirmarEmail).toHaveBeenCalledWith('gil@party.app', '123456');
    expect(confirmado).toHaveBeenCalled();
  });

  it('colar o código com espaço ou traço também funciona', async () => {
    digitar('123 - 456');
    await assentar();

    expect(confirmarEmail).toHaveBeenCalledWith('gil@party.app', '123456');
  });

  it('código errado mostra o aviso e limpa as caixas para tentar de novo', async () => {
    confirmarEmail.mockRejectedValueOnce(
      Object.assign(new Error('Token has expired or is invalid'), { code: 'otp_expired' }),
    );

    digitar('111111');
    await assentar();

    expect(confirmado).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Código incorreto ou vencido');
    expect(caixas()).toEqual(['', '', '', '', '', '']);
  });

  it('confirmar com o código pela metade pede os 6 números', async () => {
    digitar('12');
    botao('CONFIRMAR')!.click();
    await assentar();

    expect(confirmarEmail).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Digite os 6 números do código.');
  });

  it('o reenviar só aparece depois da contagem, e recomeça a contar', async () => {
    vi.useFakeTimers();
    fixture.destroy();
    fixture = TestBed.createComponent(ConfirmarCodigo);
    fixture.componentRef.setInput('email', 'gil@party.app');
    fixture.detectChanges();

    expect(botao('Reenviar código')).toBeUndefined();
    expect(tela().textContent).toContain('1:00');

    vi.advanceTimersByTime(ESPERA_PARA_REENVIAR * 1000);
    botao('Reenviar código')!.click();
    await vi.runOnlyPendingTimersAsync();

    expect(reenviarCodigo).toHaveBeenCalledWith('gil@party.app');
    expect(tela().textContent).toContain('Enviamos um novo código');
    expect(botao('Reenviar código')).toBeUndefined();
  });

  it('se o Supabase disser que é cedo para reenviar, a contagem usa o tempo dele', async () => {
    vi.useFakeTimers();
    fixture.destroy();
    fixture = TestBed.createComponent(ConfirmarCodigo);
    fixture.componentRef.setInput('email', 'gil@party.app');
    fixture.detectChanges();
    reenviarCodigo.mockRejectedValueOnce(
      new Error('For security purposes, you can only request this after 42 seconds.'),
    );

    vi.advanceTimersByTime(ESPERA_PARA_REENVIAR * 1000);
    botao('Reenviar código')!.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(tela().textContent).toContain('Aguarde 42 segundos');
    expect(tela().textContent).toContain('0:42');
  });
});
