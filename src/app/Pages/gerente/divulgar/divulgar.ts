import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { EstabelecimentosService } from '../../../services/estabelecimentos.service';
import { Icone } from '../componentes/icone';
import { GeradorStory } from './story';

type Texto = 'whatsapp' | 'instagram' | 'link';

/** Quanto tempo o "Copiado!" fica no botão. */
const AVISO_COPIADO_MS = 2000;

/**
 * Ajuda o bar a contar aos clientes que dá para pedir pelo +party: a imagem
 * pronta para o Story do Instagram, textos para WhatsApp e Instagram e o
 * link do perfil do bar para a bio.
 */
@Component({
  selector: 'app-divulgar',
  imports: [Icone],
  templateUrl: './divulgar.html',
  styleUrl: './divulgar.scss',
})
export class Divulgar implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly estabelecimentos = inject(EstabelecimentosService);
  private readonly gerador = inject(GeradorStory);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly nome = signal('');
  protected readonly link = signal('');
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  /** A imagem do Story já desenhada, para a prévia e o download. */
  private story: Blob | null = null;
  protected readonly previaStory = signal<string | null>(null);
  protected readonly erroStory = signal(false);
  protected readonly copiado = signal<Texto | null>(null);
  private avisoCopiado?: ReturnType<typeof setTimeout>;

  protected readonly textoWhatsapp = computed(
    () =>
      `Agora dá para pedir pelo celular no ${this.nome()}! 🍻 Abra a comanda pelo +party, ` +
      `peça direto da mesa e acompanhe a conta na hora: ${this.link()}`,
  );

  protected readonly textoInstagram = computed(
    () =>
      `Novidade no ${this.nome()}: aqui você pede pelo +party! 📲\n` +
      `Abra a comanda no celular, peça direto da mesa, sem esperar o garçom, e veja a conta ` +
      `em tempo real. O link está na bio.\n#party #barcomamigos`,
  );

  async ngOnInit(): Promise<void> {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.avisoCopiado);
      const url = this.previaStory();
      if (url) URL.revokeObjectURL(url);
    });

    try {
      const id = (await this.auth.perfilAtual())?.estabelecimento?.id;
      const bar = id ? await this.estabelecimentos.buscarPorId(id) : null;
      if (!bar) throw new Error('sem bar');

      this.nome.set(bar.nome);
      this.link.set(`${location.origin}/cliente/estabelecimento/${bar.id}`);
      void this.desenharStory(bar.foto_url);
    } catch {
      this.erro.set('Não foi possível carregar os dados do bar. Tente de novo mais tarde.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected baixarStory(): void {
    if (!this.story) return;
    const url = URL.createObjectURL(this.story);
    const link = document.createElement('a');
    link.href = url;
    link.download = `story-${this.arquivo()}.png`;
    link.click();
    // Dá tempo ao navegador de começar o download antes de liberar o arquivo.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected async copiar(qual: Texto): Promise<void> {
    const texto = { whatsapp: this.textoWhatsapp(), instagram: this.textoInstagram(), link: this.link() }[qual];
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(qual);
      clearTimeout(this.avisoCopiado);
      this.avisoCopiado = setTimeout(() => this.copiado.set(null), AVISO_COPIADO_MS);
    } catch {
      // Sem permissão para a área de transferência: o texto continua na tela para copiar à mão.
      this.copiado.set(null);
    }
  }

  private async desenharStory(fotoUrl: string | null): Promise<void> {
    try {
      this.story = await this.gerador.gerar({ nome: this.nome(), fotoUrl, link: this.link() });
      this.previaStory.set(URL.createObjectURL(this.story));
    } catch {
      this.erroStory.set(true);
    }
  }

  /** "Bar D'Zé" → "bar-dze", para o nome do arquivo. */
  private arquivo(): string {
    return (
      this.nome()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'bar'
    );
  }
}
