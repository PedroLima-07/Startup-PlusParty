import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Carregando } from '../../../components/carregando/carregando';
import { mensagemDoBanco } from '../../../erros-banco';
import { FuncionarioDetalhe } from '../../../models';
import { Desempenho, DesempenhoService, NOITES_DO_PERFIL } from '../../../services/desempenho.service';
import { EquipeService } from '../../../services/equipe.service';
import { Avatar } from '../componentes/avatar';
import { GraficoBarras, barraMaisAlta } from '../componentes/grafico-barras';

type Periodo = 'hoje' | 'semana';

/** Perfil de um atendente para o gerente: desempenho, dados do cadastro e remoção. */
@Component({
  selector: 'app-equipe-perfil',
  imports: [Avatar, Carregando, DatePipe, GraficoBarras, RouterLink],
  templateUrl: './equipe-perfil.html',
  styleUrl: './equipe-perfil.scss',
})
export class EquipePerfil implements OnInit {
  private equipeService = inject(EquipeService);
  private desempenhoService = inject(DesempenhoService);
  private router = inject(Router);

  /** id do atendente, vindo da rota. */
  readonly id = input.required<string>();

  protected readonly noites = NOITES_DO_PERFIL;
  protected readonly carregando = signal(true);
  protected readonly funcionario = signal<FuncionarioDetalhe | null>(null);
  /** null quando os números não puderam ser lidos (o resto do perfil aparece mesmo assim). */
  protected readonly desempenho = signal<Desempenho | null>(null);
  protected readonly periodo = signal<Periodo>('hoje');
  protected readonly erro = signal<string | null>(null);
  protected readonly confirmandoRemocao = signal(false);
  protected readonly removendo = signal(false);

  /** Os números do período escolhido, já com os textos de cada um. */
  protected readonly painel = computed(() => {
    const desempenho = this.desempenho();
    if (!desempenho) return null;

    const hoje = this.periodo() === 'hoje';
    const resumo = hoje ? desempenho.hoje : desempenho.semana;
    const pico = barraMaisAlta(resumo.barras);

    return {
      resumo,
      total: resumo.pedidos,
      rotuloTotal: hoje ? 'pedidos entregues hoje' : `pedidos nas últimas ${NOITES_DO_PERFIL} noites`,
      media: desempenho.semana.mediaPorNoite,
      rotuloMedia: hoje
        ? `média por noite (${NOITES_DO_PERFIL} noites)`
        : 'por noite trabalhada, em média',
      descricaoGrafico: hoje ? 'Pedidos entregues por hora, hoje' : 'Pedidos entregues por noite',
      leitura: !pico
        ? hoje
          ? 'Nenhum pedido entregue hoje ainda.'
          : `Nenhum pedido entregue nas últimas ${NOITES_DO_PERFIL} noites.`
        : hoje
          ? `O pico foi às ${pico.rotulo}, com ${pico.valor} ${pico.valor === 1 ? 'pedido entregue' : 'pedidos entregues'}.`
          : `A melhor noite foi ${pico.rotulo === 'Hoje' ? 'hoje' : pico.rotulo.toLowerCase()}, com ${pico.valor} ${pico.valor === 1 ? 'pedido' : 'pedidos'}.`,
      temBarras: pico !== null,
    };
  });

  async ngOnInit(): Promise<void> {
    try {
      const [funcionario, desempenho] = await Promise.all([
        this.equipeService.buscarFuncionario(this.id()),
        // O desempenho é um complemento: sem ele, o perfil continua aparecendo.
        this.desempenhoService.buscar(this.id()).catch(() => null),
      ]);
      this.funcionario.set(funcionario);
      this.desempenho.set(desempenho);
    } catch {
      this.erro.set('Não foi possível carregar o perfil. Atualize a página para tentar de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected cancelarRemocao(): void {
    if (this.removendo()) return;
    this.confirmandoRemocao.set(false);
  }

  protected async remover(): Promise<void> {
    if (this.removendo()) return;

    this.removendo.set(true);
    this.erro.set(null);
    try {
      await this.equipeService.remover(this.id());
      await this.router.navigateByUrl('/gerente/equipe', { replaceUrl: true });
    } catch (erro) {
      this.erro.set(mensagemDoBanco(erro) ?? 'Não foi possível remover. Tente novamente.');
      this.confirmandoRemocao.set(false);
      this.removendo.set(false);
    }
  }
}
