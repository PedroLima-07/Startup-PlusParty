import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificacoesService } from '../../services/notificacoes.service';
import { NavCliente } from './nav-cliente';

describe('NavCliente', () => {
  let sair: ReturnType<typeof vi.fn>;

  async function montar(perfil: { nome: string } | null): Promise<HTMLElement> {
    sair = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [NavCliente],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { perfilAtual: async () => perfil, sair } },
        { provide: NotificacoesService, useValue: { naoLidas: () => 0 } },
      ],
    });
    const fixture = TestBed.createComponent(NavCliente);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('o menu leva para Início, Descobrir, Novidades e Notificações', async () => {
    const el = await montar(null);
    const links = Array.from(el.querySelectorAll('.item-nav')).map((a) => [
      a.querySelector('.rotulo')?.textContent,
      a.getAttribute('href'),
    ]);

    expect(links).toEqual([
      ['Início', '/cliente/home'],
      ['Descobrir', '/cliente/discovery'],
      ['Novidades', '/cliente/novidades'],
      ['Notificações', '/cliente/notificacoes'],
    ]);
  });

  it('logado, mostra o primeiro nome e o botão de sair, que leva ao login', async () => {
    const el = await montar({ nome: 'Pedro Lima' });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    expect(el.querySelector('.conta strong')?.textContent).toBe('Pedro');
    el.querySelector<HTMLButtonElement>('.conta-sair')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(sair).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith('/login');
  });

  it('sem login, oferece entrar', async () => {
    const el = await montar(null);

    expect(el.querySelector('.conta-entrar')?.getAttribute('href')).toBe('/login');
  });
});
