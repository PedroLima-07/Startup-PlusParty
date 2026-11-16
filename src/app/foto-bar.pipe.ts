import { Pipe, PipeTransform } from '@angular/core';

/** Larguras geradas para cada foto de bar em `public/img/estabelecimentos`. */
export const LARGURAS_FOTO_BAR = [160, 480, 960] as const;
export type LarguraFotoBar = (typeof LARGURAS_FOTO_BAR)[number];

// Fotos dos bares que vêm com o app: para cada uma existem versões menores em
// WebP (bar-dze-160.webp, bar-dze-480.webp...). Fotos enviadas pelo gerente
// ficam no Storage e seguem no tamanho original. No banco o endereço vem
// sem a barra inicial (img/estabelecimentos/...), e ela é mantida como veio.
const FOTO_DO_APP = /^(\/?img\/estabelecimentos\/)([\w-]+)\.(?:jpe?g|png|webp)$/;

/** Endereço da versão da foto com a largura pedida, ou a própria foto se não houver versões. */
export function fotoDoBar(url: string | null | undefined, largura: LarguraFotoBar): string | null {
  if (!url) return null;
  const partes = FOTO_DO_APP.exec(url);
  return partes ? `${partes[1]}${partes[2]}-${largura}.webp` : url;
}

/** `srcset` com todas as versões, para o navegador escolher pelo tamanho da tela; null sem versões. */
export function srcsetDoBar(url: string | null | undefined): string | null {
  if (!url || !FOTO_DO_APP.test(url)) return null;
  return LARGURAS_FOTO_BAR.map((largura) => `${fotoDoBar(url, largura)} ${largura}w`).join(', ');
}

/** `[src]="bar.foto_url | fotoBar: 480"`: a foto do bar no tamanho em que aparece. */
@Pipe({ name: 'fotoBar' })
export class FotoBarPipe implements PipeTransform {
  transform(url: string | null | undefined, largura: LarguraFotoBar): string | null {
    return fotoDoBar(url, largura);
  }
}

/** `[attr.srcset]="bar.foto_url | srcsetBar"`, junto com um `sizes`. */
@Pipe({ name: 'srcsetBar' })
export class SrcsetBarPipe implements PipeTransform {
  transform(url: string | null | undefined): string | null {
    return srcsetDoBar(url);
  }
}
