import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Funcionario, SolicitacaoPendente } from '../../../models';
import { EquipeService } from '../../../services/equipe.service';
import { Equipe } from './equipe';

registerLocaleData(localePt);

const PEDIDO: SolicitacaoPendente = {
  id: 's1',
  nome: 'Gil Souza',
  email: 'gil@party.app',
  telefone: '15999990000',
  criada_em: '2026-10-08T21:30:00Z',
};

const ANA: Funcionario = { id: 'u2', nome: 'Ana Lima', email: 'ana@party.app', telefone: '15988880000' };

describe('Equipe (gerente)', () => {
  let fixture: ComponentFixture<Equipe>;
  let service: {
    pendentes: ReturnType<typeof signal<SolicitacaoPendente[]>>;
    carregarPendentes: ReturnType<typeof vi.fn>;
    listarFuncionarios: ReturnType<typeof vi.fn>;
    responder: ReturnType<typeof vi.fn>;
    remover: ReturnType<typeof vi.fn>;
  };

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(texto: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(texto),
    )!;
  }

  beforeEach(async () => {
    service = {
      pendentes: signal([PEDIDO]),
      carregarPendentes: vi.fn().mockResolvedValue(undefined),
      listarFuncionarios: vi.fn().mockResolvedValue([ANA]),
      responder: vi.fn().mockResolvedValue(undefined),
      remover: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [Equipe],
      providers: [
        { provide: EquipeService, useValue: service },
        { provide: LOCALE_ID, useValue: 'pt-BR' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Equipe);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('mostra quem pediu para entrar, com os dados de contato', () => {
    const texto = tela().textContent ?? '';

    expect(texto).toContain('Gil Souza');
    expect(texto).toContain('gil@party.app');
    expect(texto).toContain('15999990000');
  });

  it('mostra os atendentes do bar', () => {
    expect(tela().textContent).toContain('Ana Lima');
  });

  it('aprovar responde o pedido e recarrega as duas listas', async () => {
    botao('Aprovar').click();
    await fixture.whenStable();

    expect(service.responder).toHaveBeenCalledWith('s1', true);
    expect(service.carregarPendentes).toHaveBeenCalledTimes(2);
    expect(service.listarFuncionarios).toHaveBeenCalledTimes(2);
  });

  it('recusar responde o pedido como não aprovado', async () => {
    botao('Recusar').click();
    await fixture.whenStable();

    expect(service.responder).toHaveBeenCalledWith('s1', false);
  });

  it('pedido novo que chega pelo tempo real aparece sem recarregar a tela', () => {
    service.pendentes.set([PEDIDO, { ...PEDIDO, id: 's2', nome: 'Bia Reis' }]);

    expect(tela().textContent).toContain('Bia Reis');
  });

  it('remover pede confirmação antes de agir', async () => {
    botao('Remover').click();

    expect(tela().textContent).toContain('Remover Ana Lima da equipe?');
    expect(service.remover).not.toHaveBeenCalled();

    botao('Cancelar').click();
    expect(tela().querySelector('.modal')).toBeNull();
    expect(service.remover).not.toHaveBeenCalled();
  });

  it('confirmada a remoção, tira o funcionário da equipe', async () => {
    botao('Remover').click();
    const confirmar = Array.from(tela().querySelectorAll<HTMLButtonElement>('.modal button')).find(
      (b) => b.textContent?.includes('Remover'),
    )!;

    confirmar.click();
    await fixture.whenStable();

    expect(service.remover).toHaveBeenCalledWith('u2');
    expect(tela().querySelector('.modal')).toBeNull();
  });

  it('mostra a frase do banco quando ele recusa a ação', async () => {
    service.responder.mockRejectedValueOnce({
      code: 'P0001',
      message: 'Solicitação não encontrada ou já respondida.',
    });

    botao('Aprovar').click();
    await fixture.whenStable();

    expect(tela().textContent).toContain('Solicitação não encontrada ou já respondida.');
  });

  it('se a primeira carga falhar, mostra só o aviso, sem listas vazias enganosas', async () => {
    service.listarFuncionarios.mockRejectedValueOnce(new Error('sem rede'));

    fixture = TestBed.createComponent(Equipe);
    fixture.detectChanges();
    // A falha percorre mais etapas que o caminho feliz: espera a fila esvaziar.
    await new Promise((resolver) => setTimeout(resolver));

    expect(tela().textContent).toContain('Não foi possível carregar a equipe');
    expect(tela().querySelector('section')).toBeNull();
  });
});
