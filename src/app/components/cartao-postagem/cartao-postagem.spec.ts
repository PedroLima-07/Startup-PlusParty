import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Postagem } from '../../models';
import { CartaoPostagem } from './cartao-postagem';

registerLocaleData(localePt);

const BAR = { id: 'b1', nome: "Bar D'Zé", foto_url: null };

function postagem(parcial: Partial<Postagem> = {}): Postagem {
  return {
    id: 'p1',
    estabelecimento_id: 'b1',
    tipo: 'bebida',
    titulo: 'Happy hour: chope a R$ 9',
    texto: 'Todo dia até as 20h.',
    imagem_url: null,
    preco: 9,
    preco_antigo: 12,
    valida_ate: null,
    criada_em: new Date(Date.now() - 40 * 60_000).toISOString(),
    ...parcial,
  };
}

describe('CartaoPostagem', () => {
  let fixture: ComponentFixture<CartaoPostagem>;

  function montar(p: Postagem, comBar = true): HTMLElement {
    fixture = TestBed.createComponent(CartaoPostagem);
    fixture.componentRef.setInput('postagem', p);
    if (comBar) fixture.componentRef.setInput('bar', BAR);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function texto(el: HTMLElement): string {
    return (el.textContent ?? '').replace(/\s+/g, ' ');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartaoPostagem],
      providers: [provideRouter([]), { provide: LOCALE_ID, useValue: 'pt-BR' }],
    }).compileComponents();
  });

  it('promoção mostra o desconto, o preço novo e o antigo riscado, e leva ao cardápio', () => {
    const el = montar(postagem());

    expect(el.querySelector('.selo-desconto')?.textContent?.trim()).toBe('-25%');
    expect(el.querySelector('.etiqueta')).toBeNull();
    expect(el.querySelector('.precos strong')?.textContent).toContain('9,00');
    expect(el.querySelector('.precos s')?.textContent).toContain('12,00');
    expect(texto(el)).toContain("Bar D'Zé");
    expect(texto(el)).toContain('há 40 min');
    expect(el.querySelector('.acao')?.getAttribute('href')).toBe('/cliente/estabelecimento/b1/cardapio');
  });

  it('evento não tem preço e leva ao perfil do bar', () => {
    const el = montar(postagem({ tipo: 'evento', preco: null, preco_antigo: null }));

    expect(el.querySelector('.precos')).toBeNull();
    expect(el.querySelector('.selo-desconto')).toBeNull();
    expect(el.querySelector('.acao')?.getAttribute('href')).toBe('/cliente/estabelecimento/b1');
  });

  it('sem foto, desenha o emoji do tipo; com foto, mostra a foto', () => {
    expect(montar(postagem({ tipo: 'comida' })).querySelector('.arte')?.textContent).toBe('🍔');
    expect(
      montar(postagem({ imagem_url: 'img/estabelecimentos/bar-dze.jpg' })).querySelector('.midia img')?.getAttribute('src'),
    ).toBe('img/estabelecimentos/bar-dze.jpg');
  });

  it('na prévia do gerente, mostra a etiqueta, até quando vale e "Encerrada" depois do prazo', () => {
    const amanha = new Date(Date.now() + 48 * 3_600_000);
    const dia = `${String(amanha.getDate()).padStart(2, '0')}/${String(amanha.getMonth() + 1).padStart(2, '0')}`;

    const previa = montar(postagem({ valida_ate: amanha.toISOString() }), false);
    expect(previa.querySelector('.etiqueta')?.textContent).toBe('Promoção · Bebida');
    expect(previa.querySelector('.validade')?.textContent).toBe(`Até ${dia}`);
    expect(
      montar(postagem({ valida_ate: new Date(Date.now() - 60_000).toISOString() }), false).querySelector('.validade')
        ?.textContent,
    ).toBe('Encerrada');
  });

  it('nas Novidades, a validade só aparece quando termina hoje', () => {
    const daquiA3Horas = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const daquiA3Dias = new Date(Date.now() + 72 * 3_600_000).toISOString();

    expect(montar(postagem({ valida_ate: daquiA3Horas })).querySelector('.termina-hoje')?.textContent).toBe(
      'Termina hoje',
    );
    expect(montar(postagem({ valida_ate: daquiA3Dias })).querySelector('.termina-hoje')).toBeNull();
    expect(montar(postagem({ valida_ate: daquiA3Dias })).querySelector('.validade')).toBeNull();
  });

  it('sem o bar (prévia do gerente), não tem botão para o cliente e mostra quando foi publicada', () => {
    const el = montar(postagem(), false);

    expect(el.querySelector('.acao')).toBeNull();
    expect(el.querySelector('.topo')).toBeNull();
    expect(texto(el)).toContain('Publicada há 40 min');
  });
});
