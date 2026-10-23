import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ComandaService } from '../../services/comanda.service';
import { SupabaseService } from '../../services/supabase.service';
import { ComandaPage } from './comanda';

registerLocaleData(localePt);

const minutosAtras = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

function comanda(dados: Record<string, unknown>) {
  return {
    id: 'comanda-1',
    status: 'aguardando_pagamento',
    mesa: '4',
    estabelecimento_id: 'bar-1',
    fechada_em: minutosAtras(34),
    estabelecimento: { nome: "Bar D'Zé" },
    ...dados,
  };
}

describe('ComandaPage — conta fechada e status finais', () => {
  let fixture: ComponentFixture<ComandaPage>;

  async function abrir(dados: Record<string, unknown>): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [ComandaPage],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: ComandaService,
          useValue: {
            buscarComanda: vi.fn().mockResolvedValue(comanda(dados)),
            buscarItensPedidos: vi.fn().mockResolvedValue([]),
            calcularTotal: vi.fn().mockReturnValue(86),
          },
        },
        { provide: SupabaseService, useValue: { escutarMudancas: vi.fn(() => () => {}) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ComandaPage);
    fixture.componentRef.setInput('id', 'comanda-1');
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    return fixture.nativeElement as HTMLElement;
  }

  it('esperando pagamento: mostra a hora do fechamento e que não dá para abrir outra', async () => {
    const tela = await abrir({ fechada_em: minutosAtras(12) });

    expect(tela.querySelector('.selo-fechada')?.textContent).toContain('há 12 min');
    expect(tela.textContent).toContain('Passe no caixa para concluir o pagamento');
    expect(tela.querySelector('.nota-bloqueio')).not.toBeNull();
    expect(tela.querySelector('.aviso-atraso')).toBeNull();
  });

  it('depois de 30 min sem pagamento, mostra o aviso de atraso', async () => {
    const tela = await abrir({ fechada_em: minutosAtras(34) });

    expect(tela.querySelector('.aviso-atraso')?.textContent).toContain(
      'Seu pagamento ainda não foi confirmado',
    );
  });

  it('paga: confirma o pagamento, sem selo de espera nem bloqueio', async () => {
    const tela = await abrir({ status: 'paga' });

    expect(tela.textContent).toContain('Pagamento confirmado');
    expect(tela.querySelector('.selo-fechada')).toBeNull();
    expect(tela.querySelector('.nota-bloqueio')).toBeNull();
  });

  it('não paga: explica que o bar registrou a conta como não paga', async () => {
    const tela = await abrir({ status: 'nao_paga' });

    expect(tela.textContent).toContain("O Bar D'Zé registrou esta conta como não paga");
  });

  it('cancelada: oferece abrir de novo', async () => {
    const tela = await abrir({ status: 'cancelada', fechada_em: null });

    expect(tela.querySelector('h1')?.textContent).toContain('Solicitação cancelada');
    expect(tela.textContent).toContain('Abrir comanda de novo');
  });
});
