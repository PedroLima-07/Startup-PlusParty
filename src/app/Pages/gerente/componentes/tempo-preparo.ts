import { Component, computed, input } from '@angular/core';
import { Icone } from './icone';

/** A partir de quantas vezes mais lento um setor vira destaque. */
const DIFERENCA_RELEVANTE = 2;

/** Tempo médio de preparo do bar e da cozinha, destacando o setor mais lento. */
@Component({
  selector: 'app-tempo-preparo',
  imports: [Icone],
  template: `
    <div class="setores">
      <div class="setor" [class.lento]="maisLento() === 'bar'">
        <span class="nome"><app-icone nome="bar" /> Bar</span>
        <span class="tempo"><strong>{{ bar() }}</strong> min</span>
        <span class="legenda">média de hoje</span>
      </div>
      <div class="setor" [class.lento]="maisLento() === 'cozinha'">
        <span class="nome"><app-icone nome="cozinha" /> Cozinha</span>
        <span class="tempo"><strong>{{ cozinha() }}</strong> min</span>
        <span class="legenda">média de hoje</span>
      </div>
    </div>
    <p class="leitura">{{ leitura() }}</p>
  `,
  styleUrl: './tempo-preparo.scss',
})
export class TempoPreparo {
  /** Minutos, do pedido enviado até ser marcado como pronto. */
  readonly bar = input.required<number>();
  readonly cozinha = input.required<number>();

  /** O setor bem mais lento que o outro; null quando os tempos são parecidos. */
  protected readonly maisLento = computed<'bar' | 'cozinha' | null>(() => {
    const [bar, cozinha] = [this.bar(), this.cozinha()];
    if (bar <= 0 || cozinha <= 0) return null;
    if (cozinha >= bar * DIFERENCA_RELEVANTE) return 'cozinha';
    if (bar >= cozinha * DIFERENCA_RELEVANTE) return 'bar';
    return null;
  });

  protected readonly leitura = computed(() => {
    const lento = this.maisLento();
    if (!lento) return 'Bar e cozinha estão com tempos de preparo parecidos.';

    const [maior, menor] = lento === 'cozinha' ? [this.cozinha(), this.bar()] : [this.bar(), this.cozinha()];
    const vezes = maior / menor;
    const arredondado = Math.round(vezes);
    const quantas = arredondado > vezes ? `quase ${arredondado}` : `${arredondado}`;
    const [sujeito, outro] = lento === 'cozinha' ? ['A cozinha', 'o bar'] : ['O bar', 'a cozinha'];

    return `${sujeito} está levando ${quantas} vezes mais tempo que ${outro}. Vale checar se há gargalo no preparo.`;
  });
}
