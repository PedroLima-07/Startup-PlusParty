import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { ComandaDetalhada, StatusComanda } from '../../models';
import { ComandaService } from '../../services/comanda.service';
import { SupabaseService } from '../../services/supabase.service';
import { ComandaPage } from './comanda';

registerLocaleData(localePt);

function comanda(status: StatusComanda): ComandaDetalhada {
  return {
    id: 'c1',
    usuario_id: 'u1',
    estabelecimento_id: 'bar1',
    mesa: '12',
    status,
    criada_em: '2026-09-25T22:00:00Z',
    fechada_em: null,
    estabelecimento: { nome: 'Bar do Zé' },
  };
}

describe('ComandaPage', () => {
  let fixture: ComponentFixture<ComandaPage>;
  let buscarComanda: ReturnType<typeof vi.fn>;
  let avisarMudanca: () => void;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function assentar(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  async function abrirCom(status: StatusComanda): Promise<void> {
    buscarComanda = vi.fn().mockResolvedValue(comanda(status));

    await TestBed.configureTestingModule({
      imports: [ComandaPage],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: ComandaService,
          useValue: {
            buscarComanda,
            buscarItensPedidos: vi.fn().mockResolvedValue([]),
            calcularTotal: () => 0,
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            escutarMudancas: vi.fn((_tabelas: unknown, aoMudar: () => void) => {
              avisarMudanca = aoMudar;
              return () => {};
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ComandaPage);
    fixture.componentRef.setInput('id', 'c1');
    fixture.detectChanges();
    await assentar();
  }

  it('comanda recusada: explica o que houve e deixa abrir outra no mesmo bar', async () => {
    await abrirCom('recusada');
    const texto = tela().textContent!;
    const abrirDeNovo = Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Abrir comanda de novo'),
    )!;

    expect(texto).toContain('Solicitação recusada');
    expect(texto).toContain('Bar do Zé');
    expect(texto).not.toContain('Fazer pedido');
    expect(texto).not.toContain('Passe no caixa');

    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    abrirDeNovo.click();

    expect(router.serializeUrl(navegar.mock.calls[0][0] as UrlTree)).toBe(
      '/cliente/abrir-comanda/bar1',
    );
  });

  it('quem estava esperando vê a recusa assim que o atendente recusa', async () => {
    await abrirCom('aguardando_liberacao');
    expect(tela().textContent).toContain('Aguardando liberação');

    buscarComanda.mockResolvedValue(comanda('recusada'));
    avisarMudanca();
    await assentar();

    expect(tela().textContent).toContain('Solicitação recusada');
    expect(tela().textContent).not.toContain('Cancelar solicitação');
  });

  it('comanda liberada continua mostrando a tela de pedidos', async () => {
    await abrirCom('aberta');

    expect(tela().textContent).toContain('Fazer pedido');
    expect(tela().textContent).not.toContain('Solicitação recusada');
  });
});
