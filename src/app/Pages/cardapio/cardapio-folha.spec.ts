import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';
import { PedidoService } from '../../services/pedido.service';
import { CardapioPage } from './cardapio';

const CHOPE = { id: 'i1', nome: 'Chope', preco: 12, categoria: 'Cervejas' };

describe('CardapioPage — folha "Seu pedido" no celular', () => {
  let fixture: ComponentFixture<CardapioPage>;
  let criarPedido: ReturnType<typeof vi.fn>;

  const tela = () => fixture.nativeElement as HTMLElement;
  const botao = (texto: string) =>
    Array.from(tela().querySelectorAll('button')).find((b) => b.textContent?.includes(texto))!;

  async function estabilizar(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  beforeEach(async () => {
    criarPedido = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [CardapioPage],
      providers: [
        provideRouter([]),
        {
          provide: CardapioService,
          useValue: {
            buscarCardapioDaComanda: vi.fn().mockResolvedValue({ nomeEstabelecimento: "Bar D'Zé", itens: [CHOPE] }),
            agruparPorCategoria: vi.fn().mockReturnValue({ Cervejas: [CHOPE] }),
          },
        },
        { provide: EstabelecimentosService, useValue: {} },
        { provide: PedidoService, useValue: { criarPedido } },
      ],
    }).compileComponents();

    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(CardapioPage);
    fixture.componentRef.setInput('id', 'comanda-1');
    await estabilizar();
  });

  it('sem itens, não dá para abrir o pedido', () => {
    expect(botao('Escolha os itens').disabled).toBe(true);
    expect(tela().querySelector('.folha-pedido')).toBeNull();
  });

  it('mostra os itens e o total antes de confirmar, e só envia na confirmação', async () => {
    botao('+').click();
    botao('+').click();
    await estabilizar();

    const verPedido = botao('Ver pedido');
    expect(verPedido.textContent).toContain('2 itens');
    verPedido.click();
    await estabilizar();

    const folha = tela().querySelector('.folha-pedido')!;
    expect(folha.textContent).toContain('Chope');
    expect(folha.textContent).toContain('24');
    expect(criarPedido).not.toHaveBeenCalled();

    Array.from(folha.querySelectorAll('button')).find((b) => b.textContent?.includes('Confirmar pedido'))!.click();
    await estabilizar();

    expect(criarPedido).toHaveBeenCalledTimes(1);
  });

  it('tirar o último item pela folha fecha a folha', async () => {
    botao('+').click();
    await estabilizar();
    botao('Ver pedido').click();
    await estabilizar();

    tela().querySelector<HTMLButtonElement>('.folha-pedido .botao-stepper')!.click();
    await estabilizar();

    expect(tela().querySelector('.folha-pedido')).toBeNull();
  });
});
