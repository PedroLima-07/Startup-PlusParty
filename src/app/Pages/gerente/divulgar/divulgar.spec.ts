import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { EstabelecimentosService } from '../../../services/estabelecimentos.service';
import { CartaoDivulgar, cartaoDivulgarVisivel } from './cartao-divulgar';
import { Divulgar } from './divulgar';
import { GeradorStory, linkSemProtocolo } from './story';

describe('Divulgar meu bar', () => {
  let fixture: ComponentFixture<Divulgar>;
  let escrever: ReturnType<typeof vi.fn>;
  // jsdom não desenha em canvas: a imagem é trocada por um arquivo qualquer.
  let gerarStory: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes(rotulo),
    )!;
  }

  beforeEach(async () => {
    gerarStory = vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    URL.createObjectURL = vi.fn(() => 'blob:story');
    URL.revokeObjectURL = vi.fn();
    escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });

    await TestBed.configureTestingModule({
      imports: [Divulgar],
      providers: [
        provideRouter([]),
        { provide: GeradorStory, useValue: { gerar: gerarStory } },
        {
          provide: AuthService,
          useValue: { perfilAtual: () => Promise.resolve({ estabelecimento: { id: 'b1', nome: "Bar D'Zé" } }) },
        },
        {
          provide: EstabelecimentosService,
          useValue: {
            buscarPorId: () => Promise.resolve({ id: 'b1', nome: "Bar D'Zé", foto_url: '/img/bar.jpg' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Divulgar);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('gera o Story com o nome, a foto e o link do bar', () => {
    expect(gerarStory).toHaveBeenCalledWith({
      nome: "Bar D'Zé",
      fotoUrl: '/img/bar.jpg',
      link: `${location.origin}/cliente/estabelecimento/b1`,
    });
    expect(tela().querySelector('.previa-story img')?.getAttribute('src')).toBe('blob:story');
  });

  it('baixa a imagem com o nome do bar no arquivo', () => {
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    let arquivo = '';
    clique.mockImplementation(function (this: HTMLAnchorElement) {
      arquivo = this.download;
    });

    botao('Baixar imagem').click();

    expect(arquivo).toBe('story-bar-dze.png');
    clique.mockRestore();
  });

  it('os textos prontos citam o bar e o link, e o botão copia', async () => {
    const whatsapp = tela().querySelectorAll('.texto-pronto')[0].textContent ?? '';
    expect(whatsapp).toContain("no Bar D'Zé");
    expect(whatsapp).toContain('/cliente/estabelecimento/b1');

    botao('Copiar texto').click();
    await fixture.whenStable();

    expect(escrever).toHaveBeenCalledWith(whatsapp);
    expect(tela().textContent).toContain('Copiado!');
  });

  it('copia o link do bar para a bio', async () => {
    botao('Copiar').click();
    await fixture.whenStable();

    expect(escrever).toHaveBeenCalledWith(`${location.origin}/cliente/estabelecimento/b1`);
  });

  it('se o navegador não gerar a imagem, avisa e o botão fica desligado', async () => {
    gerarStory.mockRejectedValue(new Error('sem canvas'));
    fixture = TestBed.createComponent(Divulgar);
    fixture.detectChanges();
    await fixture.whenStable();
    // A imagem é gerada depois que a página abre; espera a falha chegar.
    await new Promise((pronto) => setTimeout(pronto));

    expect(tela().textContent).toContain('Não foi possível gerar a imagem');
    expect(botao('Baixar imagem').disabled).toBe(true);
  });

  it('o link na imagem aparece sem o https://', () => {
    expect(linkSemProtocolo('https://party.app/cliente/estabelecimento/b1')).toBe(
      'party.app/cliente/estabelecimento/b1',
    );
  });
});

describe('Cartão "Divulgue o +party" do Movimento', () => {
  const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [CartaoDivulgar], providers: [provideRouter([])] });
  });

  it('aparece até ser dispensado, e some ao dispensar', () => {
    const fixture = TestBed.createComponent(CartaoDivulgar);
    fixture.detectChanges();
    const elemento = fixture.nativeElement as HTMLElement;
    expect(elemento.textContent).toContain('Divulgue o +party no seu bar');
    expect(elemento.querySelector('a')?.getAttribute('href')).toBe('/gerente/divulgar');

    elemento.querySelector<HTMLButtonElement>('.dispensar')!.click();
    fixture.detectChanges();

    expect(elemento.textContent).not.toContain('Divulgue');
  });

  it('volta depois de 7 dias', () => {
    const agora = Date.now();
    localStorage.setItem('gerente.divulgar.dispensadoEm', String(agora));

    expect(cartaoDivulgarVisivel(agora + SETE_DIAS - 1)).toBe(false);
    expect(cartaoDivulgarVisivel(agora + SETE_DIAS)).toBe(true);
  });
});
