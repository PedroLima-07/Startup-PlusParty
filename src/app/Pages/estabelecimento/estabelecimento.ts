import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotaBar } from '../../components/nota-bar/nota-bar';
import { formatarHora, resumirDias, statusHorario } from '../../horario-funcionamento';
import { Estabelecimento } from '../../models';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';
import { NavCliente } from '../../components/nav-cliente/nav-cliente';
import { Carregando } from '../../components/carregando/carregando';

const NOTA_BEM_AVALIADO = 4.5;

@Component({
  selector: 'app-estabelecimento',
  standalone: true,
  imports: [Carregando, NavCliente, NotaBar],
  templateUrl: './estabelecimento.html',
  styleUrl: './estabelecimento.scss',
})
export class EstabelecimentoPage implements OnInit {
  private readonly router = inject(Router);
  private readonly estabelecimentosService = inject(EstabelecimentosService);

  id = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly estabelecimento = signal<Estabelecimento | null>(null);
  protected readonly enderecoCopiado = signal(false);

  protected readonly status = computed(() => {
    const e = this.estabelecimento();
    return e ? statusHorario(e) : null;
  });

  protected readonly horario = computed(() => {
    const e = this.estabelecimento();
    if (!e?.horario_abre || !e.horario_fecha || e.dias_abertos.length === 0) return null;
    return `${resumirDias(e.dias_abertos)} · ${formatarHora(e.horario_abre)} às ${formatarHora(e.horario_fecha)}`;
  });

  protected readonly bemAvaliado = computed(
    () => (this.estabelecimento()?.avaliacao ?? 0) >= NOTA_BEM_AVALIADO,
  );

  async ngOnInit(): Promise<void> {
    this.estabelecimento.set(await this.estabelecimentosService.buscarPorId(this.id()));
    this.carregando.set(false);
  }

  protected voltar(): void {
    void this.router.navigate(['/cliente/discovery']);
  }

  protected abrirComanda(): void {
    void this.router.navigate(['/cliente/abrir-comanda', this.id()]);
  }

  protected verCardapio(): void {
    void this.router.navigate(['/cliente/estabelecimento', this.id(), 'cardapio']);
  }

  protected async copiarEndereco(endereco: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(endereco);
      this.enderecoCopiado.set(true);
      setTimeout(() => this.enderecoCopiado.set(false), 2000);
    } catch {
      // Clipboard indisponível (ex: contexto sem permissão) — sem tratamento especial.
    }
  }
}
