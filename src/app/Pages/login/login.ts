import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

type Modo = 'login' | 'cadastro';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);

  protected readonly modo = signal<Modo>('login');
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly usuarioLogado = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    nome: [''],
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected alternarModo(): void {
    this.erro.set(null);
    this.modo.update((atual) => (atual === 'login' ? 'cadastro' : 'login'));

    const nomeControl = this.form.controls.nome;
    if (this.modo() === 'cadastro') {
      nomeControl.addValidators(Validators.required);
    } else {
      nomeControl.clearValidators();
    }
    nomeControl.updateValueAndValidity();
  }

  protected async enviar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.erro.set(null);
    this.carregando.set(true);
    const { nome, email, senha } = this.form.getRawValue();

    try {
      if (this.modo() === 'login') {
        await this.authService.login(email, senha);
        this.usuarioLogado.set(await this.authService.buscarNomeAtual());
      } else {
        await this.authService.cadastrar(nome, email, senha);
        this.usuarioLogado.set(nome);
      }
    } catch (erro) {
      this.erro.set(this.traduzirErro(erro));
    } finally {
      this.carregando.set(false);
    }
  }

  private traduzirErro(erro: unknown): string {
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
    if (mensagem.includes('Email not confirmed')) {
      return 'Confirme seu e-mail antes de entrar — verifique sua caixa de entrada.';
    }

    return 'Não foi possível concluir. Tente novamente.';
  }
}
