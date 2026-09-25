import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ComandaPendente } from '../../models';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { ComandasAtendenteService } from '../../services/comandas-atendente.service';
import { AtendenteComandas } from './atendente-comandas';

function comanda(dados: Partial<ComandaPendente> & Pick<ComandaPendente, 'id'>): ComandaPendente {
  return {
    status: 'aguardando_liberacao',
    mesa: '12',
    cliente: 'Carlos',
    criada_em: '2026-09-25T22:00:00Z',
    total: 0,
    ...dados,
  };
}

registerLocaleData(localePt);

describe('AtendenteComandas', () => {
  let fixture: ComponentFixture<AtendenteComandas>;
  let service: {
    listarPendentes: ReturnType<typeof vi.fn>;
    liberar: ReturnType<typeof vi.fn>;
    confirmarPagamento: ReturnType<typeof vi.fn>;
  };
  let authService: { sair: ReturnType<typeof vi.fn> };

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(texto: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.includes(texto),
    )!;
  }

  let supabase: { escutarMudancas: ReturnType<typeof vi.fn> };
  let avisarMudanca: () => void;

  beforeEach(async () => {
    supabase = {
      escutarMudancas: vi.fn((_tabelas: unknown, aoMudar: () => void) => {
        avisarMudanca = aoMudar;
        return () => {};
      }),
    };
    service = {
      listarPendentes: vi.fn().mockResolvedValue([
        comanda({ id: 'c1', mesa: '12', cliente: 'Carlos' }),
        comanda({ id: 'c2', status: 'aguardando_pagamento', mesa: null, cliente: 'Mariana', total: 58 }),
      ]),
      liberar: vi.fn().mockResolvedValue(undefined),
      confirmarPagamento: vi.fn().mockResolvedValue(undefined),
    };
    authService = { sair: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [AtendenteComandas],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: ComandasAtendenteService, useValue: service },
        { provide: AuthService, useValue: authService },
        { provide: SupabaseService, useValue: supabase },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AtendenteComandas);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('separa as comandas entre liberação e pagamento', () => {
    const [liberacao, pagamento] = Array.from(tela().querySelectorAll('section'));

    expect(liberacao.textContent).toContain('Mesa 12');
    expect(liberacao.textContent).toContain('Carlos');
    expect(pagamento.textContent).toContain('Balcão');
    expect(pagamento.textContent).toContain('Mariana');
    expect(pagamento.textContent).toContain('58,00');
  });

  it('libera a entrada e tira a comanda da lista', async () => {
    botao('Liberar entrada').click();
    await fixture.whenStable();

    expect(service.liberar).toHaveBeenCalledWith('c1');
    expect(tela().textContent).toContain('Ninguém esperando liberação');
  });

  it('pede confirmação antes de encerrar a conta', async () => {
    botao('Confirmar pagamento').click();
    expect(tela().textContent).toContain('Confirmar pagamento de R$');
    expect(service.confirmarPagamento).not.toHaveBeenCalled();

    tela().querySelector<HTMLButtonElement>('.modal-content .btn-confirmar')!.click();
    await fixture.whenStable();

    expect(service.confirmarPagamento).toHaveBeenCalledWith('c2');
    expect(tela().textContent).toContain('Nenhuma conta esperando pagamento');
    expect(tela().querySelector('.modal-overlay')).toBeNull();
  });

  it('cancelar a confirmação não encerra a conta', () => {
    botao('Confirmar pagamento').click();
    botao('Cancelar').click();

    expect(service.confirmarPagamento).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Mariana');
  });

  it('mantém a comanda e mostra erro quando a ação falha', async () => {
    service.liberar.mockRejectedValueOnce(new Error('trigger'));

    botao('Liberar entrada').click();
    await fixture.whenStable();

    expect(tela().textContent).toContain('Carlos');
    expect(tela().textContent).toContain('Não foi possível atualizar a comanda');
  });

  it('sai da conta e volta para o login', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    botao('Sair').click();
    await fixture.whenStable();

    expect(authService.sair).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('recarrega sozinha, sem piscar "Carregando", quando o banco avisa uma mudança', async () => {
    service.listarPendentes.mockResolvedValueOnce([
      comanda({ id: 'c3', mesa: '7', cliente: 'Josias' }),
    ]);

    avisarMudanca();
    expect(tela().textContent).not.toContain('Carregando');
    await fixture.whenStable();

    expect(supabase.escutarMudancas).toHaveBeenCalledWith(
      [{ tabela: 'comandas' }, { tabela: 'pedido_itens' }],
      expect.any(Function),
    );
    expect(tela().textContent).toContain('Josias');
  });

  it('explica quando o banco recusa por falta de permissão', async () => {
    service.liberar.mockRejectedValueOnce({ code: 'P0001', message: 'Mudança de status não permitida' });

    botao('Liberar entrada').click();
    await fixture.whenStable();

    expect(tela().textContent).toContain('Sem permissão para esta ação');
    expect(tela().textContent).toContain('Carlos');
  });
});
