import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FuncionarioDetalhe } from '../../../models';
import { Desempenho, DesempenhoService } from '../../../services/desempenho.service';
import { EquipeService } from '../../../services/equipe.service';
import { EquipePerfil } from './equipe-perfil';

registerLocaleData(localePt);

const ANA: FuncionarioDetalhe = {
  id: 'u2',
  nome: 'Ana Lima',
  email: 'ana@party.app',
  telefone: '15988880000',
  foto_url: 'https://fotos/ana.jpg',
  naEquipeDesde: '2026-09-02T21:00:00Z',
  peloConvite: true,
};

const DESEMPENHO: Desempenho = {
  hoje: {
    pedidos: 42,
    itens: 81,
    comandasLiberadas: 14,
    pagamentosConfirmados: 12,
    barras: [
      { rotulo: '21h', valor: 9 },
      { rotulo: '22h', valor: 11 },
      { rotulo: '23h', valor: 8 },
    ],
  },
  semana: {
    pedidos: 264,
    itens: 512,
    comandasLiberadas: 96,
    pagamentosConfirmados: 88,
    barras: [
      { rotulo: 'Sex', valor: 46 },
      { rotulo: 'Sáb', valor: 51 },
      { rotulo: 'Hoje', valor: 42 },
    ],
    noitesTrabalhadas: 7,
    mediaPorNoite: 38,
  },
};

describe('EquipePerfil (gerente)', () => {
  let fixture: ComponentFixture<EquipePerfil>;
  let router: Router;
  let buscarFuncionario: ReturnType<typeof vi.fn>;
  let buscarDesempenho: ReturnType<typeof vi.fn>;
  let remover: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function texto(): string {
    return (tela().textContent ?? '').replace(/\s+/g, ' ');
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(rotulo),
    )!;
  }

  async function abrir(): Promise<void> {
    fixture = TestBed.createComponent(EquipePerfil);
    fixture.componentRef.setInput('id', 'u2');
    fixture.detectChanges();
    // A carga passa por várias promessas: espera a fila esvaziar.
    await new Promise((resolver) => setTimeout(resolver));
  }

  beforeEach(async () => {
    buscarFuncionario = vi.fn().mockResolvedValue(ANA);
    buscarDesempenho = vi.fn().mockResolvedValue(DESEMPENHO);
    remover = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [EquipePerfil],
      providers: [
        provideRouter([]),
        { provide: EquipeService, useValue: { buscarFuncionario, remover } },
        { provide: DesempenhoService, useValue: { buscar: buscarDesempenho } },
        { provide: LOCALE_ID, useValue: 'pt-BR' },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('mostra a foto, o nome, desde quando está na equipe e os dados do cadastro', async () => {
    await abrir();

    expect(tela().querySelector('.destaque img')?.getAttribute('src')).toBe('https://fotos/ana.jpg');
    expect(texto()).toContain('Ana Lima');
    expect(texto()).toContain('Na equipe desde 02/09/2026');
    expect(texto()).toContain('ana@party.app');
    expect(texto()).toContain('15988880000');
    expect(texto()).toContain('02/09/2026, pelo seu convite');
  });

  it('abre na noite de hoje, com as barras por hora e o pico', async () => {
    await abrir();

    expect(texto()).toContain('pedidos entregues hoje');
    expect(tela().querySelector('.quadros dd')?.textContent).toBe('42');
    expect(tela().querySelectorAll('app-grafico-barras li')).toHaveLength(3);
    expect(texto()).toContain('O pico foi às 22h, com 11 pedidos entregues.');
    expect(texto()).toContain('Trabalhando hoje');
  });

  it('troca para as últimas 7 noites', async () => {
    await abrir();

    botao('7 noites').click();

    expect(tela().querySelector('.quadros dd')?.textContent).toBe('264');
    expect(texto()).toContain('A melhor noite foi sáb, com 51 pedidos.');
    expect(texto()).toContain('Pedidos entregues por noite');
  });

  it('sem os números de desempenho, o perfil continua aparecendo', async () => {
    buscarDesempenho.mockRejectedValue(new Error('coluna não existe'));
    await abrir();

    expect(texto()).toContain('Ana Lima');
    expect(texto()).toContain('Os números de desempenho ainda não estão disponíveis.');
  });

  it('remover pede confirmação e depois volta para a Equipe', async () => {
    await abrir();

    botao('Remover da equipe').click();
    expect(texto()).toContain('Remover Ana Lima da equipe?');
    expect(remover).not.toHaveBeenCalled();

    const confirmar = Array.from(tela().querySelectorAll<HTMLButtonElement>('.modal button')).find(
      (b) => b.textContent?.includes('Remover'),
    )!;
    confirmar.click();
    await fixture.whenStable();

    expect(remover).toHaveBeenCalledWith('u2');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/gerente/equipe', { replaceUrl: true });
  });

  it('atendente que não é mais da equipe mostra o aviso e o caminho de volta', async () => {
    buscarFuncionario.mockResolvedValue(null);
    await abrir();

    expect(texto()).toContain('Este atendente não faz mais parte da equipe.');
  });
});
