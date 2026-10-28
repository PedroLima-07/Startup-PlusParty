import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Estabelecimento, EventoAgenda } from '../../models';
import { AgendaService } from '../../services/agenda.service';
import { AuthService } from '../../services/auth.service';
import { AvaliacaoService } from '../../services/avaliacao.service';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';
import { NotificacoesService } from '../../services/notificacoes.service';
import { PostagemService } from '../../services/postagem.service';
import { EstabelecimentoPage } from './estabelecimento';

registerLocaleData(localePt);

const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];

function bar(parcial: Partial<Estabelecimento> = {}): Estabelecimento {
  return {
    id: 'b1',
    nome: "Bar D'Zé",
    descricao: 'Chope gelado',
    endereco: 'Rua das Flores, 142',
    capacidade: 80,
    avaliacao: null,
    nota_media: 4.1,
    total_avaliacoes: 66,
    instagram: 'bardoze',
    tiktok: null,
    whatsapp: '5511987654321',
    latitude: -23.5,
    longitude: -46.6,
    criado_em: '2026-01-01',
    foto_url: null,
    sobre: null,
    tags: [],
    horario_abre: '00:00:00',
    horario_fecha: '23:59:00',
    dias_abertos: TODOS_OS_DIAS,
    ...parcial,
  };
}

const SAMBA: EventoAgenda = {
  evento_id: 'e1',
  titulo: 'Roda de samba',
  descricao: null,
  inicio: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  fim: null,
  capa_url: null,
  entrada: 15,
  repete_semanal: true,
  cancelado: false,
  interessados: 8,
  tenho_interesse: false,
};

describe('EstabelecimentoPage', () => {
  let fixture: ComponentFixture<EstabelecimentoPage>;
  let marcar: ReturnType<typeof vi.fn>;
  let logado: boolean;
  let dadosDoBar: Estabelecimento;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.trim().startsWith(rotulo),
    )!;
  }

  async function abrir(dados: Estabelecimento, aba?: string): Promise<void> {
    dadosDoBar = dados;
    fixture = TestBed.createComponent(EstabelecimentoPage);
    fixture.componentRef.setInput('id', 'b1');
    if (aba) fixture.componentRef.setInput('aba', aba);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    marcar = vi.fn().mockResolvedValue(undefined);
    logado = true;

    await TestBed.configureTestingModule({
      imports: [EstabelecimentoPage],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: EstabelecimentosService, useValue: { buscarPorId: async () => dadosDoBar } },
        { provide: AgendaService, useValue: { doBar: async () => [SAMBA], marcarInteresse: marcar } },
        {
          provide: AvaliacaoService,
          useValue: {
            doBar: async () => [
              {
                id: 'a1',
                autor: 'Mariana',
                nota: 5,
                comentario: 'Chope gelado.',
                criada_em: new Date().toISOString(),
                resposta: 'Valeu!',
                respondida_em: null,
              },
            ],
          },
        },
        { provide: PostagemService, useValue: { listarDoBar: async () => [] } },
        {
          provide: AuthService,
          useValue: { usuarioAtual: async () => (logado ? { id: 'u1' } : null), perfilAtual: async () => null },
        },
        { provide: NotificacoesService, useValue: { naoLidas: () => 0 } },
      ],
    }).compileComponents();
  });

  it('mostra só as redes preenchidas e o "Como chegar" pelo ponto do mapa', async () => {
    await abrir(bar());
    const links = Array.from(tela().querySelectorAll<HTMLAnchorElement>('.botao-pilula')).map((a) => [
      a.textContent?.trim(),
      a.getAttribute('href'),
    ]);

    expect(links).toEqual([
      ['Como chegar', 'https://www.google.com/maps/dir/?api=1&destination=-23.5%2C-46.6'],
      ['Instagram', 'https://instagram.com/bardoze'],
      ['WhatsApp', 'https://wa.me/5511987654321'],
      ['Compartilhar', null],
    ]);
  });

  it('o botão de abrir comanda só aparece com o bar aberto', async () => {
    await abrir(bar());
    expect(botao('Abrir comanda aqui')).toBeDefined();

    await abrir(bar({ dias_abertos: [] }));
    expect(botao('Abrir comanda aqui')).toBeUndefined();
  });

  it('?aba=agenda abre na Agenda; marcar interesse soma um interessado', async () => {
    await abrir(bar(), 'agenda');
    await fixture.whenStable();
    expect(tela().textContent).toContain('Roda de samba');
    expect(tela().textContent).toContain('8 interessados');

    botao('Tenho interesse').click();
    await fixture.whenStable();

    expect(marcar).toHaveBeenCalledWith('e1');
    expect(tela().textContent).toContain('9 interessados');
    expect(botao('Tenho interesse').getAttribute('aria-pressed')).toBe('true');
  });

  it('sem login, "Tenho interesse" leva para entrar', async () => {
    logado = false;
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await abrir(bar(), 'agenda');
    await fixture.whenStable();

    botao('Tenho interesse').click();
    await fixture.whenStable();

    expect(navegar).toHaveBeenCalledWith('/login');
    expect(marcar).not.toHaveBeenCalled();
  });

  it('a aba Avaliações mostra a média, o autor e a resposta do bar', async () => {
    await abrir(bar());
    botao('Avaliações').click();
    await fixture.whenStable();
    const texto = tela().textContent ?? '';

    expect(texto).toContain('média de 66 avaliações');
    expect(texto).toContain('Mariana');
    expect(texto).toContain('Resposta do bar:');
    expect(texto).toContain('Avaliação verificada');
  });
});
