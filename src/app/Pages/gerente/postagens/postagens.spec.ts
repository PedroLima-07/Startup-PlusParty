import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Postagem } from '../../../models';
import { PostagemService } from '../../../services/postagem.service';
import { Postagens } from './postagens';

registerLocaleData(localePt);

const ANTIGA: Postagem = {
  id: 'p0',
  estabelecimento_id: 'b1',
  tipo: 'evento',
  titulo: 'Roda de samba',
  texto: null,
  imagem_url: null,
  preco: null,
  preco_antigo: null,
  valida_ate: null,
  criada_em: new Date().toISOString(),
};

describe('Postagens (gerente)', () => {
  let fixture: ComponentFixture<Postagens>;
  let publicar: ReturnType<typeof vi.fn>;
  let apagar: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function texto(): string {
    return (tela().textContent ?? '').replace(/\s+/g, ' ');
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) => b.textContent?.trim().includes(rotulo))!;
  }

  function preencher(seletor: string, valor: string, indice = 0): void {
    const campo = tela().querySelectorAll<HTMLInputElement>(seletor)[indice];
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
  }

  async function publicarAgora(): Promise<void> {
    botao('Publicar no Feed').click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    publicar = vi.fn((nova) => Promise.resolve({ ...ANTIGA, ...nova, id: 'p1' }));
    apagar = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [Postagens],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: PostagemService,
          useValue: { listarDoMeuBar: vi.fn().mockResolvedValue([ANTIGA]), publicar, apagar },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Postagens);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('publica a promoção com os preços e ela entra no topo da lista', async () => {
    preencher('input[type=text]', 'Happy hour: chope a R$ 9');
    preencher('input[inputmode=decimal]', '9,00', 0);
    preencher('input[inputmode=decimal]', 'R$ 12', 1);

    await publicarAgora();

    expect(publicar).toHaveBeenCalledWith(
      {
        tipo: 'bebida',
        titulo: 'Happy hour: chope a R$ 9',
        texto: null,
        preco: 9,
        preco_antigo: 12,
        valida_ate: null,
      },
      null,
    );
    expect(texto()).toContain('Publicada!');
    const titulos = Array.from(tela().querySelectorAll('.lista h3')).map((h) => h.textContent);
    expect(titulos).toEqual(['Happy hour: chope a R$ 9', 'Roda de samba']);
  });

  it('a prévia acompanha o que o gerente escreve', () => {
    preencher('input[type=text]', 'Combo batata');
    preencher('input[inputmode=decimal]', '49', 0);
    preencher('input[inputmode=decimal]', '58', 1);

    const previa = tela().querySelector('.previa')!;
    expect(previa.querySelector('h3')?.textContent).toBe('Combo batata');
    expect(previa.querySelector('.selo-desconto')?.textContent?.trim()).toBe('-16%');
  });

  it('não publica sem título', async () => {
    await publicarAgora();

    expect(publicar).not.toHaveBeenCalled();
    expect(texto()).toContain('Dê um título para a postagem.');
  });

  it('não aceita preço normal menor que o da promoção', async () => {
    preencher('input[type=text]', 'Promo');
    preencher('input[inputmode=decimal]', '12', 0);
    preencher('input[inputmode=decimal]', '9', 1);

    await publicarAgora();

    expect(publicar).not.toHaveBeenCalled();
    expect(texto()).toContain('O preço normal precisa ser maior que o da promoção.');
  });

  it('evento não pede preço', () => {
    botao('Evento').click();

    expect(tela().querySelector('input[inputmode=decimal]')).toBeNull();
  });

  it('apagar pede confirmação antes', async () => {
    botao('Apagar postagem').click();
    expect(apagar).not.toHaveBeenCalled();

    tela().querySelector<HTMLButtonElement>('.apagar')!.click();
    await fixture.whenStable();

    expect(apagar).toHaveBeenCalledWith(ANTIGA);
    expect(texto()).toContain('Nenhuma postagem ainda.');
  });
});
