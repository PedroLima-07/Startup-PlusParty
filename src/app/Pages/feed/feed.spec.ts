import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PostagemFeed } from '../../models';
import { PostagemService } from '../../services/postagem.service';
import { NotificacoesService } from '../../services/notificacoes.service';
import { FeedPage } from './feed';

registerLocaleData(localePt);

function postagem(id: string, parcial: Partial<PostagemFeed>): PostagemFeed {
  return {
    id,
    estabelecimento_id: 'b1',
    tipo: 'bebida',
    titulo: id,
    texto: null,
    imagem_url: null,
    preco: null,
    preco_antigo: null,
    valida_ate: null,
    criada_em: new Date().toISOString(),
    estabelecimento: { id: 'b1', nome: "Bar D'Zé", foto_url: null },
    ...parcial,
  };
}

const CHOPE = postagem('Chope a R$ 9', { preco: 9, preco_antigo: 12 });
const SAMBA = postagem('Roda de samba', {
  tipo: 'evento',
  estabelecimento: { id: 'b2', nome: 'Vinil Bar', foto_url: null },
});

describe('FeedPage', () => {
  let fixture: ComponentFixture<FeedPage>;
  let listarFeed: ReturnType<typeof vi.fn>;
  let avisarMudanca: () => void;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function titulos(): string[] {
    return Array.from(tela().querySelectorAll('app-cartao-postagem h3')).map((h) => h.textContent ?? '');
  }

  async function abrir(): Promise<void> {
    fixture = TestBed.createComponent(FeedPage);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    listarFeed = vi.fn().mockResolvedValue([CHOPE, SAMBA]);

    await TestBed.configureTestingModule({
      imports: [FeedPage],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: PostagemService,
          useValue: {
            listarFeed,
            escutar: (aoMudar: () => void) => {
              avisarMudanca = aoMudar;
              return () => undefined;
            },
          },
        },
        { provide: NotificacoesService, useValue: { naoLidas: () => 0 } },
      ],
    }).compileComponents();
  });

  it('mostra as postagens de todos os bares, com o nome de quem publicou', async () => {
    await abrir();

    expect(titulos()).toEqual(['Chope a R$ 9', 'Roda de samba']);
    expect(tela().textContent).toContain("Bar D'Zé");
    expect(tela().textContent).toContain('Vinil Bar');
  });

  it('filtra por tipo', async () => {
    await abrir();
    const eventos = Array.from(tela().querySelectorAll<HTMLButtonElement>('.filtro')).find((b) =>
      b.textContent?.includes('Eventos'),
    )!;

    eventos.click();

    expect(titulos()).toEqual(['Roda de samba']);
    expect(eventos.getAttribute('aria-pressed')).toBe('true');
  });

  it('postagem nova publicada pelo gerente aparece sem recarregar a tela', async () => {
    await abrir();
    listarFeed.mockResolvedValue([postagem('Novidade', { tipo: 'novidade' }), CHOPE, SAMBA]);

    avisarMudanca();
    await fixture.whenStable();

    expect(titulos()[0]).toBe('Novidade');
  });

  it('sem postagens, explica o que vai aparecer ali', async () => {
    listarFeed.mockResolvedValue([]);
    await abrir();

    expect(tela().textContent).toContain('Nada por aqui ainda.');
  });

  it('se não carregar, oferece tentar de novo', async () => {
    listarFeed.mockRejectedValue(new Error('sem rede'));
    await abrir();

    expect(tela().textContent).toContain('Não foi possível carregar as novidades');
  });
});
