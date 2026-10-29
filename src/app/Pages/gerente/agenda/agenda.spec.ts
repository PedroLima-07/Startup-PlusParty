import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventoDoBar } from '../../../models';
import { GerenteBarService } from '../../../services/gerente-bar.service';
import { AgendaGerente, lerEntrada } from './agenda';

registerLocaleData(localePt);

const SAMBA: EventoDoBar = {
  id: 'e1',
  titulo: 'Roda de samba',
  descricao: null,
  inicio: new Date(Date.now() - 7 * 86_400_000).toISOString(),
  fim: null,
  entrada: 15,
  repete_semanal: true,
  cancelado_em: null,
  interessados: 8,
};

describe('Agenda (gerente)', () => {
  let fixture: ComponentFixture<AgendaGerente>;
  let servico: { eventos: ReturnType<typeof vi.fn>; criarEvento: ReturnType<typeof vi.fn>; cancelarEvento: ReturnType<typeof vi.fn> };

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === rotulo,
    )!;
  }

  async function digitar(nome: string, valor: string): Promise<void> {
    const campo = tela().querySelector<HTMLInputElement>(`[name="${nome}"]`)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    servico = {
      eventos: vi.fn().mockResolvedValue([SAMBA]),
      criarEvento: vi.fn().mockResolvedValue(undefined),
      cancelarEvento: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [AgendaGerente],
      providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }, { provide: GerenteBarService, useValue: servico }],
    }).compileComponents();

    fixture = TestBed.createComponent(AgendaGerente);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('lista o evento semanal com a próxima data e os interessados', () => {
    const texto = tela().textContent ?? '';
    expect(texto).toContain('Roda de samba');
    expect(texto).toContain('Toda semana · próxima');
    expect(texto).toContain('8 interessados');
  });

  it('cria um evento com a entrada lida em reais', async () => {
    botao('+ Evento').click();
    await fixture.whenStable();
    await digitar('titulo', 'Show acústico');
    await digitar('data', '2099-12-31');
    await digitar('hora', '22:00');
    await digitar('entrada', '20,50');
    tela().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(servico.criarEvento).toHaveBeenCalledWith({
      titulo: 'Show acústico',
      descricao: null,
      inicio: new Date('2099-12-31T22:00').toISOString(),
      entrada: 20.5,
      repete_semanal: false,
    });
    expect(tela().querySelector('.painel')).toBeNull();
  });

  it('cancelar pede confirmação e avisa quantos interessados recebem o aviso', async () => {
    botao('Cancelar').click();
    expect(tela().querySelector('.confirmar')?.textContent).toContain('8 clientes marcaram interesse');
    expect(servico.cancelarEvento).not.toHaveBeenCalled();

    botao('Cancelar evento').click();
    await fixture.whenStable();

    expect(servico.cancelarEvento).toHaveBeenCalledWith('e1');
    expect(tela().querySelector('.evento.cancelado')).not.toBeNull();
  });
});

describe('lerEntrada', () => {
  it('aceita o jeito brasileiro e vazio vira grátis', () => {
    expect(lerEntrada('15,00')).toBe(15);
    expect(lerEntrada('R$ 1.250,50')).toBe(1250.5);
    expect(lerEntrada('')).toBeNull();
    expect(lerEntrada('quinze')).toBe('invalida');
  });
});
