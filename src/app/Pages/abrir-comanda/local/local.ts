import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Estabelecimento } from '../../../models';

@Component({
  selector: 'app-abrir-comanda-local',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './abrir-comanda-local.component.html',
  styleUrl: './abrir-comanda-local.component.scss',
})
export class AbrirComandaLocalComponent {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);

  // Dados temporários para o protótipo. Na integração, a origem será o Supabase.
  estabelecimento: Estabelecimento = {
    id: 'bar-001',
    nome: "Bar D'Zé",
    descricao: 'Cerveja gelada, drinks e porções para curtir a noite.',
    endereco: 'Centro, Sorocaba - SP',
    capacidade: 120,
    avaliacao: 4.5,
    criado_em: '2024-12-01',
  };

  localSelecionado: 'mesa' | 'balcao' | null = null;
  numeroMesa = '';
  mensagem = '';

  constructor() {
    const estabelecimentoState = history.state?.['estabelecimento'] as Estabelecimento | undefined;

    if (estabelecimentoState) {
      this.estabelecimento = estabelecimentoState;
      return;
    }

    const estabelecimentoId = this.route.snapshot.queryParamMap.get('estabelecimentoId');

    if (estabelecimentoId) {
      this.estabelecimento = this.obterEstabelecimentoTemporario(estabelecimentoId);
    }
  }

  selecionarLocal(local: 'mesa' | 'balcao'): void {
    this.localSelecionado = local;

    if (local === 'balcao') {
      this.numeroMesa = '';
    }
  }

  podeAbrirComanda(): boolean {
    if (this.localSelecionado === 'balcao') {
      return true;
    }

    return this.localSelecionado === 'mesa' && this.numeroMesa.trim().length > 0;
  }

  abrirComanda(): void {
    if (!this.podeAbrirComanda()) {
      return;
    }

    // Protótipo: simula o UUID que será devolvido pelo Supabase após o INSERT.
    const comandaId = 'demo-comanda-001';

    void this.router.navigate(['/comanda', comandaId], {
      queryParams: {
        estabelecimentoId: this.estabelecimento.id,
        mesa: this.localSelecionado === 'mesa' ? this.numeroMesa.trim() : null,
      },
      state: {
        estabelecimento: this.estabelecimento,
        local: this.localSelecionado,
        mesa: this.localSelecionado === 'mesa' ? this.numeroMesa.trim() : null,
      },
    });
  }

  voltar(): void {
    this.location.back();
  }

  private obterEstabelecimentoTemporario(id: string): Estabelecimento {
    const estabelecimentos: Estabelecimento[] = [
      {
        id: 'bar-001',
        nome: "Bar D'Zé",
        descricao: 'Cerveja gelada, drinks e porções para curtir a noite.',
        endereco: 'Centro, Sorocaba - SP',
        capacidade: 120,
        avaliacao: 4.5,
        criado_em: '2015-12-01',
      },
      {
        id: 'bar-002',
        nome: 'Esquina 27',
        descricao: 'Ambiente descontraído com música e petiscos artesanais.',
        endereco: 'Vila Jardini, Sorocaba - SP',
        capacidade: 90,
        avaliacao: 4.7,
        criado_em: '2022-09-04',
      },
      {
        id: 'bar-003',
        nome: 'Boteco Central',
        descricao: 'Clássicos do boteco, cervejas e porções para compartilhar.',
        endereco: 'Centro, Sorocaba - SP',
        capacidade: 150,
        avaliacao: 4.3,
        criado_em: '2024-12-15',
      },
      {
        id: 'bar-004',
        nome: 'Vila Drinks',
        descricao: 'Drinks autorais e um espaço casual para reunir a galera.',
        endereco: 'Campolim, Sorocaba - SP',
        capacidade: 80,
        avaliacao: 4.8,
        criado_em: '2024-12-01',
      },
      {
        id: 'bar-005',
        nome: 'Quintal 12',
        descricao: 'Bar ao ar livre com música, hambúrgueres e drinks.',
        endereco: 'Além Ponte, Sorocaba - SP',
        capacidade: 110,
        avaliacao: 4.4,
        criado_em: '2014-12-01',
      },
    ];

    return estabelecimentos.find((item) => item.id === id) ?? estabelecimentos[0];
  }
}
