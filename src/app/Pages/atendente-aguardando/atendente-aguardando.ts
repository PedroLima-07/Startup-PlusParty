import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Carregando } from '../../components/carregando/carregando';
import { MinhaSolicitacaoEquipe } from '../../models';
import { AuthService } from '../../services/auth.service';
import { EquipeService, ROTA_CADASTRO_ATENDENTE } from '../../services/equipe.service';
import { SupabaseService } from '../../services/supabase.service';

/**
 * Acompanha o pedido para trabalhar num bar: esperando o gerente, aprovado ou
 * recusado. Muda sozinha quando o gerente responde.
 */
@Component({
  selector: 'app-atendente-aguardando',
  imports: [Carregando],
  templateUrl: './atendente-aguardando.html',
  styleUrls: ['../login/login.scss', './atendente-aguardando.scss'],
})
export class AtendenteAguardandoPage implements OnInit {
  private authService = inject(AuthService);
  private equipeService = inject(EquipeService);
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  protected readonly carregando = signal(true);
  protected readonly solicitacao = signal<MinhaSolicitacaoEquipe | null>(null);
  protected readonly processando = signal(false);
  protected readonly erro = signal<string | null>(null);

  /** Já saindo desta tela: os avisos do banco que chegarem não devem trazer de volta. */
  private saindo = false;

  async ngOnInit(): Promise<void> {
    const usuario = await this.authService.usuarioAtual();
    if (usuario) {
      const pararDeEscutar = this.supabase.escutarMudancas(
        [{ tabela: 'solicitacoes_equipe', filtro: `usuario_id=eq.${usuario.id}` }],
        () => void this.carregar(),
      );
      this.destroyRef.onDestroy(pararDeEscutar);
    }

    await this.carregar();
  }

  /** O gerente aprovou: o perfil mudou no banco, então a cópia guardada na aba é descartada. */
  protected async entrar(): Promise<void> {
    this.saindo = true;
    this.authService.esquecerPerfil();
    await this.router.navigateByUrl('/atendente/pedidos', { replaceUrl: true });
  }

  /** Enquanto espera, a pessoa continua sendo cliente e pode usar o app normalmente. */
  protected async usarComoCliente(): Promise<void> {
    this.saindo = true;
    await this.router.navigateByUrl('/cliente/home');
  }

  protected async cancelarPedido(): Promise<void> {
    await this.desistirEIrPara('/cliente/home');
  }

  protected async pedirDeNovo(): Promise<void> {
    await this.desistirEIrPara(ROTA_CADASTRO_ATENDENTE);
  }

  protected async sair(): Promise<void> {
    this.saindo = true;
    await this.authService.sair();
    await this.router.navigateByUrl('/login');
  }

  private async carregar(): Promise<void> {
    if (this.saindo) return;

    try {
      const solicitacao = await this.equipeService.buscarMinhaSolicitacao();
      if (this.saindo) return;

      if (!solicitacao) {
        await this.router.navigateByUrl(ROTA_CADASTRO_ATENDENTE, { replaceUrl: true });
        return;
      }

      this.solicitacao.set(solicitacao);
      this.erro.set(null);
    } catch {
      this.erro.set('Não foi possível consultar o seu pedido. Atualize a página para tentar de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  /** Apaga o pedido (pendente ou recusado), o que libera fazer outro. */
  private async desistirEIrPara(destino: string): Promise<void> {
    const solicitacao = this.solicitacao();
    if (!solicitacao || this.processando()) return;

    this.processando.set(true);
    this.erro.set(null);
    this.saindo = true;

    try {
      await this.equipeService.desistir(solicitacao.id);
      await this.router.navigateByUrl(destino, { replaceUrl: true });
    } catch {
      this.saindo = false;
      this.erro.set('Não foi possível concluir agora. Tente novamente.');
      this.processando.set(false);
    }
  }
}
