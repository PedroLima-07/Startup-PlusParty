import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AvaliacaoPendente } from '../../models';
import { AvaliacaoService } from '../../services/avaliacao.service';
import { AvaliarExperiencia } from './avaliar-experiencia';

const PENDENTE: AvaliacaoPendente = {
  comanda_id: 'c1',
  estabelecimento_id: 'bar-1',
  estabelecimento: "Bar D'Zé",
  pedida_em: '2026-10-23T22:00:00Z',
};

describe('AvaliarExperiencia', () => {
  let fixture: ComponentFixture<AvaliarExperiencia>;
  let encontrada: ReturnType<typeof signal<AvaliacaoPendente | null>>;
  let servico: {
    pendente: ReturnType<typeof computed<AvaliacaoPendente | null>>;
    avaliar: ReturnType<typeof vi.fn>;
    dispensar: ReturnType<typeof vi.fn>;
    adiar: ReturnType<typeof vi.fn>;
  };

  const tela = () => {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const botao = (texto: string) =>
    Array.from(tela().querySelectorAll('button')).find((b) => b.textContent?.includes(texto))!;
  const estrelas = () => Array.from(tela().querySelectorAll<HTMLButtonElement>('.estrela'));

  async function criar(url: string): Promise<void> {
    encontrada = signal<AvaliacaoPendente | null>(PENDENTE);
    servico = {
      pendente: computed(() => encontrada()),
      avaliar: vi.fn(async () => encontrada.set(null)),
      dispensar: vi.fn(async () => encontrada.set(null)),
      adiar: vi.fn(() => encontrada.set(null)),
    };

    await TestBed.configureTestingModule({
      imports: [AvaliarExperiencia],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: AvaliacaoService, useValue: servico },
      ],
    }).compileComponents();

    await TestBed.inject(Router).navigateByUrl(url);
    fixture = TestBed.createComponent(AvaliarExperiencia);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('na área do cliente, pergunta pelo bar da conta paga', async () => {
    await criar('/cliente/home');

    expect(tela().querySelector('h2')?.textContent).toContain('Avalie sua experiência');
    expect(tela().textContent).toContain("Como foi no Bar D'Zé?");
  });

  it('fora da área do cliente não aparece', async () => {
    await criar('/atendente/comandas');

    expect(tela().querySelector('.folha')).toBeNull();
  });

  it('só envia depois de escolher as estrelas, com o comentário', async () => {
    await criar('/cliente/home');
    expect(botao('Enviar avaliação').disabled).toBe(true);

    estrelas()[3].click();
    expect(tela().querySelector('.rotulo-nota')?.textContent).toContain('Bom');
    expect(estrelas().filter((e) => e.classList.contains('marcada'))).toHaveLength(4);
    expect(estrelas()[3].getAttribute('aria-checked')).toBe('true');

    const campo = tela().querySelector('textarea')!;
    campo.value = 'Volto sexta';
    campo.dispatchEvent(new Event('input'));
    botao('Enviar avaliação').click();
    await fixture.whenStable();

    expect(servico.avaliar).toHaveBeenCalledWith(4, 'Volto sexta');
    expect(tela().querySelector('.obrigado')?.textContent).toContain('Obrigado pela avaliação!');
  });

  it('"Não quero avaliar" dispensa de vez', async () => {
    await criar('/cliente/home');

    botao('Não quero avaliar').click();
    await fixture.whenStable();

    expect(servico.dispensar).toHaveBeenCalled();
    expect(tela().querySelector('.folha')).toBeNull();
  });

  it('o X só adia: não conta como dispensar', async () => {
    await criar('/cliente/home');

    tela().querySelector<HTMLButtonElement>('.fechar')!.click();

    expect(servico.adiar).toHaveBeenCalled();
    expect(servico.dispensar).not.toHaveBeenCalled();
    expect(tela().querySelector('.folha')).toBeNull();
  });

  it('se o envio falha, mostra o erro e continua aberto', async () => {
    await criar('/cliente/home');
    servico.avaliar.mockRejectedValueOnce(new Error('rede'));

    estrelas()[4].click();
    botao('Enviar avaliação').click();
    await fixture.whenStable();

    expect(tela().querySelector('.erro')?.textContent).toContain('Não foi possível enviar');
    expect(tela().querySelector('.folha')).not.toBeNull();
  });
});
