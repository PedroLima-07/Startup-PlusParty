import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { EquipeService } from '../services/equipe.service';
import { semSessaoGuard } from './sem-sessao.guard';

describe('semSessaoGuard', () => {
  let telaInicial: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    telaInicial = vi.fn();

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: EquipeService, useValue: { telaInicial } }],
    });
  });

  async function rodarGuard(): Promise<true | string> {
    const resultado = await TestBed.runInInjectionContext(() =>
      semSessaoGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    if (resultado === true) return true;
    return TestBed.inject(Router).serializeUrl(resultado as UrlTree);
  }

  it('deixa quem não está logado ver a tela de login', async () => {
    telaInicial.mockResolvedValue(null);

    expect(await rodarGuard()).toBe(true);
  });

  it('manda quem já está logado para a tela inicial dele', async () => {
    telaInicial.mockResolvedValue('/atendente/pedidos');

    expect(await rodarGuard()).toBe('/atendente/pedidos');
  });

  it('mostra o login se não der para descobrir a tela inicial', async () => {
    telaInicial.mockRejectedValue(new Error('sem rede'));

    expect(await rodarGuard()).toBe(true);
  });
});
