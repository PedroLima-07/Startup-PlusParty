import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Carregando } from '../../../components/carregando/carregando';
import { Funcionario, SolicitacaoPendente } from '../../../models';
import { EquipeService } from '../../../services/equipe.service';

/**
 * Aba Equipe do gerente: responde quem pediu para trabalhar no bar e remove
 * quem saiu. Os pedidos novos chegam sozinhos (o layout do gerente escuta o
 * banco e atualiza a lista que esta tela mostra).
 */
@Component({
  selector: 'app-equipe',
  imports: [Carregando, DatePipe],
  templateUrl: './equipe.html',
  styleUrl: './equipe.scss',
})
export class Equipe implements OnInit {
  private equipeService = inject(EquipeService);

  protected readonly pendentes = this.equipeService.pendentes;
  protected readonly funcionarios = signal<Funcionario[]>([]);
  protected readonly carregando = signal(true);
  /** As listas já vieram do banco ao menos uma vez (senão "0 pedidos" seria enganoso). */
  protected readonly carregou = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** id do pedido ou do funcionário com uma ação em andamento, para travar os botões. */
  protected readonly processando = signal<string | null>(null);
  /** Funcionário cuja remoção está esperando a confirmação do gerente. */
  protected readonly remocaoEmConfirmacao = signal<Funcionario | null>(null);

  async ngOnInit(): Promise<void> {
    await this.carregar();
    this.carregando.set(false);
  }

  protected async responder(pedido: SolicitacaoPendente, aprovar: boolean): Promise<void> {
    await this.executar(pedido.id, () => this.equipeService.responder(pedido.id, aprovar));
  }

  protected pedirConfirmacaoRemocao(funcionario: Funcionario): void {
    this.remocaoEmConfirmacao.set(funcionario);
  }

  protected cancelarRemocao(): void {
    if (this.processando()) return;
    this.remocaoEmConfirmacao.set(null);
  }

  protected async confirmarRemocao(): Promise<void> {
    const funcionario = this.remocaoEmConfirmacao();
    if (!funcionario) return;

    await this.executar(funcionario.id, () => this.equipeService.remover(funcionario.id));
    this.remocaoEmConfirmacao.set(null);
  }

  private async carregar(): Promise<void> {
    try {
      const [, funcionarios] = await Promise.all([
        this.equipeService.carregarPendentes(),
        this.equipeService.listarFuncionarios(),
      ]);
      this.funcionarios.set(funcionarios);
      this.carregou.set(true);
    } catch {
      this.erro.set('Não foi possível carregar a equipe. Atualize a página para tentar de novo.');
    }
  }

  /** Roda a ação e recarrega as duas listas, tenha dado certo ou não. */
  private async executar(id: string, acao: () => Promise<void>): Promise<void> {
    if (this.processando()) return;

    this.processando.set(id);
    this.erro.set(null);

    try {
      await acao();
      await this.carregar();
    } catch (erro) {
      await this.carregar();
      this.erro.set(mensagemDoBanco(erro) ?? 'Não foi possível concluir. Tente novamente.');
    } finally {
      this.processando.set(null);
    }
  }
}

/**
 * As funções de supabase/equipe.sql recusam com uma frase já escrita para o
 * gerente (ex.: pedido que outra aba já respondeu). Erro de rede não tem isso.
 */
function mensagemDoBanco(erro: unknown): string | null {
  const { code, message } = (erro ?? {}) as { code?: string; message?: string };
  return code === 'P0001' && message ? message : null;
}
