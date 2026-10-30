import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Item } from '../../../models';
import { GerenteBarService } from '../../../services/gerente-bar.service';
import { CardapioGerente } from './cardapio-gerente';

registerLocaleData(localePt);

function item(parcial: Partial<Item>): Item {
  return {
    id: 'i1',
    estabelecimento_id: 'b1',
    nome: 'Chope Pilsen 350ml',
    categoria: 'Cervejas',
    preco: 12,
    setor: 'bar',
    disponivel: true,
    ...parcial,
  };
}

describe('Cardápio (gerente)', () => {
  let fixture: ComponentFixture<CardapioGerente>;
  let servico: Record<string, ReturnType<typeof vi.fn>>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === rotulo,
    )!;
  }

  async function digitar(nome: string, valor: string): Promise<void> {
    const campo = tela().querySelector<HTMLInputElement>(`input[name="${nome}"]`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    servico = {
      itens: vi.fn().mockResolvedValue([
        item({}),
        item({ id: 'i2', nome: 'Batata Frita', categoria: 'Porções', preco: 34, setor: 'cozinha', disponivel: false }),
      ]),
      criarItem: vi.fn().mockImplementation(async (novo: object) => ({ ...item({}), ...novo, id: 'novo' })),
      editarItem: vi.fn().mockImplementation(async (id: string, mudanca: object) => ({ ...item({ id }), ...mudanca })),
      apagarItem: vi.fn().mockResolvedValue(false),
    };
    await TestBed.configureTestingModule({
      imports: [CardapioGerente],
      providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }, { provide: GerenteBarService, useValue: servico }],
    }).compileComponents();

    fixture = TestBed.createComponent(CardapioGerente);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('mostra os itens por categoria, com setor, preço e quantos estão esgotados', () => {
    const texto = tela().textContent ?? '';
    expect(Array.from(tela().querySelectorAll('.categoria h2')).map((h) => h.textContent)).toEqual([
      'Cervejas',
      'Porções',
    ]);
    expect(texto).toContain('1 esgotado');
    expect(texto).toMatch(/R\$\s12,00/);
    expect(tela().querySelector('.item.esgotado')?.textContent).toContain('Batata Frita');
  });

  it('marcar como esgotado grava na hora', async () => {
    tela().querySelector<HTMLButtonElement>('.disponivel')!.click();
    await fixture.whenStable();

    expect(servico['editarItem']).toHaveBeenCalledWith('i1', { disponivel: false });
    expect(tela().querySelectorAll('.item.esgotado')).toHaveLength(2);
  });

  it('cria um item com o preço lido em reais', async () => {
    botao('+ Item').click();
    await fixture.whenStable();
    await digitar('nome', 'Caipirinha');
    await digitar('categoria', 'Drinks');
    await digitar('preco', '22,50');
    tela().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(servico['criarItem']).toHaveBeenCalledWith({
      nome: 'Caipirinha',
      categoria: 'Drinks',
      preco: 22.5,
      setor: 'bar',
      disponivel: true,
    });
    expect(tela().textContent).toContain('"Caipirinha" entrou no cardápio.');
  });

  it('preço zero ou vazio não salva', async () => {
    botao('+ Item').click();
    await fixture.whenStable();
    await digitar('nome', 'Água');
    await digitar('categoria', 'Bebidas');
    tela().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(servico['criarItem']).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('O preço precisa ser um valor maior que zero');
  });

  it('item já pedido não é apagado: sugere marcar como esgotado', async () => {
    botao('Editar').click();
    await fixture.whenStable();
    botao('Apagar item').click();
    botao('Apagar mesmo').click();
    await fixture.whenStable();

    expect(servico['apagarItem']).toHaveBeenCalledWith('i1');
    expect(tela().textContent).toContain('marque como esgotado');
    expect(tela().querySelector('.painel')).not.toBeNull();
  });
});
