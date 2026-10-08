import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { traduzirErroAuth } from '../../erros-auth';
import { AuthService } from '../../services/auth.service';
import { EquipeService, ROTA_CADASTRO_ATENDENTE } from '../../services/equipe.service';

type Modo = 'login' | 'cadastro' | 'recuperar';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private equipeService = inject(EquipeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected readonly modo = signal<Modo>('login');
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly rotaCadastroAtendente = ROTA_CADASTRO_ATENDENTE;

  protected readonly form = this.fb.nonNullable.group({
    nome: [''],
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(6)]],
  });

  /** Cada modo exige campos diferentes: nome só no cadastro, senha só fora do "recuperar". */
  protected mudarModo(modo: Modo): void {
    this.erro.set(null);
    this.aviso.set(null);
    this.modo.set(modo);

    const { nome, senha } = this.form.controls;
    nome.setValidators(modo === 'cadastro' ? [Validators.required] : []);
    senha.setValidators(
      modo === 'recuperar' ? [] : [Validators.required, Validators.minLength(6)],
    );
    nome.updateValueAndValidity();
    senha.updateValueAndValidity();
  }

  protected async enviar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.erro.set(null);
    this.aviso.set(null);
    this.carregando.set(true);
    const { nome, email, senha } = this.form.getRawValue();

    try {
      if (this.modo() === 'recuperar') {
        await this.authService.pedirRedefinicaoSenha(email);
        // Mesma mensagem exista ou não a conta, para não revelar quem é cadastrado.
        this.aviso.set('Se esse e-mail estiver cadastrado, enviamos um link para criar uma nova senha.');
        return;
      }

      if (this.modo() === 'login') {
        await this.authService.login(email, senha);
      } else {
        await this.authService.cadastrar(nome, email, senha);
      }

      // replaceUrl tira o login do histórico: o "voltar" não cai de novo aqui.
      await this.router.navigateByUrl(await this.destino(), { replaceUrl: true });
    } catch (erro) {
      this.erro.set(traduzirErroAuth(erro));
    } finally {
      this.carregando.set(false);
    }
  }

  /**
   * Volta para a página que pediu login, se for uma página que o cliente pode
   * abrir. Senão, vai para a tela inicial de quem entrou.
   */
  private async destino(): Promise<string> {
    const voltar = this.route.snapshot.queryParamMap.get('voltar');
    const tipo = await this.authService.buscarTipoAtual();

    const abertaAoCliente = voltar?.startsWith('/cliente/') || voltar === ROTA_CADASTRO_ATENDENTE;
    if (tipo === 'cliente' && voltar && abertaAoCliente) return voltar;

    return (await this.equipeService.telaInicial()) ?? this.authService.telaInicial(tipo);
  }
}
