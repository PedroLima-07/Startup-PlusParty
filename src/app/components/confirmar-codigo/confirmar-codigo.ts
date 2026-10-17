import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { segundosParaReenviar, traduzirErroAuth } from '../../erros-auth';
import { AuthService } from '../../services/auth.service';

/** Quantos dígitos tem o código do e-mail (o padrão do Supabase). */
export const DIGITOS_DO_CODIGO = 6;

/** Espera entre um envio e outro: o mesmo intervalo mínimo padrão do Supabase. */
export const ESPERA_PARA_REENVIAR = 60;

/**
 * Tela do código de confirmação do e-mail: a pessoa digita (ou cola) os 6
 * números que chegaram por e-mail e a conta é confirmada. Fica no lugar do
 * formulário, no cadastro do cliente e no convite de atendente.
 *
 * Um campo só recebe o código, por baixo das 6 caixas que aparecem: assim
 * colar o código inteiro, o preenchimento automático do celular e o leitor
 * de tela funcionam sem truque.
 */
@Component({
  selector: 'app-confirmar-codigo',
  templateUrl: './confirmar-codigo.html',
  styleUrl: './confirmar-codigo.scss',
})
export class ConfirmarCodigo {
  private readonly auth = inject(AuthService);

  /** Para onde o código foi enviado. */
  readonly email = input.required<string>();
  /** Texto do link para voltar (ex.: "Usar outro e-mail"). */
  readonly rotuloVoltar = input('Usar outro e-mail');

  /** O código conferiu: a conta está confirmada e a sessão, aberta. */
  readonly confirmado = output<void>();
  readonly voltar = output<void>();

  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly codigo = signal('');
  protected readonly focado = signal(false);
  protected readonly confirmando = signal(false);
  protected readonly reenviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  /** Segundos até poder pedir outro código. Começa contando: um código acabou de sair. */
  protected readonly espera = signal(ESPERA_PARA_REENVIAR);

  protected readonly caixas = computed(() =>
    Array.from({ length: DIGITOS_DO_CODIGO }, (_, i) => this.codigo()[i] ?? ''),
  );

  /** A caixa onde o próximo número vai entrar, para destacar com o cursor. */
  protected readonly posicao = computed(() =>
    Math.min(this.codigo().length, DIGITOS_DO_CODIGO - 1),
  );

  protected readonly tempoRestante = computed(() => {
    const segundos = this.espera();
    return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
  });

  constructor() {
    const relogio = setInterval(() => {
      if (this.espera() > 0) this.espera.update((s) => s - 1);
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(relogio));

    afterNextRender(() => this.campo()?.nativeElement.focus());
  }

  protected focar(): void {
    this.campo()?.nativeElement.focus();
  }

  /**
   * Só números, no máximo 6. Com o sexto, já confere. O campo não tem
   * maxlength: colar "123-456" passaria de 6 caracteres e perderia um número.
   */
  protected aoDigitar(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    // Enquanto confere, o código na tela não muda.
    if (this.confirmando()) {
      campo.value = this.codigo();
      return;
    }

    const numeros = campo.value.replace(/\D/g, '').slice(0, DIGITOS_DO_CODIGO);
    campo.value = numeros;
    this.codigo.set(numeros);
    this.erro.set(null);

    if (numeros.length === DIGITOS_DO_CODIGO) void this.confirmar();
  }

  protected async confirmar(): Promise<void> {
    if (this.confirmando()) return;

    if (this.codigo().length < DIGITOS_DO_CODIGO) {
      this.erro.set(`Digite os ${DIGITOS_DO_CODIGO} números do código.`);
      this.focar();
      return;
    }

    this.confirmando.set(true);
    this.erro.set(null);
    this.aviso.set(null);

    try {
      await this.auth.confirmarEmail(this.email(), this.codigo());
      this.confirmado.emit();
    } catch (erro) {
      this.erro.set(traduzirErroAuth(erro));
      // Limpa para digitar de novo sem apagar número por número.
      this.codigo.set('');
      const campo = this.campo()?.nativeElement;
      if (campo) campo.value = '';
      this.focar();
    } finally {
      this.confirmando.set(false);
    }
  }

  protected async reenviar(): Promise<void> {
    if (this.espera() > 0 || this.reenviando()) return;

    this.reenviando.set(true);
    this.erro.set(null);
    this.aviso.set(null);

    try {
      await this.auth.reenviarCodigo(this.email());
      this.aviso.set('Enviamos um novo código. Use sempre o mais recente.');
      this.espera.set(ESPERA_PARA_REENVIAR);
    } catch (erro) {
      // Cedo demais: o Supabase diz quanto falta, e o contador passa a mostrar.
      const segundos = segundosParaReenviar(erro);
      if (segundos !== null) this.espera.set(segundos);
      this.erro.set(traduzirErroAuth(erro));
    } finally {
      this.reenviando.set(false);
    }
  }
}
