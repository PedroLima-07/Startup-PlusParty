import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Estabelecimento } from '../../models';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';

@Component({
  selector: 'app-discovery',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './discovery.html',
  styleUrl: './discovery.scss',
})
export class DiscoveryPage implements OnInit {
  private readonly router = inject(Router);
  private readonly estabelecimentosService = inject(EstabelecimentosService);

  protected readonly carregando = signal(true);
  protected readonly estabelecimentos = signal<Estabelecimento[]>([]);
  busca = '';

  async ngOnInit(): Promise<void> {
    this.estabelecimentos.set(await this.estabelecimentosService.listar());
    this.carregando.set(false);
  }

  get estabelecimentosFiltrados(): Estabelecimento[] {
    const termo = this.busca.trim().toLocaleLowerCase();
    const lista = this.estabelecimentos();

    if (!termo) {
      return lista;
    }

    return lista.filter((estabelecimento) =>
      estabelecimento.nome.toLocaleLowerCase().includes(termo),
    );
  }

  protected abrirPerfil(estabelecimento: Estabelecimento): void {
    void this.router.navigate(['/cliente/estabelecimento', estabelecimento.id]);
  }

  protected iniciais(nome: string): string {
    const palavras = nome.trim().split(/\s+/).filter(Boolean);

    if (palavras.length === 1) {
      return palavras[0].charAt(0).toUpperCase();
    }

    return `${palavras[0].charAt(0)}${palavras[palavras.length - 1].charAt(0)}`.toUpperCase();
  }
}
