import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { PostagemService } from '../../../services/postagem.service';
import { Icone } from '../componentes/icone';

/** O gerente escreve avisos e novidades do bar; as últimas postagens ficam listadas abaixo. */
@Component({
  selector: 'app-postagens',
  imports: [DatePipe, Icone],
  templateUrl: './postagens.html',
  styleUrl: './postagens.scss',
})
export class Postagens {
  protected readonly postagemService = inject(PostagemService);

  protected readonly texto = signal('');
  protected readonly fotoPrevia = signal<string | null>(null);
  protected readonly podePublicar = computed(
    () => this.texto().trim().length > 0 || this.fotoPrevia() !== null,
  );

  /** Mostra a foto escolhida antes de publicar. */
  protected escolherFoto(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = () => this.fotoPrevia.set(leitor.result as string);
    leitor.readAsDataURL(arquivo);
    // Permite escolher o mesmo arquivo de novo depois de remover a foto.
    campo.value = '';
  }

  protected publicar(): void {
    if (!this.podePublicar()) return;

    this.postagemService.publicar(this.texto().trim(), this.fotoPrevia() ?? undefined);
    this.texto.set('');
    this.fotoPrevia.set(null);
  }
}
