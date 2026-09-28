import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { TipoPerfil } from '../models';
import { AuthService } from '../services/auth.service';
import { SupabaseService } from '../services/supabase.service';
import { gerenteGuard } from './gerente.guard';

describe('gerenteGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SupabaseService, useValue: {} }],
    });
  });

  async function rodarGuard(tipo: TipoPerfil | null): Promise<true | string> {
    vi.spyOn(TestBed.inject(AuthService), 'buscarTipoAtual').mockResolvedValue(tipo);

    const resultado = await TestBed.runInInjectionContext(() =>
      gerenteGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    if (resultado === true) return true;
    return TestBed.inject(Router).serializeUrl(resultado as UrlTree);
  }

  it('deixa o gerente entrar', async () => {
    expect(await rodarGuard('gerente')).toBe(true);
  });

  it('manda o funcionário para a tela do atendente', async () => {
    expect(await rodarGuard('funcionario')).toBe('/atendente/pedidos');
  });

  it('manda o cliente para a home dele', async () => {
    expect(await rodarGuard('cliente')).toBe('/cliente/home');
  });

  it('manda quem não está logado para o login', async () => {
    expect(await rodarGuard(null)).toBe('/login');
  });
});
