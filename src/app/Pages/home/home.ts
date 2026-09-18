import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Comanda, Estabelecimento } from '../../models';
import { AuthService } from '../../services/auth.service';
import { HomeService } from '../../services/home.service';
import { SupabaseService } from '../../services/supabase.service';

interface EstabelecimentoComLotacao extends Estabelecimento {
  lotacao: 'normal' | 'quente';
}

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage implements OnInit {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);
  private homeService = inject(HomeService);

  protected readonly carregando = signal(true);
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
    return comanda ? ['/comanda', comanda.id] : ['/abrir-comanda'];
  });

  async ngOnInit(): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.client.auth.getUser();

    // TODO: exigir sessão de verdade assim que o authGuard voltar (ver app.routes.ts).
    const [nome, comandaAtiva, estabelecimentos] = await Promise.all([
      user ? this.authService.buscarNomeAtual() : Promise.resolve('Visitante'),
      user ? this.homeService.buscarComandaAtiva(user.id) : Promise.resolve(null),
      this.carregarEstabelecimentosComLotacao(),
    ]);

    this.nome.set(nome);
    this.comandaAtiva.set(comandaAtiva);
    this.estabelecimentos.set(estabelecimentos);
    this.carregando.set(false);
  }

  protected inicial(nome: string): string {
    return nome.charAt(0).toUpperCase();
  }

  private async carregarEstabelecimentosComLotacao(): Promise<EstabelecimentoComLotacao[]> {
    const estabelecimentos = await this.homeService.listarEstabelecimentos();

    return Promise.all(
      estabelecimentos.map(async (estabelecimento) => {
        const comandasAbertas = await this.homeService.contarComandasAbertas(estabelecimento.id);
        return {
          ...estabelecimento,
          lotacao: this.homeService.calcularLotacao(comandasAbertas, estabelecimento.capacidade),
        };
      })
    );
  }
}
