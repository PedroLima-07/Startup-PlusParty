import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Estabelecimento } from '../../models';

@Component({
  selector: 'app-abrir-comanda',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './abrir-comanda.html',
  styleUrl: './abrir-comanda.scss',
})

export class AbrirComandaComponent {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  // Dados falsos temporários. Na integração, troque apenas a origem desta propriedade.
  estabelecimentos: Estabelecimento[] = [
    {
      id: 'bar-001',
      nome: "Bar D'Zé",
      descricao: 'Cerveja gelada, drinks e porções para curtir a noite.',
      endereco: 'Centro, Sorocaba - SP',
      capacidade: 120,
      avaliacao: 4.5,
      criado_em: '2024-12-01',
    },
    {
      id: 'bar-002',
      nome: 'Esquina 27',
      descricao: 'Ambiente descontraído com música e petiscos artesanais.',
      endereco: 'Vila Jardini, Sorocaba - SP',
      capacidade: 90,
      avaliacao: 4.7,
      criado_em: '2022-08-11',
    },
    {
      id: 'bar-003',
      nome: 'Boteco Central',
      descricao: 'Clássicos do boteco, cervejas e porções para compartilhar.',
      endereco: 'Centro, Sorocaba - SP',
      capacidade: 150,
      avaliacao: 4.3,
      criado_em: '2018-10-25',
    },
    {
      id: 'bar-004',
      nome: 'Vila Drinks',
      descricao: 'Drinks autorais e um espaço casual para reunir a galera.',
      endereco: 'Campolim, Sorocaba - SP',
      capacidade: 80,
      avaliacao: 4.8,
      criado_em: '2023-08-15',
    },
    {
      id: 'bar-005',
      nome: 'Quintal 12',
      descricao: 'Bar ao ar livre com música, hambúrgueres e drinks.',
      endereco: 'Além Ponte, Sorocaba - SP',
      capacidade: 110,
      avaliacao: 4.4,
      criado_em: '2021-09-18',
    },
  ];

  favoritos: Estabelecimento[] = this.estabelecimentos.slice(0, 2);
  busca = '';

  get estabelecimentosFiltrados(): Estabelecimento[] {
    const termo = this.busca.trim().toLocaleLowerCase();

    if (!termo) {
      return this.estabelecimentos;
    }

    return this.estabelecimentos.filter((estabelecimento) =>
      estabelecimento.nome.toLocaleLowerCase().includes(termo),
    );
  }

  voltar(): void {
    this.location.back();
  }

  selecionarEstabelecimento(estabelecimento: Estabelecimento): void {
    void this.router.navigate(['/abrir-comanda/local'], {
      queryParams: {
        estabelecimentoId: estabelecimento.id,
      },
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
