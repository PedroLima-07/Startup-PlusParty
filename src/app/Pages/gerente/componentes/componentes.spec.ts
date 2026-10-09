import { TestBed } from '@angular/core/testing';
import { GraficoHoras } from './grafico-horas';
import { MaisVendidos } from './mais-vendidos';
import { TempoPreparo } from './tempo-preparo';

function texto(elemento: HTMLElement): string {
  return (elemento.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('TempoPreparo', () => {
  function criar(bar: number | null, cozinha: number | null): HTMLElement {
    const fixture = TestBed.createComponent(TempoPreparo);
    fixture.componentRef.setInput('bar', bar);
    fixture.componentRef.setInput('cozinha', cozinha);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('destaca a cozinha quando ela é bem mais lenta e diz quantas vezes', () => {
    const tela = criar(4, 23);

    expect(tela.querySelector('.lento')?.textContent).toContain('Cozinha');
    expect(texto(tela)).toContain('A cozinha está levando quase 6 vezes mais tempo que o bar.');
  });

  it('destaca o bar quando o mais lento é ele', () => {
    const tela = criar(12, 4);

    expect(tela.querySelector('.lento')?.textContent).toContain('Bar');
    expect(texto(tela)).toContain('O bar está levando 3 vezes mais tempo que a cozinha.');
  });

  it('não destaca ninguém quando os tempos são parecidos', () => {
    const tela = criar(8, 10);

    expect(tela.querySelector('.lento')).toBeNull();
    expect(texto(tela)).toContain('tempos de preparo parecidos');
  });

  it('sem medição de um dos setores, não compara', () => {
    expect(criar(0, 10).querySelector('.lento')).toBeNull();
  });

  it('enquanto o sistema não mede o preparo, avisa em vez de mostrar zero', () => {
    const tela = criar(null, null);

    expect(tela.querySelector('.setores')).toBeNull();
    expect(texto(tela)).toContain('ainda não é registrado');
  });
});

describe('GraficoHoras', () => {
  function criar(dados: { hora: string; comandas: number }[]): HTMLElement {
    const fixture = TestBed.createComponent(GraficoHoras);
    fixture.componentRef.setInput('dados', dados);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('destaca a hora de pico e a descreve', () => {
    const tela = criar([
      { hora: '22h', comandas: 31 },
      { hora: '23h', comandas: 38 },
      { hora: '0h', comandas: 34 },
    ]);

    expect(tela.querySelectorAll('li')).toHaveLength(3);
    expect(tela.querySelector('.pico .hora')?.textContent).toBe('23h');
    expect(texto(tela)).toContain('Seu pico foi às 23h, com 38 comandas abertas ao mesmo tempo.');
  });

  it('sem nenhuma comanda, avisa em vez de desenhar barras vazias', () => {
    const tela = criar([{ hora: '19h', comandas: 0 }]);

    expect(tela.querySelector('li')).toBeNull();
    expect(texto(tela)).toContain('Ainda não há movimento registrado hoje.');
  });
});

describe('MaisVendidos', () => {
  function criar(itens: { nome: string; quantidade: number }[]): HTMLElement {
    const fixture = TestBed.createComponent(MaisVendidos);
    fixture.componentRef.setInput('itens', itens);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('numera os itens e faz a barra proporcional ao primeiro', () => {
    const tela = criar([
      { nome: 'Chope', quantidade: 80 },
      { nome: 'Caipirinha', quantidade: 40 },
    ]);
    const barras = Array.from(tela.querySelectorAll<HTMLElement>('.trilho span'));

    expect(Array.from(tela.querySelectorAll('.posicao')).map((e) => e.textContent)).toEqual(['1', '2']);
    expect(barras.map((barra) => barra.style.width)).toEqual(['100%', '50%']);
  });

  it('sem itens, avisa que nada foi pedido', () => {
    expect(texto(criar([]))).toContain('Nenhum item pedido ainda.');
  });
});
