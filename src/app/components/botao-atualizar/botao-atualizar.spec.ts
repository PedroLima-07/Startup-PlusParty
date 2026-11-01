import { TestBed } from '@angular/core/testing';
import { BotaoAtualizar } from './botao-atualizar';

describe('BotaoAtualizar', () => {
  it('avisa quem usa e gira as setas ao tocar', async () => {
    await TestBed.configureTestingModule({ imports: [BotaoAtualizar] }).compileComponents();
    const fixture = TestBed.createComponent(BotaoAtualizar);
    const atualizar = vi.fn();
    fixture.componentInstance.atualizar.subscribe(atualizar);
    fixture.detectChanges();

    const botao = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(botao.textContent).toContain('Atualizar');
    botao.click();
    fixture.detectChanges();

    expect(atualizar).toHaveBeenCalledOnce();
    expect(botao.classList.contains('girando')).toBe(true);
  });
});
