import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Carregando } from '../../../components/carregando/carregando';
import { mensagemDoBanco } from '../../../erros-banco';
import { Funcionario, SolicitacaoPendente } from '../../../models';
import { AuthService } from '../../../services/auth.service';
import { DesempenhoService } from '../../../services/desempenho.service';
import { EquipeService } from '../../../services/equipe.service';
import { Avatar } from '../componentes/avatar';
import { Icone } from '../componentes/icone';

/**
 * Aba Equipe do gerente: convida atendentes, responde quem usou o convite e
 * lista quem já trabalha no bar (cada um abre o próprio perfil). Os pedidos
 * novos chegam sozinhos: o layout do gerente escuta o banco e atualiza a
 * lista que esta tela mostra.
 */
@Component({
  selector: 'app-equipe',
  imports: [Avatar, Carregando, DatePipe, Icone, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './equipe.html',
  styleUrls: ['./equipe.scss', './equipe.desktop.scss'],
})
export class Equipe implements OnInit {
  private equipeService = inject(EquipeService);
  private desempenhoService = inject(DesempenhoService);
  private authService = inject(AuthService);

  protected readonly pendentes = this.equipeService.pendentes;
  protected readonly funcionarios = signal<Funcionario[]>([]);
  /** Pedidos entregues hoje por atendente; null quando o número não pôde ser lido. */
  protected readonly pedidosDeHoje = signal<Map<string, number> | null>(null);
  protected readonly nomeDoBar = signal('');
  protected readonly carregando = signal(true);
  /** As listas já vieram do banco ao menos uma vez (senão "0 pedidos" seria enganoso). */
  protected readonly carregou = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** O perfil de um atendente está aberto (rota filha /gerente/equipe/<id>). */
  protected readonly perfilAberto = signal(false);
  /** id do pedido com uma resposta em andamento, para travar os botões. */
  protected readonly processando = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const [nome] = await Promise.all([
      this.authService.buscarNomeEstabelecimentoAtual().catch(() => null),
      this.carregar(),
    ]);
    this.nomeDoBar.set(nome ?? '');
    this.carregando.set(false);
  }

  protected async responder(pedido: SolicitacaoPendente, aprovar: boolean): Promise<void> {
    if (this.processando()) return;

    this.processando.set(pedido.id);
    this.erro.set(null);

    try {
      await this.equipeService.responder(pedido.id, aprovar);
      await this.carregar();
    } catch (erro) {
      await this.carregar();
      this.erro.set(mensagemDoBanco(erro) ?? 'Não foi possível concluir. Tente novamente.');
    } finally {
      this.processando.set(null);
    }
  }

  /**
   * O perfil fechou: o gerente voltou para a lista ou removeu o atendente.
   * Recarrega para quem foi removido sair da lista.
   */
  protected async aoFecharPerfil(): Promise<void> {
    this.perfilAberto.set(false);
    if (this.carregou()) await this.carregar();
  }

  /** "42 pedidos entregues hoje", ou o e-mail quando o número não está disponível. */
  protected resumoDoDia(funcionario: Funcionario): string {
    const porAtendente = this.pedidosDeHoje();
    if (!porAtendente) return funcionario.email;

    const pedidos = porAtendente.get(funcionario.id) ?? 0;
    if (pedidos === 0) return 'Nenhum pedido entregue hoje';
    return `${pedidos} ${pedidos === 1 ? 'pedido entregue' : 'pedidos entregues'} hoje`;
  }

  /** Há quanto tempo o pedido chegou: "há 5 min", "há 3 h", ou a data. */
  protected haQuantoTempo(data: string): string | null {
    const minutos = Math.floor((Date.now() - new Date(data).getTime()) / 60_000);
    if (minutos < 1) return 'agora há pouco';
    if (minutos < 60) return `há ${minutos} min`;
    if (minutos < 24 * 60) return `há ${Math.floor(minutos / 60)} h`;
    return null;
  }

  private async carregar(): Promise<void> {
    try {
      const [, funcionarios, pedidosDeHoje] = await Promise.all([
        this.equipeService.carregarPendentes(),
        this.equipeService.listarFuncionarios(),
        // O desempenho é um complemento: sem ele, a lista da equipe continua aparecendo.
        this.desempenhoService.pedidosDeHojePorAtendente().catch(() => null),
      ]);
      this.funcionarios.set(funcionarios);
      this.pedidosDeHoje.set(pedidosDeHoje);
      this.carregou.set(true);
    } catch {
      this.erro.set('Não foi possível carregar a equipe. Atualize a página para tentar de novo.');
    }
  }
}
