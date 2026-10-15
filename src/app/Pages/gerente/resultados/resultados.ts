import { Component, OnInit, inject } from '@angular/core';
import { MovimentoService } from '../../../services/movimento.service';
import { GraficoHoras } from '../componentes/grafico-horas';
import { MaisVendidos } from '../componentes/mais-vendidos';
import { TempoPreparo } from '../componentes/tempo-preparo';

/** Leitura da noite para o gerente: quando lotou, o que mais saiu e quanto demora o preparo. */
@Component({
  selector: 'app-resultados',
  imports: [GraficoHoras, MaisVendidos, TempoPreparo],
  templateUrl: './resultados.html',
  styleUrl: './resultados.scss',
})
export class Resultados implements OnInit {
  protected readonly movimento = inject(MovimentoService);

  ngOnInit(): void {
    void this.movimento.atualizar();
  }
}
