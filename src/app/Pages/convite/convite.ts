import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Carregando } from '../../components/carregando/carregando';
import { ConfirmarCodigo } from '../../components/confirmar-codigo/confirmar-codigo';
import { mensagemDoBanco } from '../../erros-banco';
import { traduzirErroAuth } from '../../erros-auth';
import { prepararFotoDePerfil } from '../../foto';
import { ConviteInfo } from '../../models';
import { AuthService } from '../../services/auth.service';
import {
  EquipeService,
  ROTA_AGUARDANDO_GERENTE,
  ROTA_CONVITE,
} from '../../services/equipe.service';

/**
 * Página do link de convite (/convite/<código>). É a única porta de entrada
 * para a equipe de um bar: quem não tem conta cria uma aqui, quem já é cliente
 * só completa o telefone. Em nenhum dos casos a pessoa vira atendente nesta
 * tela: o convite cria um pedido, e o gerente aprova na aba Equipe.
 */
@Component({
  selector: 'app-convite',
  imports: [Carregando, ConfirmarCodigo, ReactiveFormsModule, RouterLink],
  templateUrl: './convite.html',
  styleUrls: ['../login/login.scss', './convite.scss'],
})
export class ConvitePage implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private equipeService = inject(EquipeService);
  private router = inject(Router);

  /** Código do link, vindo da rota. */
  readonly codigo = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly convite = signal<ConviteInfo | null>(null);
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  /** Nome de quem já tem conta e está logado; null enquanto a conta ainda vai ser criada. */
  protected readonly contaLogada = signal<string | null>(null);
  /** Conta criada esperando o código do e-mail: o formulário dá lugar à tela do código. */
  protected readonly emailParaConfirmar = signal<string | null>(null);
  /** A foto escolhida, para mostrar antes de enviar. */
  protected readonly fotoPrevia = signal<string | null>(null);

  private fotoEscolhida: File | null = null;

  protected readonly form = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(6)]],
    telefone: ['', [Validators.required, Validators.pattern(/^[\d\s()+-]{8,20}$/)]],
  });

  async ngOnInit(): Promise<void> {
    try {
      const [convite, perfil] = await Promise.all([
        this.equipeService.verConvite(this.codigo()),
        this.authService.perfilAtual(),
      ]);

      // Quem já trabalha num bar não usa convite: vai para a própria tela.
      if (perfil && perfil.tipo !== 'cliente') {
        await this.router.navigateByUrl(this.authService.telaInicial(perfil.tipo), { replaceUrl: true });
        return;
      }

      if (perfil) this.usarContaLogada(perfil.nome);
      this.convite.set(convite);
    } catch {
      this.erro.set('Não foi possível abrir o convite. Atualize a página para tentar de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  /** Endereço de volta para cá depois de entrar com uma conta que já existe. */
  protected enderecoDesteConvite(): string {
    return ROTA_CONVITE + this.codigo();
  }

  protected escolherFoto(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    campo.value = '';
    if (!arquivo) return;

    this.fotoEscolhida = arquivo;
    const leitor = new FileReader();
    leitor.onload = () => this.fotoPrevia.set(leitor.result as string);
    leitor.readAsDataURL(arquivo);
  }

  protected removerFoto(): void {
    this.fotoEscolhida = null;
    this.fotoPrevia.set(null);
  }

  protected async enviar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.erro.set(null);
    this.aviso.set(null);
    this.enviando.set(true);
    const { nome, email, senha } = this.form.getRawValue();

    try {
      if (this.contaLogada() === null) {
        try {
          await this.authService.cadastrar(nome.trim(), email, senha);
        } catch (erro) {
          this.erro.set(traduzirErroAuth(erro));
          return;
        }

        // Com confirmação de e-mail ligada no Supabase, o cadastro não abre
        // sessão: primeiro o código, depois o pedido (ver aoConfirmarEmail).
        if (!(await this.authService.usuarioAtual())) {
          this.emailParaConfirmar.set(email);
          return;
        }

        // A conta já existe: se algo falhar daqui em diante, tentar de novo não cadastra outra vez.
        this.usarContaLogada(nome.trim());
      }

      await this.concluirPedido();
    } finally {
      this.enviando.set(false);
    }
  }

  /** O código conferiu: a conta está aberta, e o pedido segue de onde parou. */
  protected async aoConfirmarEmail(): Promise<void> {
    this.emailParaConfirmar.set(null);
    this.usarContaLogada(this.form.controls.nome.value.trim());
    this.enviando.set(true);
    try {
      await this.concluirPedido();
    } finally {
      this.enviando.set(false);
    }
  }

  /** "Errei o e-mail": volta ao formulário para corrigir e cadastrar de novo. */
  protected voltarDoCodigo(): void {
    this.emailParaConfirmar.set(null);
    this.form.controls.senha.reset('');
  }

  /** Com a conta aberta: envia a foto (se houver) e cria o pedido para entrar na equipe. */
  private async concluirPedido(): Promise<void> {
    const telefone = this.form.controls.telefone.value;

    try {
      if (this.fotoEscolhida) {
        try {
          await this.authService.atualizarFoto(await prepararFotoDePerfil(this.fotoEscolhida));
          this.fotoEscolhida = null;
        } catch {
          this.erro.set('Não foi possível enviar a foto. Escolha outra imagem ou continue sem foto.');
          return;
        }
      }

      await this.equipeService.aceitarConvite(this.codigo(), telefone.trim());
      await this.router.navigateByUrl(ROTA_AGUARDANDO_GERENTE, { replaceUrl: true });
    } catch (erro) {
      this.erro.set(
        mensagemDoBanco(erro) ?? 'Não foi possível enviar o pedido agora. Tente novamente.',
      );
    }
  }

  private usarContaLogada(nome: string): void {
    this.contaLogada.set(nome);
    this.form.controls.nome.disable();
    this.form.controls.email.disable();
    this.form.controls.senha.disable();
  }
}
