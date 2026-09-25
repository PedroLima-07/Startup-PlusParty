import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Estabelecimento } from '../../../models';
import { ComandaEmOutroLugarError, ComandaService } from '../../../services/comanda.service';
import { EstabelecimentosService } from '../../../services/estabelecimentos.service';
import { AbrirComandaLocalComponent } from './local';

const BAR: Estabelecimento = {
  id: 'bar-1',
  nome: "Bar D'Zé",
  descricao: null,
  endereco: null,
  capacidade: 100,
  avaliacao: 4.5,
  criado_em: '2026-01-01',
};

describe('AbrirComandaLocalComponent', () => {
  let fixture: ComponentFixture<AbrirComandaLocalComponent>;
  let component: AbrirComandaLocalComponent;
  let comandaService: { abrirComanda: ReturnType<typeof vi.fn> };
  let estabelecimentosService: { buscarPorId: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    comandaService = { abrirComanda: vi.fn().mockResolvedValue({ id: 'comanda-1' }) };
    estabelecimentosService = { buscarPorId: vi.fn().mockResolvedValue(BAR) };

    await TestBed.configureTestingModule({
      imports: [AbrirComandaLocalComponent],
      providers: [
        provideRouter([]),
        { provide: ComandaService, useValue: comandaService },
        { provide: EstabelecimentosService, useValue: estabelecimentosService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(AbrirComandaLocalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'bar-1');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('carrega o estabelecimento pelo id da rota', () => {
    expect(estabelecimentosService.buscarPorId).toHaveBeenCalledWith('bar-1');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain(
      "Bar D'Zé",
    );
  });

  it('não permite abrir comanda sem escolher mesa ou balcão', () => {
    expect(component.podeAbrirComanda()).toBe(false);
  });

  it('exige número da mesa quando o local é mesa', () => {
    component.selecionarLocal('mesa');
    expect(component.podeAbrirComanda()).toBe(false);

    component.numeroMesa = '   ';
    expect(component.podeAbrirComanda()).toBe(false);

    component.numeroMesa = '12';
    expect(component.podeAbrirComanda()).toBe(true);
  });

  it('permite abrir no balcão sem número e limpa a mesa digitada antes', () => {
    component.selecionarLocal('mesa');
    component.numeroMesa = '12';
    component.selecionarLocal('balcao');

    expect(component.numeroMesa).toBe('');
    expect(component.podeAbrirComanda()).toBe(true);
  });

  it('abre comanda na mesa e navega para a comanda criada', async () => {
    component.selecionarLocal('mesa');
    component.numeroMesa = ' 12 ';

    await component.abrirComanda();

    expect(comandaService.abrirComanda).toHaveBeenCalledWith('bar-1', '12');
    expect(router.navigate).toHaveBeenCalledWith(['/cliente/comanda', 'comanda-1']);
  });

  it('abre comanda no balcão enviando mesa nula', async () => {
    component.selecionarLocal('balcao');

    await component.abrirComanda();

    expect(comandaService.abrirComanda).toHaveBeenCalledWith('bar-1', null);
  });

  it('mostra mensagem e libera o botão quando abrir comanda falha', async () => {
    comandaService.abrirComanda.mockRejectedValueOnce(new Error('RLS'));
    component.selecionarLocal('balcao');

    await component.abrirComanda();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component['mensagem']()).toContain('Não foi possível abrir a comanda');
    expect(component.podeAbrirComanda()).toBe(true);
  });

  it('explica quando o cliente já tem comanda aberta em outro bar', async () => {
    comandaService.abrirComanda.mockRejectedValueOnce(new ComandaEmOutroLugarError('Neon Club'));
    component.selecionarLocal('balcao');

    await component.abrirComanda();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component['mensagem']()).toBe(
      'Você já tem uma comanda aberta no Neon Club. Pague ela antes de abrir outra.',
    );
  });
});
