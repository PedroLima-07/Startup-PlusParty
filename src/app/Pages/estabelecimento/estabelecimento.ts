import { Location } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Estabelecimento } from '../../models';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';

@Component({
  selector: 'app-estabelecimento',
  standalone: true,
  imports: [],
  templateUrl: './estabelecimento.html',
  styleUrl: './estabelecimento.scss',
})
export class EstabelecimentoPage implements OnInit {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly estabelecimentosService = inject(EstabelecimentosService);

  id = input.required<string>();

  protected readonly carregando = signal(true);
  protected readonly estabelecimento = signal<Estabelecimento | null>(null);
  protected readonly enderecoCopiado = signal(false);

  async ngOnInit(): Promise<void> {
    this.estabelecimento.set(await this.estabelecimentosService.buscarPorId(this.id()));
    this.carregando.set(false);
  }

  protected voltar(): void {
    this.location.back();
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
