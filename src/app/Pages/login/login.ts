import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TipoPerfil } from '../../models';
import { AuthService } from '../../services/auth.service';

type Modo = 'login' | 'cadastro' | 'recuperar';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected readonly modo = signal<Modo>('login');
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

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
      const tipo = await this.authService.buscarTipoAtual();
      await this.router.navigateByUrl(this.destino(tipo), { replaceUrl: true });
    } catch (erro) {
      this.erro.set(this.traduzirErro(erro));
    } finally {
      this.carregando.set(false);
    }
  }

  /** Volta para a página que pediu login, se for uma página do cliente deste app. */
  private destino(tipo: TipoPerfil | null): string {
    const voltar = this.route.snapshot.queryParamMap.get('voltar');
    if (tipo === 'cliente' && voltar?.startsWith('/cliente/')) return voltar;
    return this.authService.telaInicial(tipo);
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
    if (mensagem.includes('rate limit') || mensagem.includes('For security purposes')) {
      return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    }
    if (mensagem.includes('Email not confirmed')) {
      return 'Confirme seu e-mail antes de entrar — verifique sua caixa de entrada.';
    }

    return 'Não foi possível concluir. Tente novamente.';
  }
}
