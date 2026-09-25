import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { TipoPerfil } from '../models';
import { AuthService } from '../services/auth.service';
import { SupabaseService } from '../services/supabase.service';
import { semSessaoGuard } from './sem-sessao.guard';

describe('semSessaoGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SupabaseService, useValue: {} }],
    });
  });

  async function rodarGuard(tipo: TipoPerfil | null): Promise<true | string> {
    vi.spyOn(TestBed.inject(AuthService), 'buscarTipoAtual').mockResolvedValue(tipo);

    const resultado = await TestBed.runInInjectionContext(() =>
      semSessaoGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    if (resultado === true) return true;
    return TestBed.inject(Router).serializeUrl(resultado as UrlTree);
  }

  it('deixa quem não está logado ver a tela de login', async () => {
    expect(await rodarGuard(null)).toBe(true);
  });

  it('manda o cliente logado para a home dele', async () => {
    expect(await rodarGuard('cliente')).toBe('/cliente/home');
  });

  it('manda funcionário e gerente logados para a tela do atendente', async () => {
    expect(await rodarGuard('funcionario')).toBe('/atendente/pedidos');
    expect(await rodarGuard('gerente')).toBe('/atendente/pedidos');
  });
});
