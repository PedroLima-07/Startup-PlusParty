import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NavCliente } from '../../components/nav-cliente/nav-cliente';
import { Comanda, Estabelecimento } from '../../models';
import { AuthService } from '../../services/auth.service';
import { HomeService } from '../../services/home.service';
import { Carregando } from '../../components/carregando/carregando';
import { ErroCarregar } from '../../components/erro-carregar/erro-carregar';

interface EstabelecimentoComLotacao extends Estabelecimento {
  lotacao: 'normal' | 'quente';
}

@Component({
  selector: 'app-home',
  imports: [Carregando, ErroCarregar, RouterLink, NavCliente],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage implements OnInit {
  private authService = inject(AuthService);
  private homeService = inject(HomeService);
  private router = inject(Router);

  protected readonly carregando = signal(true);
  protected readonly erroCarregar = signal(false);
  protected readonly logado = signal(false);
  protected readonly nome = signal('');
  protected readonly comandaAtiva = signal<Comanda | null>(null);
  protected readonly estabelecimentos = signal<EstabelecimentoComLotacao[]>([]);

  protected readonly favoritos = computed(() => this.estabelecimentos().slice(0, 2));

  protected readonly rotuloComanda = computed(() => {
    switch (this.comandaAtiva()?.status) {
      case 'aguardando_liberacao':
        return 'Aguardando liberação...';
      case 'aberta':
      case 'aguardando_pagamento':
        return 'Visualizar comanda';
      default:
        return 'Abrir comanda';
    }
  });

  protected readonly iconeComanda = computed(() => {
    switch (this.comandaAtiva()?.status) {
      case 'aguardando_liberacao':
        return '⏳';
      case 'aberta':
      case 'aguardando_pagamento':
        return '👁';
      default:
        return '+';
    }
  });

  protected readonly linkComanda = computed<string[]>(() => {
    const comanda = this.comandaAtiva();
    return comanda ? ['/cliente/comanda', comanda.id] : ['/cliente/discovery'];
  });

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erroCarregar.set(false);

    try {
      const user = await this.authService.usuarioAtual();

      const [nome, comandaAtiva, estabelecimentos, comandasAbertas] = await Promise.all([
        user ? this.authService.buscarNomeAtual() : Promise.resolve('Visitante'),
        user ? this.homeService.buscarComandaAtiva(user.id) : Promise.resolve(null),
        this.homeService.listarEstabelecimentos(),
        // O selo "Quente" é um detalhe: se a contagem falhar, a Home abre com
        // todos os bares em "Normal" em vez de não abrir.
        this.homeService.contarComandasAbertasPorBar().catch(() => new Map<string, number>()),
      ]);

      this.logado.set(user !== null);
      this.nome.set(nome);
      this.comandaAtiva.set(comandaAtiva);
      this.estabelecimentos.set(
        estabelecimentos.map((estabelecimento) => ({
          ...estabelecimento,
          lotacao: this.homeService.calcularLotacao(
            comandasAbertas.get(estabelecimento.id) ?? 0,
            estabelecimento.capacidade,
          ),
        })),
      );
    } catch {
      this.erroCarregar.set(true);
    } finally {
      this.carregando.set(false);
    }
  }

  protected async sair(): Promise<void> {
    await this.authService.sair();
    await this.router.navigateByUrl('/login');
  }

  protected inicial(nome: string): string {
    return nome.charAt(0).toUpperCase();
  }
}
