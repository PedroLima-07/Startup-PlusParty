import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardapioService } from '../../services/cardapio.service';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';
import { PedidoService } from '../../services/pedido.service';
import { CardapioPage } from './cardapio';

describe('CardapioPage — erro ao carregar', () => {
  let fixture: ComponentFixture<CardapioPage>;
  let component: CardapioPage;
  let cardapioService: Record<string, ReturnType<typeof vi.fn>>;

  async function estabilizar(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  beforeEach(async () => {
    cardapioService = {
      buscarCardapioDaComanda: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue({ nomeEstabelecimento: "Bar D'Zé", itens: [] }),
      agruparPorCategoria: vi.fn().mockReturnValue({}),
    };

    await TestBed.configureTestingModule({
      imports: [CardapioPage],
      providers: [
        provideRouter([]),
        { provide: CardapioService, useValue: cardapioService },
        { provide: EstabelecimentosService, useValue: {} },
        { provide: PedidoService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CardapioPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'comanda-1');
    await estabilizar();
  });

  it('mostra a tela de erro e carrega ao tentar de novo', async () => {
    const tela = fixture.nativeElement as HTMLElement;
    expect(tela.querySelector('app-erro-carregar')).not.toBeNull();

    await component['carregar']();
    await estabilizar();

    expect(tela.querySelector('app-erro-carregar')).toBeNull();
    expect(tela.querySelector('h1')?.textContent).toContain("Bar D'Zé");
  });
});
