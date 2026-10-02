import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TipoPerfil } from '../../models';
import { AuthService } from '../../services/auth.service';

type Estado = 'verificando' | 'pronto' | 'link_invalido';

/**
 * Destino do link do e-mail de recuperação. O Supabase abre esta página já com
 * uma sessão; sem sessão, o link expirou ou a página foi aberta direto.
 */
@Component({
  selector: 'app-redefinir-senha',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './redefinir-senha.html',
  styleUrl: '../login/login.scss',
})
export class RedefinirSenhaPage implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  protected readonly estado = signal<Estado>('verificando');
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    senha: ['', [Validators.required, Validators.minLength(6)]],
    confirmacao: ['', [Validators.required]],
  });

  private tipo: TipoPerfil | null = null;

  async ngOnInit(): Promise<void> {
    this.tipo = await this.authService.buscarTipoAtual().catch(() => null);
    this.estado.set(this.tipo ? 'pronto' : 'link_invalido');
  }

  protected senhasDiferentes(): boolean {
    const { senha, confirmacao } = this.form.getRawValue();
    return this.form.controls.confirmacao.touched && senha !== confirmacao;
  }

  protected async salvar(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.senhasDiferentes() || this.salvando()) return;

    this.erro.set(null);
    this.salvando.set(true);

    try {
      await this.authService.definirNovaSenha(this.form.getRawValue().senha);
      await this.router.navigateByUrl(this.authService.telaInicial(this.tipo), { replaceUrl: true });
    } catch (erro) {
      this.erro.set(this.traduzirErro(erro));
      this.salvando.set(false);
    }
  }

  private traduzirErro(erro: unknown): string {
    const mensagem = erro instanceof Error ? erro.message : '';

    if (mensagem.includes('should be different')) {
      return 'A nova senha precisa ser diferente da atual.';
    }
    if (mensagem.includes('Password should be at least')) {
      return 'A senha precisa ter pelo menos 6 caracteres.';
    }

    return 'Não foi possível salvar a nova senha. Tente novamente.';
  }
}
