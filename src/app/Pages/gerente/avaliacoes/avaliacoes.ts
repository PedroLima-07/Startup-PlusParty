import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AvaliacaoGerente, AvaliacoesPeriodo } from '../../../models';
import { GerenteBarService } from '../../../services/gerente-bar.service';
import { haQuantoTempo } from '../../../tempo';

type Filtro = 'todas' | 'sem_resposta' | 'baixas';

const PERIODOS = [7, 15, 30] as const;

/**
 * Avaliações do bar para o gerente: média e distribuição no período, a lista
 * com filtro e, em cada uma, responder publicamente (aparece no perfil do bar)
 * ou denunciar. Não existe apagar avaliação.
 */
@Component({
  selector: 'app-avaliacoes-gerente',
  imports: [FormsModule],
  templateUrl: './avaliacoes.html',
  styleUrl: './avaliacoes.scss',
})
export class AvaliacoesGerente implements OnInit {
  private readonly gerente = inject(GerenteBarService);

  protected readonly periodos = PERIODOS;
  protected readonly dias = signal<number>(30);
  protected readonly filtro = signal<Filtro>('todas');
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly numeros = signal<AvaliacoesPeriodo | null>(null);
  protected readonly lista = signal<AvaliacaoGerente[]>([]);

  /** Rascunho da resposta de cada avaliação, pelo id. */
  protected readonly rascunhos: Record<string, string> = {};
  protected readonly enviando = signal<string | null>(null);
  protected readonly erroDaAvaliacao = signal<{ id: string; texto: string } | null>(null);
  /** Avaliação com a confirmação de denúncia aberta. */
  protected readonly denunciando = signal<string | null>(null);
  protected motivo = '';

  protected readonly visiveis = computed(() => {
    const filtro = this.filtro();
    return this.lista().filter((a) =>
      filtro === 'sem_resposta' ? !a.resposta : filtro === 'baixas' ? a.nota <= 2 : true,
    );
  });

  protected readonly semResposta = computed(() => this.lista().filter((a) => !a.resposta).length);

  /** Barras de 5 a 1 estrela, em % do total. */
  protected readonly distribuicao = computed(() => {
    const n = this.numeros();
    if (!n) return [];
    return (['5', '4', '3', '2', '1'] as const).map((estrela) => ({
      estrela,
      total: n.distribuicao[estrela],
      largura: n.total ? Math.round((n.distribuicao[estrela] / n.total) * 100) : 0,
    }));
  });

  protected readonly comparacao = computed(() => {
    const n = this.numeros();
    if (n?.media === null || n?.media === undefined || n.anterior.media === null) return null;
    const diferenca = Math.round((n.media - n.anterior.media) * 10) / 10;
    if (diferenca === 0) return `igual aos ${n.dias} dias antes`;
    const sinal = diferenca > 0 ? '▲' : '▼';
    return `${sinal} ${Math.abs(diferenca).toFixed(1).replace('.', ',')} vs ${n.dias} dias antes`;
  });

  async ngOnInit(): Promise<void> {
    await this.carregar();
  }

  protected async escolherPeriodo(dias: number): Promise<void> {
    this.dias.set(dias);
    await this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const [numeros, lista] = await Promise.all([
        this.gerente.numerosDasAvaliacoes(this.dias()),
        this.gerente.avaliacoes(this.dias()),
      ]);
      this.numeros.set(numeros);
      this.lista.set(lista);
    } catch {
      this.erro.set('Não foi possível carregar as avaliações. Tente de novo.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected async responder(avaliacao: AvaliacaoGerente): Promise<void> {
    const texto = (this.rascunhos[avaliacao.id] ?? '').trim();
    if (!texto || this.enviando()) return;

    this.enviando.set(avaliacao.id);
    this.erroDaAvaliacao.set(null);
    try {
      await this.gerente.responder(avaliacao.id, texto);
      this.atualizar(avaliacao.id, { resposta: texto, respondida_em: new Date().toISOString() });
      this.numeros.update((n) => (n ? { ...n, sem_resposta: Math.max(0, n.sem_resposta - 1) } : n));
      delete this.rascunhos[avaliacao.id];
    } catch {
      this.erroDaAvaliacao.set({ id: avaliacao.id, texto: 'Não foi possível publicar a resposta.' });
    } finally {
      this.enviando.set(null);
    }
  }

  protected abrirDenuncia(id: string): void {
    this.motivo = '';
    this.erroDaAvaliacao.set(null);
    this.denunciando.set(id);
  }

  protected async confirmarDenuncia(avaliacao: AvaliacaoGerente): Promise<void> {
    if (this.enviando()) return;
    this.enviando.set(avaliacao.id);
    try {
      await this.gerente.denunciar(avaliacao.id, this.motivo);
      this.atualizar(avaliacao.id, { denunciada_em: new Date().toISOString() });
      this.denunciando.set(null);
    } catch {
      this.erroDaAvaliacao.set({ id: avaliacao.id, texto: 'Não foi possível enviar a denúncia.' });
    } finally {
      this.enviando.set(null);
    }
  }

  protected estrelas(nota: number): string {
    return '★★★★★'.slice(0, nota) + '☆☆☆☆☆'.slice(0, 5 - nota);
  }

  protected quando(data: string): string {
    return haQuantoTempo(data);
  }

  protected media(valor: number | null | undefined): string {
    return valor === null || valor === undefined ? '—' : valor.toFixed(1).replace('.', ',');
  }

  private atualizar(id: string, mudanca: Partial<AvaliacaoGerente>): void {
    this.lista.update((lista) => lista.map((a) => (a.id === id ? { ...a, ...mudanca } : a)));
  }
}
