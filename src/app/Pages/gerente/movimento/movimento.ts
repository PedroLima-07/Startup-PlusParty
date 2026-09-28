import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MovimentoService } from '../../../services/movimento.service';

type Filtro = 'todas' | 'abertas' | 'aguardando_pagamento' | 'pagas';

@Component({
  selector: 'app-movimento',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './movimento.html',
  styleUrls: ['./movimento.scss']
})
export class Movimento {
  movimentoService = inject(MovimentoService);
  
  filtroAtual = signal<Filtro>('todas');
  
  comandasFiltradas = computed(() => {
    const comandas = this.movimentoService.comandas();
    const filtro = this.filtroAtual();
    
    if (filtro === 'todas') return comandas;
    if (filtro === 'abertas') return comandas.filter(c => c.status === 'aberta');
    if (filtro === 'aguardando_pagamento') return comandas.filter(c => c.status === 'aguardando_pagamento');
    if (filtro === 'pagas') return comandas.filter(c => c.status === 'paga');
    
    return comandas;
  });

  setFiltro(filtro: Filtro) {
    this.filtroAtual.set(filtro);
  }
}
