import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { MovimentoService } from '../../../services/movimento.service';
import { SupabaseService } from '../../../services/supabase.service';
import { Movimento } from './movimento';

registerLocaleData(localePt);

describe('Movimento (gerente)', () => {
  let fixture: ComponentFixture<Movimento>;
  let movimento: MovimentoService;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(texto: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(texto),
    )!;
  }

  function comandasNaTela(): string[] {
    return Array.from(tela().querySelectorAll('.comanda-numero')).map((e) => e.textContent ?? '');
  }

  function buscar(termo: string): void {
    const campo = tela().querySelector<HTMLInputElement>('input[type=search]')!;
    campo.value = termo;
    campo.dispatchEvent(new Event('input'));
  }

  beforeEach(async () => {
    // jsdom não implementa a rolagem; a tela só precisa conseguir chamá-la.
    Element.prototype.scrollIntoView = vi.fn();

    await TestBed.configureTestingModule({
      imports: [Movimento],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: AuthService,
          useValue: { buscarNomeEstabelecimentoAtual: () => Promise.resolve("Bar D'Zé") },
        },
        { provide: SupabaseService, useValue: { escutarMudancas: () => () => undefined } },
      ],
    }).compileComponents();

    movimento = TestBed.inject(MovimentoService);
    // Os números vêm do banco; aqui a tela usa os definidos abaixo.
    vi.spyOn(movimento, 'atualizar').mockResolvedValue();
    movimento.faturamento.set(4820);
    movimento.comandas.set([
      { numero: '01', cliente: 'Rafael Menezes', mesa: '02', horario: '22:40', valor: 109.6, status: 'aberta' },
      { numero: '04', cliente: 'Carlos Souza', mesa: 'Balcão', horario: '21:20', valor: 139.7, status: 'aberta' },
      { numero: '07', cliente: 'Carlos Souza', mesa: '12', horario: '21:10', valor: 142, status: 'aguardando_pagamento' },
      { numero: '05', cliente: 'Marina Duarte', mesa: '06', horario: '20:55', valor: 96.5, status: 'paga' },
    ]);
    movimento.alertas.set([
      { id: 'a1', tipo: 'pagamento', titulo: 'Comanda sem pagamento há 25 min', detalhe: 'Comanda 07', comanda: '07' },
      { id: 'a3', tipo: 'liberacao', titulo: 'Comanda aguardando liberação há 6 min', detalhe: 'Mesa 04', comanda: null },
    ]);

    fixture = TestBed.createComponent(Movimento);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('cumprimenta pelo nome do bar do gerente', () => {
    expect(tela().querySelector('h1')?.textContent).toContain("Olá, Bar D'Zé");
  });

  it('mostra todas as comandas do dia e quantos alertas há', () => {
    expect(comandasNaTela()).toHaveLength(4);
    expect(tela().querySelector('.atencao .contador')?.textContent).toContain('2');
  });

  it('filtra as comandas pela situação', () => {
    botao('Pagas').click();
    expect(comandasNaTela()).toEqual(['Comanda 05']);

    botao('Aguardando pagamento').click();
    expect(comandasNaTela()).toEqual(['Comanda 07']);
  });

  it('busca por cliente, por mesa e por número da comanda', () => {
    buscar('carlos');
    expect(comandasNaTela()).toEqual(['Comanda 04', 'Comanda 07']);

    buscar('balcão');
    expect(comandasNaTela()).toEqual(['Comanda 04']);

    buscar('mesa 12');
    expect(comandasNaTela()).toEqual(['Comanda 07']);

    buscar('01');
    expect(comandasNaTela()).toEqual(['Comanda 01']);
  });

  it('avisa quando a busca não encontra nenhuma comanda', () => {
    buscar('ninguém');

    expect(tela().textContent).toContain('Nenhuma comanda encontrada.');
  });

  it('o botão do alerta de pagamento leva até a comanda na lista', () => {
    botao('Pagas').click();

    botao('Ver detalhes').click();

    expect(comandasNaTela()).toEqual(['Comanda 07']);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('avisar o atendente troca o botão daquele alerta por uma confirmação', () => {
    botao('Avisar atendente').click();

    expect(tela().textContent).toContain('Atendente avisado');
    expect(botao('Avisar atendente')).toBeUndefined();
    expect(botao('Ver detalhes')).toBeDefined();
  });

  it('o olho esconde e volta a mostrar os valores do faturamento', () => {
    const olho = tela().querySelector<HTMLButtonElement>('.olho')!;
    const total = () => tela().querySelector('.total')?.textContent?.trim();

    expect(total()).toContain('4.820,00');

    olho.click();
    expect(total()).toBe('R$ ••••');
    expect(tela().querySelector('.progresso')).toBeNull();

    olho.click();
    expect(total()).toContain('4.820,00');
  });

  it('sem alertas, diz que está tudo em ordem', () => {
    movimento.alertas.set([]);

    expect(tela().textContent).toContain('Tudo em ordem');
    expect(tela().querySelector('.atencao .contador')).toBeNull();
  });
});
