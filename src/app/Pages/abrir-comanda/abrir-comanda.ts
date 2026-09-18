import { Location } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Estabelecimento } from '../../models';
import { HomeService } from '../../services/home.service';

@Component({
  selector: 'app-abrir-comanda',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './abrir-comanda.html',
  styleUrl: './abrir-comanda.scss',
})
export class AbrirComandaComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly homeService = inject(HomeService);

  protected readonly estabelecimentos = signal<Estabelecimento[]>([]);
  protected readonly favoritos = computed(() => this.estabelecimentos().slice(0, 2));
  busca = '';

  async ngOnInit(): Promise<void> {
    this.estabelecimentos.set(await this.homeService.listarEstabelecimentos());
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

  voltar(): void {
    this.location.back();
  }

  selecionarEstabelecimento(estabelecimento: Estabelecimento): void {
    void this.router.navigate(['/abrir-comanda/local'], {
      state: {
        estabelecimento,
      },
    });
  }

  iniciais(nome: string): string {
    const palavras = nome
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (palavras.length === 1) {
      return palavras[0].charAt(0).toUpperCase();
    }

    return `${palavras[0].charAt(0)}${palavras[palavras.length - 1].charAt(0)}`.toUpperCase();
  }

  trackById(_: number, estabelecimento: Estabelecimento): string {
    return estabelecimento.id;
  }
}
