import { Location } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Estabelecimento } from '../../../models';
import { ComandaService } from '../../../services/comanda.service';

@Component({
  selector: 'app-abrir-comanda-local',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './local.html',
  styleUrl: './local.scss',
})
export class AbrirComandaLocalComponent {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly comandaService = inject(ComandaService);

  estabelecimento: Estabelecimento = {
    id: '',
    nome: '',
    descricao: null,
    endereco: null,
    capacidade: null,
    avaliacao: null,
    criado_em: '',
  };

  localSelecionado: 'mesa' | 'balcao' | null = null;
  numeroMesa = '';
  protected readonly mensagem = signal('');
  protected readonly salvando = signal(false);

  constructor() {
    const estabelecimentoState = history.state?.['estabelecimento'] as Estabelecimento | undefined;

    if (estabelecimentoState) {
      this.estabelecimento = estabelecimentoState;
    } else {
      // Sem o estado da navegação (ex.: página recarregada), não há dado
      // confiável do estabelecimento — volta pro início da escolha.
      void this.router.navigate(['/abrir-comanda']);
    }
  }

  selecionarLocal(local: 'mesa' | 'balcao'): void {
    this.localSelecionado = local;

    if (local === 'balcao') {
      this.numeroMesa = '';
    }
  }

  podeAbrirComanda(): boolean {
    if (this.salvando()) return false;

    if (this.localSelecionado === 'balcao') {
      return true;
    }

    return this.localSelecionado === 'mesa' && this.numeroMesa.trim().length > 0;
  }

  async abrirComanda(): Promise<void> {
    if (!this.podeAbrirComanda()) {
      return;
    }

    this.salvando.set(true);
    this.mensagem.set('');

    try {
      const mesa = this.localSelecionado === 'mesa' ? this.numeroMesa.trim() : null;
      const comanda = await this.comandaService.abrirComanda(this.estabelecimento.id, mesa);
      void this.router.navigate(['/comanda', comanda.id]);
    } catch {
      this.mensagem.set('Não foi possível abrir a comanda agora. Tente novamente.');
      this.salvando.set(false);
    }
  }

  voltar(): void {
    this.location.back();
  }
}
