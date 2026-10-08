import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Carregando } from '../../components/carregando/carregando';
import { traduzirErroAuth } from '../../erros-auth';
import { Estabelecimento } from '../../models';
import { AuthService } from '../../services/auth.service';
import {
  EquipeService,
  ROTA_AGUARDANDO_GERENTE,
  ROTA_CADASTRO_ATENDENTE,
} from '../../services/equipe.service';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';

/**
 * Pedido para trabalhar como atendente num bar. Quem ainda não tem conta cria
 * uma aqui mesmo; quem já está logado como cliente só informa o telefone e o
 * bar. Em nenhum dos casos a pessoa vira atendente nesta tela: ela cria uma
 * solicitação, e o gerente do bar decide na aba Equipe.
 */
@Component({
  selector: 'app-atendente-cadastro',
  imports: [Carregando, ReactiveFormsModule, RouterLink],
  templateUrl: './atendente-cadastro.html',
  styleUrls: ['../login/login.scss', './atendente-cadastro.scss'],
})
export class AtendenteCadastroPage implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private equipeService = inject(EquipeService);
  private estabelecimentosService = inject(EstabelecimentosService);
  private router = inject(Router);

  protected readonly carregando = signal(true);
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly estabelecimentos = signal<Estabelecimento[]>([]);
  /** Nome de quem já tem conta e está logado; null enquanto a conta ainda vai ser criada. */
  protected readonly contaLogada = signal<string | null>(null);
  protected readonly rotaDestaTela = ROTA_CADASTRO_ATENDENTE;

  protected readonly form = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(6)]],
    telefone: ['', [Validators.required, Validators.pattern(/^[\d\s()+-]{8,20}$/)]],
    estabelecimentoId: ['', [Validators.required]],
  });

  async ngOnInit(): Promise<void> {
    try {
      const [perfil, solicitacao, estabelecimentos] = await Promise.all([
        this.authService.perfilAtual(),
        this.equipeService.buscarMinhaSolicitacao(),
        this.estabelecimentosService.listar(),
      ]);

      // Quem já trabalha num bar não pede de novo; quem já pediu acompanha o pedido.
      if (perfil && perfil.tipo !== 'cliente') {
        await this.router.navigateByUrl(this.authService.telaInicial(perfil.tipo), { replaceUrl: true });
        return;
      }
      if (solicitacao) {
        await this.router.navigateByUrl(ROTA_AGUARDANDO_GERENTE, { replaceUrl: true });
        return;
      }

      if (perfil) this.usarContaLogada(perfil.nome);
      this.estabelecimentos.set(estabelecimentos);
    } catch {
      this.erro.set('Não foi possível carregar o cadastro. Atualize a página para tentar de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected async enviar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.erro.set(null);
    this.aviso.set(null);
    this.enviando.set(true);
    const { nome, email, senha, telefone, estabelecimentoId } = this.form.getRawValue();
    let contaCriadaAgora = false;

    try {
      if (this.contaLogada() === null) {
        try {
          await this.authService.cadastrar(nome.trim(), email, senha);
        } catch (erro) {
          this.erro.set(traduzirErroAuth(erro));
          return;
        }

        // Com confirmação de e-mail ligada no Supabase, o cadastro não abre sessão.
        if (!(await this.authService.usuarioAtual())) {
          this.aviso.set(
            'Conta criada. Confirme o e-mail que enviamos, entre com a sua conta e volte em ' +
              '"Cadastre-se como atendente" para escolher o bar.',
          );
          return;
        }

        // A conta já existe: se o pedido falhar, tentar de novo não cadastra outra vez.
        contaCriadaAgora = true;
        this.usarContaLogada(nome.trim());
      }

      await this.equipeService.solicitar(estabelecimentoId, telefone.trim());
      await this.router.navigateByUrl(ROTA_AGUARDANDO_GERENTE, { replaceUrl: true });
    } catch {
      this.erro.set(
        contaCriadaAgora
          ? 'Sua conta foi criada, mas não foi possível enviar o pedido. Tente novamente.'
          : 'Não foi possível enviar o pedido agora. Tente novamente.',
      );
    } finally {
      this.enviando.set(false);
    }
  }

  private usarContaLogada(nome: string): void {
    this.contaLogada.set(nome);
    this.form.controls.nome.disable();
    this.form.controls.email.disable();
    this.form.controls.senha.disable();
  }
}
