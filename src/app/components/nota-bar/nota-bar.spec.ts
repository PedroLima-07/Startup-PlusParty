import { TestBed } from '@angular/core/testing';
import { NotaBar } from './nota-bar';

describe('NotaBar', () => {
  function montar(media: number | null, total: number): HTMLElement {
    const fixture = TestBed.createComponent(NotaBar);
    fixture.componentRef.setInput('media', media);
    fixture.componentRef.setInput('total', total);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra a média com vírgula e quantas avaliações a formaram', () => {
    const el = montar(4.63, 128);

    expect(el.querySelector('strong')?.textContent).toBe('4,6');
    expect(el.querySelector('.total')?.textContent).toBe('(128 avaliações)');
    expect(el.querySelector('.nota')?.getAttribute('aria-label')).toBe('Nota 4,6 de 5, 128 avaliações');
  });

  it('com menos de 5 avaliações, o bar aparece como novo', () => {
    expect(montar(5, 4).textContent?.trim()).toBe('Novo no +party');
    expect(montar(null, 0).textContent?.trim()).toBe('Novo no +party');
  });
});
