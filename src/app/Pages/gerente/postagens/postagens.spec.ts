import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Postagem } from '../../../models';
import { PostagemService } from '../../../services/postagem.service';
import { Postagens } from './postagens';

registerLocaleData(localePt);

const SAMBA: Postagem = {
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

const VENCIDA: Postagem = {
  ...SAMBA,
  id: 'p9',
  tipo: 'bebida',
  titulo: 'Chope em dobro',
  preco: 9,
  preco_antigo: 12,
  valida_ate: new Date(Date.now() - 86_400_000).toISOString(),
};

describe('Postagens (gerente)', () => {
  let fixture: ComponentFixture<Postagens>;
  let publicar: ReturnType<typeof vi.fn>;
  let editar: ReturnType<typeof vi.fn>;
  let apagar: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function texto(): string {
    return (tela().textContent ?? '').replace(/\s+/g, ' ');
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find(
      (b) => b.textContent?.trim().includes(rotulo) || b.getAttribute('aria-label') === rotulo,
    )!;
  }

  function preencher(seletor: string, valor: string, indice = 0): void {
    const campo = tela().querySelectorAll<HTMLInputElement>(seletor)[indice];
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
  }

  function titulosNaGrade(): string[] {
    return Array.from(tela().querySelectorAll('.grade .titulo')).map((h) => h.textContent ?? '');
  }

  /** Abre a janela e vai até os detalhes, sem foto. */
  function irParaDetalhes(): void {
    botao('Nova postagem').click();
    botao('Usar fundo do tipo').click();
  }

  beforeEach(async () => {
    publicar = vi.fn((nova) => Promise.resolve({ ...SAMBA, ...nova, id: 'p1' }));
    editar = vi.fn((original, dados) => Promise.resolve({ ...original, ...dados }));
    apagar = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [Postagens],
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: PostagemService,
          useValue: {
            listarDoMeuBar: vi.fn().mockResolvedValue([SAMBA, VENCIDA]),
            resumoDoMeuBar: vi
              .fn()
              .mockResolvedValue({ nome: "Bar D'Zé", foto_url: null, clientes: 42 }),
            publicar,
            editar,
            apagar,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Postagens);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('mostra o bar no topo com as ativas, as encerradas e quem recebe os avisos', () => {
    expect(tela().querySelector('h1')?.textContent).toContain("Bar D'Zé");
    const numeros = Array.from(tela().querySelectorAll('.numeros div')).map(
      (d) =>
        `${d.querySelector('dt')?.textContent?.replace('?', '').trim()} ${d.querySelector('dd')?.textContent}`,
    );
    expect(numeros).toEqual(['ativas no Feed 1', 'encerradas 1', 'clientes recebem os avisos 42']);
  });

  it('a grade separa as ativas das encerradas pelas abas', () => {
    expect(titulosNaGrade()).toEqual(['Roda de samba']);

    botao('Encerradas').click();

    expect(titulosNaGrade()).toEqual(['Chope em dobro']);
    expect(tela().querySelector('.grade .info')?.textContent).toContain('-25%');
    expect(texto()).toContain('Encerrada');
  });

  it('as abas e os botões de ícone têm nome e balão', () => {
    const aba = botao('Ativas');
    expect(aba.textContent).toContain('Ativas');
    expect(aba.getAttribute('aria-selected')).toBe('true');
    expect(botao('Editar Roda de samba').getAttribute('data-balao')).toBe('Editar');
  });

  it('publica em três etapas e a nova entra no topo da grade', async () => {
    irParaDetalhes();
    preencher('.janela input[type=text]', 'Happy hour: chope a R$ 9');
    preencher('.janela input[inputmode=decimal]', '9,00', 0);
    preencher('.janela input[inputmode=decimal]', 'R$ 12', 1);

    botao('Continuar').click();
    expect(tela().querySelector('.janela .selo-desconto')?.textContent?.trim()).toBe('-25%');

    botao('Publicar').click();
    await fixture.whenStable();

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
    expect(tela().querySelector('.janela')).toBeNull();
    expect(texto()).toContain('Publicada!');
    expect(titulosNaGrade()).toEqual(['Happy hour: chope a R$ 9', 'Roda de samba']);
  });

  it('não passa dos detalhes sem título', () => {
    irParaDetalhes();
    botao('Continuar').click();

    expect(texto()).toContain('Dê um título para a postagem.');
    expect(tela().querySelector('.janela app-cartao-postagem')).toBeNull();
  });

  it('não aceita preço normal menor que o da promoção', () => {
    irParaDetalhes();
    preencher('.janela input[type=text]', 'Promo');
    preencher('.janela input[inputmode=decimal]', '12', 0);
    preencher('.janela input[inputmode=decimal]', '9', 1);

    botao('Continuar').click();

    expect(tela().querySelector('.janela app-cartao-postagem')).toBeNull();
    expect(texto()).toContain('O preço normal precisa ser maior que o da promoção.');
  });

  it('evento não pede preço', () => {
    irParaDetalhes();
    botao('Evento').click();

    expect(tela().querySelector('.janela input[inputmode=decimal]')).toBeNull();
  });

  it('editar abre a mesma janela preenchida e atualiza o quadro', async () => {
    botao('Editar Roda de samba').click();

    expect(texto()).toContain('Editar postagem');
    botao('Usar fundo do tipo').click();
    const titulo = tela().querySelector<HTMLInputElement>('.janela input[type=text]')!;
    expect(titulo.value).toBe('Roda de samba');

    preencher('.janela input[type=text]', 'Roda de samba ao vivo');
    botao('Continuar').click();
    botao('Salvar alterações').click();
    await fixture.whenStable();

    expect(editar).toHaveBeenCalledWith(
      SAMBA,
      expect.objectContaining({ titulo: 'Roda de samba ao vivo', tipo: 'evento' }),
      'manter',
    );
    expect(titulosNaGrade()).toEqual(['Roda de samba ao vivo']);
    expect(texto()).toContain('Alterações salvas.');
  });

  it('apagar pede confirmação numa janela antes', async () => {
    botao('Apagar Roda de samba').click();
    expect(apagar).not.toHaveBeenCalled();
    expect(tela().querySelector('[role=alertdialog]')?.textContent).toContain('Roda de samba');

    tela().querySelector<HTMLButtonElement>('[role=alertdialog] .botao-perigo')!.click();
    await fixture.whenStable();

    expect(apagar).toHaveBeenCalledWith(SAMBA);
    expect(texto()).toContain('Nenhuma postagem ativa.');
  });

  it('no toque, o "⋯" abre o menu com editar e apagar', () => {
    botao('Opções de Roda de samba').click();

    const itens = Array.from(tela().querySelectorAll('[role=menuitem]')).map((b) =>
      b.textContent?.trim(),
    );
    expect(itens).toEqual(['Editar', 'Apagar']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tela().querySelector('[role=menu]')).toBeNull();
  });
});
