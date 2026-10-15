import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConviteEquipe } from '../../../models';
import { EquipeService } from '../../../services/equipe.service';
import { EquipeConvite } from './equipe-convite';

registerLocaleData(localePt);

function convite(id: string, codigo: string): ConviteEquipe {
  return {
    id,
    codigo,
    criado_em: new Date().toISOString(),
    expira_em: new Date(Date.now() + 47 * 3_600_000 + 60_000).toISOString(),
  };
}

describe('EquipeConvite (gerente)', () => {
  let fixture: ComponentFixture<EquipeConvite>;
  let service: {
    listarConvitesAbertos: ReturnType<typeof vi.fn>;
    criarConvite: ReturnType<typeof vi.fn>;
    cancelarConvite: ReturnType<typeof vi.fn>;
  };
  let escreverNaAreaDeTransferencia: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(texto: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes(texto),
    )!;
  }

  async function abrir(abertos: ConviteEquipe[]): Promise<void> {
    service.listarConvitesAbertos.mockResolvedValue(abertos);
    fixture = TestBed.createComponent(EquipeConvite);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    service = {
      listarConvitesAbertos: vi.fn(),
      criarConvite: vi.fn().mockResolvedValue(convite('c2', 'NOVO-1234-ABCD')),
      cancelarConvite: vi.fn().mockResolvedValue(undefined),
    };
    escreverNaAreaDeTransferencia = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escreverNaAreaDeTransferencia },
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [EquipeConvite],
      providers: [
        { provide: EquipeService, useValue: service },
        { provide: LOCALE_ID, useValue: 'pt-BR' },
      ],
    }).compileComponents();
  });

  it('sem convite em aberto, oferece gerar um', async () => {
    await abrir([]);

    botao('Gerar link de convite').click();
    await fixture.whenStable();

    expect(service.criarConvite).toHaveBeenCalled();
    expect(tela().textContent).toContain('/convite/NOVO-1234-ABCD');
  });

  it('mostra o link do convite mais recente e copia ao tocar', async () => {
    await abrir([convite('c1', 'A3F9-C17B-2D40')]);

    botao('Copiar link').click();
    await fixture.whenStable();

    expect(escreverNaAreaDeTransferencia).toHaveBeenCalledWith(
      `${location.origin}/convite/A3F9-C17B-2D40`,
    );
    expect(tela().textContent).toContain('Link copiado');
  });

  it('o WhatsApp leva o link pronto na mensagem', async () => {
    await abrir([convite('c1', 'A3F9-C17B-2D40')]);
    const whatsapp = Array.from(tela().querySelectorAll('a')).find((a) =>
      a.textContent?.includes('WhatsApp'),
    )!;

    expect(whatsapp.getAttribute('href')).toContain('https://wa.me/?text=');
    expect(decodeURIComponent(whatsapp.getAttribute('href')!)).toContain('/convite/A3F9-C17B-2D40');
  });

  it('lista os convites em aberto com a validade e permite cancelar', async () => {
    await abrir([convite('c1', 'A3F9-C17B-2D40'), convite('c0', 'ANTI-GO00-0000')]);

    expect(tela().textContent).toContain('expira em 47 h');

    const cancelar = tela().querySelectorAll<HTMLButtonElement>('.cancelar')[1];
    cancelar.click();
    await fixture.whenStable();

    expect(service.cancelarConvite).toHaveBeenCalledWith('c0');
    expect(tela().textContent).not.toContain('ANTI-GO00-0000');
  });

  it('explica as regras que protegem o bar', async () => {
    await abrir([]);
    const texto = tela().textContent ?? '';

    expect(texto).toContain('48 horas');
    expect(texto).toContain('uma pessoa só');
    expect(texto).toContain('sua aprovação');
  });
});
