import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LegalPage } from './legal';

describe('LegalPage', () => {
  function montar(documento: 'privacidade' | 'termos'): HTMLElement {
    TestBed.configureTestingModule({ imports: [LegalPage], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(LegalPage);
    fixture.componentRef.setInput('documento', documento);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('a política diz o que é coletado, com quem é compartilhado e que não usa cookies', () => {
    const texto = montar('privacidade').textContent ?? '';
    expect(texto).toContain('Política de Privacidade');
    expect(texto).toContain('Conta não paga');
    expect(texto).toContain('Supabase');
    expect(texto).toContain('não usa cookies');
    expect(texto).toContain('art. 18 da LGPD');
    expect(texto).toContain('technomind.pp@gmail.com');
  });

  it('os termos linkam a política', () => {
    const el = montar('termos');
    expect(el.querySelector('h1')?.textContent).toBe('Termos de Uso');
    expect(el.querySelector('a[href="/privacidade"]')).not.toBeNull();
  });
});
