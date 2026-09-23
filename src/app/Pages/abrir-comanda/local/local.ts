import { Location } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Estabelecimento } from '../../../models';
import { ComandaService } from '../../../services/comanda.service';
import { EstabelecimentosService } from '../../../services/estabelecimentos.service';

@Component({
  selector: 'app-abrir-comanda-local',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './local.html',
  styleUrl: './local.scss',
})
export class AbrirComandaLocalComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly comandaService = inject(ComandaService);
  private readonly estabelecimentosService = inject(EstabelecimentosService);

  /** id do estabelecimento (vem da rota, ex: a partir do Perfil do bar). */
  id = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly estabelecimento = signal<Estabelecimento | null>(null);

  localSelecionado: 'mesa' | 'balcao' | null = null;
  numeroMesa = '';
  protected readonly mensagem = signal('');
  protected readonly salvando = signal(false);

  async ngOnInit(): Promise<void> {
    this.estabelecimento.set(await this.estabelecimentosService.buscarPorId(this.id()));
    this.carregando.set(false);
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
      const comanda = await this.comandaService.abrirComanda(this.id(), mesa);
      void this.router.navigate(['/cliente/comanda', comanda.id]);
    } catch {
      this.mensagem.set('Não foi possível abrir a comanda agora. Tente novamente.');
      this.salvando.set(false);
    }
  }

  voltar(): void {
    this.location.back();
  }
}
