import { Component, computed, inject, signal } from '@angular/core';
import { AtivarAvisos } from '../../components/ativar-avisos/ativar-avisos';
import { ICONE_NOTIFICACAO } from '../../components/aviso-notificacao/icone-notificacao';
import { Carregando } from '../../components/carregando/carregando';
import { ErroCarregar } from '../../components/erro-carregar/erro-carregar';
import { NavCliente } from '../../components/nav-cliente/nav-cliente';
import { Notificacao } from '../../models';
import { NotificacoesService } from '../../services/notificacoes.service';
import { haQuantoTempo } from '../../tempo';

interface Grupo {
  titulo: string;
  itens: Notificacao[];
}

/**
 * Notificações do cliente, das mais novas para as mais antigas. As que
 * chegam com a tela aberta entram no topo na hora; as não lidas ficam
 * destacadas até a pessoa tocar nelas ou marcar todas como lidas.
 */
@Component({
  selector: 'app-notificacoes',
  imports: [AtivarAvisos, Carregando, ErroCarregar, NavCliente],
  templateUrl: './notificacoes.html',
  styleUrl: './notificacoes.scss',
})
export class NotificacoesPage {
  protected readonly servico = inject(NotificacoesService);
  protected readonly icones = ICONE_NOTIFICACAO;

  protected readonly marcando = signal(false);
  protected readonly erroMarcar = signal(false);

  protected readonly grupos = computed<Grupo[]>(() => {
    const inicioDeHoje = new Date();
    inicioDeHoje.setHours(0, 0, 0, 0);

    const hoje: Notificacao[] = [];
    const antes: Notificacao[] = [];
    for (const notificacao of this.servico.lista()) {
      (new Date(notificacao.criada_em) >= inicioDeHoje ? hoje : antes).push(notificacao);
    }

    return [
      { titulo: 'Hoje', itens: hoje },
      { titulo: 'Anteriores', itens: antes },
    ].filter((grupo) => grupo.itens.length > 0);
  });

  constructor() {
    // Atualiza ao abrir: pode ter chegado algo enquanto a aba dormia.
    void this.servico.carregar();
  }

  protected quando(notificacao: Notificacao): string {
    return haQuantoTempo(notificacao.criada_em);
  }

  protected async marcarTodas(): Promise<void> {
    this.marcando.set(true);
    this.erroMarcar.set(false);
    try {
      await this.servico.marcarTodasComoLidas();
    } catch {
      this.erroMarcar.set(true);
    } finally {
      this.marcando.set(false);
    }
  }
}
