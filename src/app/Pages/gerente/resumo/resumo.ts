import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MovimentoService } from '../../../services/movimento.service';
import { GraficoHoras } from '../componentes/grafico-horas';
import { Icone } from '../componentes/icone';
import { MaisVendidos } from '../componentes/mais-vendidos';
import { TempoPreparo } from '../componentes/tempo-preparo';

/** Resumo completo da noite, aberto a partir do cartão de faturamento do Movimento. */
@Component({
  selector: 'app-resumo',
  imports: [CurrencyPipe, DatePipe, GraficoHoras, Icone, MaisVendidos, RouterLink, TempoPreparo],
  templateUrl: './resumo.html',
  styleUrl: './resumo.scss',
})
export class Resumo {
  protected readonly movimento = inject(MovimentoService);

  protected readonly atualizadoEm = signal(new Date());

  // TODO: quando os números vierem do Supabase, buscar de novo aqui.
  protected atualizar(): void {
    this.atualizadoEm.set(new Date());
  }
}
