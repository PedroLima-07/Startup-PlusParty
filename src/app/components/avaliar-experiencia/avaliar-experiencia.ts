import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AvaliacaoService } from '../../services/avaliacao.service';

const ROTULOS_NOTA = ['', 'Ruim', 'Fraco', 'Ok', 'Bom', 'Excelente'];

/** Quanto tempo o "Obrigado" fica antes de o aviso sumir. */
const DURACAO_OBRIGADO_MS = 2500;

export const LIMITE_COMENTARIO = 500;

/**
 * "Avalie sua experiência": aparece por cima de qualquer tela do cliente
 * quando há uma conta paga sem avaliação. Fica no App, como o aviso de
 * notificações.
 */
@Component({
  selector: 'app-avaliar-experiencia',
  templateUrl: './avaliar-experiencia.html',
  styleUrl: './avaliar-experiencia.scss',
  host: { '(document:keydown.escape)': 'fechar()' },
})
export class AvaliarExperiencia {
  private readonly avaliacao = inject(AvaliacaoService);
  private readonly router = inject(Router);

  protected readonly estrelas = [1, 2, 3, 4, 5];
  protected readonly limiteComentario = LIMITE_COMENTARIO;

  protected readonly nota = signal(0);
  protected readonly comentario = signal('');
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** Nome do bar do "Obrigado", que fica um instante depois de enviar. */
  protected readonly agradecendo = signal<string | null>(null);

  private readonly naAreaDoCliente = toSignal(
    this.router.events.pipe(
      filter((evento) => evento instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/cliente')),
    ),
    { initialValue: this.router.url.startsWith('/cliente') },
  );

  /** O pedido na tela; some fora da área do cliente (atendente, gerente, login). */
  protected readonly pendente = computed(() =>
    this.naAreaDoCliente() ? this.avaliacao.pendente() : null,
  );

  protected readonly rotuloNota = computed(() => ROTULOS_NOTA[this.nota()]);

  protected escolher(nota: number): void {
    this.nota.set(nota);
    this.erro.set(null);
  }

  protected aoDigitar(evento: Event): void {
    this.comentario.set((evento.target as HTMLTextAreaElement).value);
  }

  protected async enviar(): Promise<void> {
    const pendente = this.pendente();
    if (!pendente || this.nota() === 0 || this.enviando()) return;

    this.enviando.set(true);
    this.erro.set(null);
    try {
      await this.avaliacao.avaliar(this.nota(), this.comentario());
      this.agradecendo.set(pendente.estabelecimento);
      this.limpar();
      setTimeout(() => this.agradecendo.set(null), DURACAO_OBRIGADO_MS);
    } catch {
      this.erro.set('Não foi possível enviar agora. Tente de novo.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async naoQueroAvaliar(): Promise<void> {
    if (this.enviando()) return;
    this.limpar();
    await this.avaliacao.dispensar();
  }

  /** X, tocar fora ou Esc: adia até o próximo acesso (não conta como dispensar). */
  protected fechar(): void {
    if (this.agradecendo()) {
      this.agradecendo.set(null);
      return;
    }
    if (!this.pendente() || this.enviando()) return;
    this.limpar();
    this.avaliacao.adiar();
  }

  private limpar(): void {
    this.nota.set(0);
    this.comentario.set('');
    this.erro.set(null);
  }
}
