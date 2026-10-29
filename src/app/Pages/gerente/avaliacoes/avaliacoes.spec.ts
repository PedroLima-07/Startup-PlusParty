import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AvaliacaoGerente } from '../../../models';
import { GerenteBarService } from '../../../services/gerente-bar.service';
import { alertasDeNotaBaixa } from '../../../services/movimento.service';
import { AvaliacoesGerente } from './avaliacoes';

function avaliacao(parcial: Partial<AvaliacaoGerente>): AvaliacaoGerente {
  return {
    id: 'a1',
    autor: 'Rafael',
    nota: 2,
    comentario: 'Demorou para liberar.',
    criada_em: new Date().toISOString(),
    resposta: null,
    respondida_em: null,
    denunciada_em: null,
    ...parcial,
  };
}

describe('Avaliações (gerente)', () => {
  let fixture: ComponentFixture<AvaliacoesGerente>;
  let servico: Record<string, ReturnType<typeof vi.fn>>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(rotulo: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.trim().startsWith(rotulo),
    )!;
  }

  beforeEach(async () => {
    servico = {
      numerosDasAvaliacoes: vi.fn().mockResolvedValue({
        dias: 30,
        total: 2,
        media: 3.5,
        sem_resposta: 1,
        distribuicao: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 1 },
        anterior: { total: 3, media: 3 },
      }),
      avaliacoes: vi.fn().mockResolvedValue([
        avaliacao({}),
        avaliacao({ id: 'a2', autor: 'Mariana', nota: 5, comentario: 'Ótimo!', resposta: 'Valeu!' }),
      ]),
      responder: vi.fn().mockResolvedValue(undefined),
      denunciar: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [AvaliacoesGerente],
      providers: [{ provide: GerenteBarService, useValue: servico }],
    }).compileComponents();

    fixture = TestBed.createComponent(AvaliacoesGerente);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('mostra a média, a comparação e a distribuição', () => {
    const texto = tela().textContent ?? '';
    expect(tela().querySelector('.media')?.textContent).toBe('3,5');
    expect(texto).toContain('▲ 0,5 vs 30 dias antes');
    expect(tela().querySelectorAll('.distribuicao li')).toHaveLength(5);
  });

  it('o filtro "Sem resposta" deixa só as que faltam responder', () => {
    botao('Sem resposta').click();
    const autores = Array.from(tela().querySelectorAll('.avaliacao strong')).map((s) => s.textContent);
    expect(autores).toEqual(['Rafael']);
  });

  it('responder publica e a resposta aparece no lugar do campo', async () => {
    const campo = tela().querySelector<HTMLTextAreaElement>('.campo-resposta textarea')!;
    campo.value = 'Obrigado pelo retorno!';
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    botao('Publicar resposta').click();
    await fixture.whenStable();

    expect(servico['responder']).toHaveBeenCalledWith('a1', 'Obrigado pelo retorno!');
    expect(tela().textContent).toContain('Sua resposta: Obrigado pelo retorno!');
  });

  it('denunciar pede o motivo antes de enviar', async () => {
    botao('Denunciar').click();
    expect(servico['denunciar']).not.toHaveBeenCalled();

    botao('Enviar denúncia').click();
    await fixture.whenStable();

    expect(servico['denunciar']).toHaveBeenCalledWith('a1', '');
    expect(tela().textContent).toContain('Denunciada');
  });
});

describe('alertasDeNotaBaixa (Movimento)', () => {
  it('vira um alerta com o primeiro nome e o começo do comentário', () => {
    const [alerta] = alertasDeNotaBaixa([
      { id: 'a1', nota: 1, comentario: 'Cerveja quente.', autor: { nome: 'Rafael Menezes' } },
    ]);
    expect(alerta).toEqual({
      id: 'nota-a1',
      tipo: 'nota_baixa',
      titulo: 'Avaliação de 1 estrela',
      detalhe: 'Rafael: "Cerveja quente."',
      comanda: null,
    });
  });
});
