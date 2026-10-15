import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ComandasAtendenteService } from '../../services/comandas-atendente.service';
import { SupabaseService } from '../../services/supabase.service';
import { NavAtendente } from './nav-atendente';

describe('NavAtendente', () => {
  let fixture: ComponentFixture<NavAtendente>;
  let pendencias: WritableSignal<number>;
  let atualizarPendencias: ReturnType<typeof vi.fn>;
  let escutarMudancas: ReturnType<typeof vi.fn>;
  let perfilAtual: ReturnType<typeof vi.fn>;
  let avisarMudanca: () => void;

  function nav(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function criar(acompanhar = true): Promise<void> {
    fixture = TestBed.createComponent(NavAtendente);
    fixture.componentRef.setInput('acompanhar', acompanhar);
    fixture.detectChanges();
    // Deixa a contagem inicial (perfil + consulta simulados) terminar.
    await new Promise((resolve) => setTimeout(resolve));
  }

  beforeEach(() => {
    pendencias = signal(0);
    atualizarPendencias = vi.fn().mockResolvedValue(undefined);
    perfilAtual = vi.fn().mockResolvedValue({ estabelecimento: { id: 'bar1', nome: 'Bar' } });
    escutarMudancas = vi.fn((_tabelas: unknown, aoMudar: () => void) => {
      avisarMudanca = aoMudar;
      return () => {};
    });

    TestBed.configureTestingModule({
      imports: [NavAtendente],
      providers: [
        provideRouter([]),
        { provide: ComandasAtendenteService, useValue: { pendencias, atualizarPendencias } },
        { provide: AuthService, useValue: { perfilAtual } },
        { provide: SupabaseService, useValue: { escutarMudancas } },
      ],
    });
  });

  it('tem as duas abas do atendente', async () => {
    await criar();
    const links = Array.from(nav().querySelectorAll('a')).map((a) => a.getAttribute('href'));

    expect(links).toEqual(['/atendente/pedidos', '/atendente/comandas']);
  });

  it('só mostra o contador quando há pendências', async () => {
    await criar();
    expect(nav().querySelector('.contador')).toBeNull();

    pendencias.set(4);
    expect(nav().querySelector('.contador')!.textContent).toContain('4');

    pendencias.set(0);
    expect(nav().querySelector('.contador')).toBeNull();
  });

  it('o contador fica no ícone da aba Comandas', async () => {
    pendencias.set(1);
    await criar();
    const [pedidos, comandas] = Array.from(nav().querySelectorAll('a'));

    expect(pedidos.querySelector('.contador')).toBeNull();
    expect(comandas.querySelector('.icone .contador')).not.toBeNull();
    expect(comandas.textContent).toContain('1 pendência');
  });

  it('busca a contagem do bar do atendente e refaz quando uma comanda muda', async () => {
    await criar();

    expect(escutarMudancas).toHaveBeenCalledWith([{ tabela: 'comandas' }], expect.any(Function));
    expect(atualizarPendencias).toHaveBeenCalledWith('bar1');

    avisarMudanca();
    await new Promise((resolve) => setTimeout(resolve));

    expect(atualizarPendencias).toHaveBeenCalledTimes(2);
  });

  it('não consulta nada quando a tela já mantém a contagem', async () => {
    await criar(false);

    expect(escutarMudancas).not.toHaveBeenCalled();
    expect(atualizarPendencias).not.toHaveBeenCalled();
  });

  it('segue funcionando se a contagem falhar', async () => {
    atualizarPendencias.mockRejectedValue(new Error('rede'));

    await criar();

    expect(nav().querySelectorAll('a')).toHaveLength(2);
  });
});
