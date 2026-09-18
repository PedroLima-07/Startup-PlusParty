import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ComandaState } from '../../models';
import { ComandaService } from '../../services/comanda.service';

@Component({
  selector: 'app-comanda',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './comanda.html',
  styleUrl: './comanda.scss',
})
export class ComandaPage {
  private readonly router = inject(Router);
  private readonly comandaService = inject(ComandaService);

  protected readonly comanda = this.comandaService.comanda;
  protected readonly total = this.comandaService.total;

  protected rotuloLocal(comanda: ComandaState): string {
    if (comanda.tipoLocal === 'mesa') {
      return comanda.numeroMesa ? `Mesa ${comanda.numeroMesa}` : 'Mesa';
    }
    return 'Balcão';
  }

  protected fazerPedido(): void {
    // TODO: navegar para a tela de cardápio/novo pedido quando existir
    console.log('fazer pedido ainda não foi implementado');
  }

  protected fecharConta(): void {
    this.comandaService.fecharConta();
    void this.router.navigate(['/abrir-comanda']);
  }
}