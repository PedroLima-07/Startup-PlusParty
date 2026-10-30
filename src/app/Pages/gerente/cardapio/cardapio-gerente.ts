import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Item, NovoItem, SetorItem } from '../../../models';
import { GerenteBarService } from '../../../services/gerente-bar.service';
import { lerEntrada } from '../../../dinheiro';

/** O que o formulário edita: o preço como texto ("12,90"). */
interface Formulario {
  nome: string;
  categoria: string;
  preco: string;
  setor: SetorItem;
  disponivel: boolean;
}

function formularioVazio(categoria = ''): Formulario {
  return { nome: '', categoria, preco: '', setor: 'bar', disponivel: true };
}

/**
 * Cardápio do bar para o gerente: criar, editar, apagar e marcar como
 * esgotado. Item esgotado some do cardápio do cliente e o banco recusa novos
 * pedidos dele (criar_pedido); o preço novo só vale para os próximos pedidos.
 */
@Component({
  selector: 'app-cardapio-gerente',
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './cardapio-gerente.html',
  styleUrl: './cardapio-gerente.scss',
  host: { '(document:keydown.escape)': 'fecharPainel()' },
})
export class CardapioGerente implements OnInit {
  private readonly gerente = inject(GerenteBarService);

  protected readonly itens = signal<Item[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly busca = signal('');
  protected readonly aviso = signal<string | null>(null);
  /** Item com a disponibilidade sendo gravada. */
  protected readonly alternando = signal<string | null>(null);

  /** `null` fechado; `'novo'` criando; ou o item em edição. */
  protected readonly painel = signal<'novo' | Item | null>(null);
  protected form: Formulario = formularioVazio();
  protected readonly salvando = signal(false);
  protected readonly erroForm = signal<string | null>(null);
  protected readonly confirmandoApagar = signal(false);

  protected readonly categorias = computed(() => [...new Set(this.itens().map((i) => i.categoria))].sort());

  /** Itens por categoria, filtrados pela busca. */
  protected readonly grupos = computed(() => {
    const termo = this.busca().trim().toLocaleLowerCase();
    const grupos = new Map<string, Item[]>();
    for (const item of this.itens()) {
      if (termo && !`${item.nome} ${item.categoria}`.toLocaleLowerCase().includes(termo)) continue;
      grupos.set(item.categoria, [...(grupos.get(item.categoria) ?? []), item]);
    }
    return [...grupos.entries()].map(([categoria, itens]) => ({ categoria, itens }));
  });

  protected readonly esgotados = computed(() => this.itens().filter((i) => !i.disponivel).length);

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      this.itens.set(await this.gerente.itens());
    } catch {
      this.erro.set('Não foi possível carregar o cardápio. Tente de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected novo(categoria = ''): void {
    this.form = formularioVazio(categoria);
    this.erroForm.set(null);
    this.confirmandoApagar.set(false);
    this.painel.set('novo');
  }

  protected editar(item: Item): void {
    this.form = {
      nome: item.nome,
      categoria: item.categoria,
      preco: item.preco.toFixed(2).replace('.', ','),
      setor: item.setor,
      disponivel: item.disponivel,
    };
    this.erroForm.set(null);
    this.confirmandoApagar.set(false);
    this.painel.set(item);
  }

  protected fecharPainel(): void {
    if (this.salvando()) return;
    this.painel.set(null);
  }

  protected editando(): boolean {
    return this.painel() !== 'novo';
  }

  protected async salvar(): Promise<void> {
    const painel = this.painel();
    if (!painel || this.salvando()) return;

    const nome = this.form.nome.trim();
    const categoria = this.form.categoria.trim();
    const preco = lerEntrada(this.form.preco);
    if (!nome) return this.erroForm.set('Dê um nome ao item.');
    if (!categoria) return this.erroForm.set('Escolha ou escreva a categoria (ex.: Cervejas, Porções).');
    if (preco === null || preco === 'invalida' || preco <= 0) {
      return this.erroForm.set('O preço precisa ser um valor maior que zero, como 12,90.');
    }

    const item: NovoItem = { nome, categoria, preco, setor: this.form.setor, disponivel: this.form.disponivel };
    this.salvando.set(true);
    this.erroForm.set(null);
    try {
      if (painel === 'novo') {
        const criado = await this.gerente.criarItem(item);
        this.itens.update((lista) => ordenar([...lista, criado]));
        this.mostrarAviso(`"${criado.nome}" entrou no cardápio.`);
      } else {
        const salvo = await this.gerente.editarItem(painel.id, item);
        this.itens.update((lista) => ordenar(lista.map((i) => (i.id === salvo.id ? salvo : i))));
        this.mostrarAviso(`"${salvo.nome}" foi atualizado.`);
      }
      this.salvando.set(false);
      this.painel.set(null);
    } catch {
      this.erroForm.set('Não foi possível salvar o item. Tente de novo.');
    } finally {
      this.salvando.set(false);
    }
  }

  /** Esgotou ou voltou: muda na hora no cardápio do cliente. */
  protected async alternarDisponivel(item: Item): Promise<void> {
    if (this.alternando()) return;
    this.alternando.set(item.id);
    try {
      const salvo = await this.gerente.editarItem(item.id, { disponivel: !item.disponivel });
      this.itens.update((lista) => lista.map((i) => (i.id === salvo.id ? salvo : i)));
    } catch {
      this.mostrarAviso('Não foi possível mudar agora. Tente de novo.');
    } finally {
      this.alternando.set(null);
    }
  }

  protected async apagar(): Promise<void> {
    const painel = this.painel();
    if (!painel || painel === 'novo' || this.salvando()) return;
    this.salvando.set(true);
    try {
      const apagou = await this.gerente.apagarItem(painel.id);
      if (apagou) {
        this.itens.update((lista) => lista.filter((i) => i.id !== painel.id));
        this.mostrarAviso(`"${painel.nome}" saiu do cardápio.`);
        this.salvando.set(false);
        this.painel.set(null);
      } else {
        this.confirmandoApagar.set(false);
        this.erroForm.set(
          'Este item já foi pedido, então os pedidos antigos dependem dele. Para tirar do cardápio, marque como esgotado.',
        );
      }
    } catch {
      this.erroForm.set('Não foi possível apagar agora. Tente de novo.');
    } finally {
      this.salvando.set(false);
    }
  }

  private mostrarAviso(texto: string): void {
    this.aviso.set(texto);
    setTimeout(() => {
      if (this.aviso() === texto) this.aviso.set(null);
    }, 3000);
  }
}

function ordenar(itens: Item[]): Item[] {
  return [...itens].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
}
