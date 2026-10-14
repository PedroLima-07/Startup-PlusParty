import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ComandaService } from '../../services/comanda.service';
import { SupabaseService } from '../../services/supabase.service';
import { ComandaPage } from './comanda';

const COMANDA = {
  id: 'comanda-1',
  status: 'aberta',
  mesa: '12',
  estabelecimento: { nome: "Bar D'Zé" },
};

const ITENS = [
  { id: 'i1', quantidade: 2, preco_unitario: 12, status: 'novo', item: { nome: 'Chope' } },
];

describe('ComandaPage — tratamento de erro', () => {
  let fixture: ComponentFixture<ComandaPage>;
  let component: ComandaPage;
  let comandaService: Record<string, ReturnType<typeof vi.fn>>;

  async function criar(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ComandaPage],
      providers: [
        provideRouter([]),
        { provide: ComandaService, useValue: comandaService },
        { provide: SupabaseService, useValue: { escutarMudancas: vi.fn(() => () => {}) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ComandaPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'comanda-1');
    await estabilizar();
  }

  async function estabilizar(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const tela = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    comandaService = {
      buscarComanda: vi.fn().mockResolvedValue(COMANDA),
      buscarItensPedidos: vi.fn().mockResolvedValue(ITENS),
      fecharConta: vi.fn().mockResolvedValue(undefined),
      cancelarSolicitacao: vi.fn(),
      calcularTotal: vi.fn().mockReturnValue(24),
    };
  });

  it('mostra a tela de erro quando a comanda não carrega, e recupera ao tentar de novo', async () => {
    comandaService['buscarComanda'].mockRejectedValueOnce(new Error('offline'));
    await criar();

    expect(component['erroCarregar']()).toBe(true);
    expect(tela().querySelector('app-erro-carregar')).not.toBeNull();

    await component['tentarDeNovo']();
    await estabilizar();

    expect(tela().querySelector('app-erro-carregar')).toBeNull();
    expect(tela().textContent).toContain("Bar D'Zé");
  });

  it('com a comanda na tela, falha ao atualizar vira aviso e mantém o que já estava', async () => {
    await criar();
    comandaService['buscarItensPedidos'].mockRejectedValueOnce(new Error('offline'));

    await component['atualizarStatus']();
    await estabilizar();

    expect(tela().querySelector('app-erro-carregar')).toBeNull();
    expect(component['avisoAtualizacao']()).toContain('Não foi possível atualizar');
    expect(component['itens']()).toEqual(ITENS);
  });

  it('avisa quando fechar a conta falha e mantém a pergunta aberta', async () => {
    await criar();
    comandaService['fecharConta'].mockRejectedValueOnce(new Error('offline'));
    component['abrirConfirmacaoRecebimento']();

    await component['confirmarFechamento']();

    expect(component['erroFechamento']()).toContain('Não foi possível fechar a conta');
    expect(component['confirmandoRecebimento']()).toBe(true);
    expect(component['fechando']()).toBe(false);
  });

  it('não envia o fechamento duas vezes se clicarem seguido', async () => {
    await criar();
    let terminar!: () => void;
    comandaService['fecharConta'].mockReturnValueOnce(new Promise<void>((r) => (terminar = r)));

    const primeiro = component['confirmarFechamento']();
    await component['confirmarFechamento']();
    terminar();
    await primeiro;

    expect(comandaService['fecharConta']).toHaveBeenCalledTimes(1);
  });
});
