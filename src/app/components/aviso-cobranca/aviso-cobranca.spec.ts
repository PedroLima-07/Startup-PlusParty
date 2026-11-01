import { TestBed } from '@angular/core/testing';
import { AvisoCobranca } from './aviso-cobranca';

describe('AvisoCobranca', () => {
  async function abrir(comandaId: string) {
    const fixture = TestBed.createComponent(AvisoCobranca);
    fixture.componentRef.setInput('comandaId', comandaId);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const dialogo = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.querySelector('dialog');

  beforeEach(() => localStorage.clear());

  it('explica a regra sem falar só de quem recebe na mesa e aponta a lei', async () => {
    const fixture = await abrir('c1');

    expect(dialogo(fixture)?.textContent).toContain('Você só paga o que receber');
    expect(dialogo(fixture)?.textContent).toContain('sem ter recebido algum item');
    expect(dialogo(fixture)?.querySelector('a')?.href).toContain('planalto.gov.br');
  });

  it('depois de Entendi não aparece de novo na mesma comanda', async () => {
    const fixture = await abrir('c1');
    dialogo(fixture)?.querySelector('button')?.click();
    fixture.detectChanges();
    expect(dialogo(fixture)).toBeNull();

    expect(dialogo(await abrir('c1'))).toBeNull();
  });

  it('aparece de novo em outra comanda', async () => {
    const fixture = await abrir('c1');
    dialogo(fixture)?.querySelector('button')?.click();

    expect(dialogo(await abrir('c2'))).not.toBeNull();
  });
});
