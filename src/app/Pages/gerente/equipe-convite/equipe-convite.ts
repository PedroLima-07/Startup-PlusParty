import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Carregando } from '../../../components/carregando/carregando';
import { mensagemDoBanco } from '../../../erros-banco';
import { ConviteEquipe } from '../../../models';
import { EquipeService, ROTA_CONVITE } from '../../../services/equipe.service';
import { Icone } from '../componentes/icone';

/**
 * O gerente gera o link de convite e o envia para quem vai trabalhar no bar.
 * O link mostrado é o do convite em aberto mais recente; os outros aparecem
 * na lista, para cancelar.
 */
@Component({
  selector: 'app-equipe-convite',
  imports: [Carregando, DatePipe, Icone],
  templateUrl: './equipe-convite.html',
  styleUrl: './equipe-convite.scss',
})
export class EquipeConvite implements OnInit {
  private equipeService = inject(EquipeService);

  protected readonly convites = signal<ConviteEquipe[]>([]);
  protected readonly carregando = signal(true);
  protected readonly gerando = signal(false);
  protected readonly copiado = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** id do convite sendo cancelado, para travar o botão dele. */
  protected readonly cancelando = signal<string | null>(null);

  /** O convite que a tela oferece para copiar e enviar: o mais recente. */
  protected readonly atual = computed(() => this.convites()[0] ?? null);
  protected readonly link = computed(() => {
    const convite = this.atual();
    return convite ? location.origin + ROTA_CONVITE + convite.codigo : '';
  });
  protected readonly linkWhatsapp = computed(
    () =>
      'https://wa.me/?text=' +
      encodeURIComponent(`Você foi convidado para a equipe no +party. Crie sua conta por este link: ${this.link()}`),
  );

  async ngOnInit(): Promise<void> {
    try {
      this.convites.set(await this.equipeService.listarConvitesAbertos());
    } catch {
      this.erro.set('Não foi possível carregar os convites. Atualize a página para tentar de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected async gerar(): Promise<void> {
    if (this.gerando()) return;

    this.gerando.set(true);
    this.erro.set(null);
    try {
      const novo = await this.equipeService.criarConvite();
      this.convites.update((convites) => [novo, ...convites]);
      this.copiado.set(false);
    } catch (erro) {
      this.erro.set(mensagemDoBanco(erro) ?? 'Não foi possível gerar o convite. Tente novamente.');
    } finally {
      this.gerando.set(false);
    }
  }

  protected async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.copiado.set(true);
    } catch {
      this.erro.set('Não foi possível copiar. Segure o dedo sobre o link para copiar à mão.');
    }
  }

  protected async cancelar(convite: ConviteEquipe): Promise<void> {
    if (this.cancelando()) return;

    this.cancelando.set(convite.id);
    this.erro.set(null);
    try {
      await this.equipeService.cancelarConvite(convite.id);
      this.convites.update((convites) => convites.filter((c) => c.id !== convite.id));
      this.copiado.set(false);
    } catch {
      this.erro.set('Não foi possível cancelar o convite. Tente novamente.');
    } finally {
      this.cancelando.set(null);
    }
  }

  /** "expira em 47 h" ou "expira em 30 min". */
  protected expiraEm(convite: ConviteEquipe): string {
    const minutos = Math.max(0, Math.round((new Date(convite.expira_em).getTime() - Date.now()) / 60_000));
    return minutos >= 60 ? `expira em ${Math.floor(minutos / 60)} h` : `expira em ${minutos} min`;
  }
}
