import { Injectable } from '@angular/core';

/** Tamanho do Story do Instagram. */
export const LARGURA_STORY = 1080;
export const ALTURA_STORY = 1920;

const MARINHO = '#0f1f4b';
const AZUL = '#2f6bff';
const FONTE = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export interface DadosStory {
  nome: string;
  fotoUrl: string | null;
  /** Link do perfil do bar no +party, mostrado sem o https://. */
  link: string;
}

/**
 * Desenha a imagem do Story (1080×1920) no navegador: o logo do +party, a
 * foto e o nome do bar, "Peça pelo +party" e o link. Sem foto (ou se ela
 * não carregar), entra a inicial do bar no lugar.
 */
export async function gerarStory(dados: DadosStory): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA_STORY;
  canvas.height = ALTURA_STORY;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não consegue gerar a imagem.');

  const [foto] = await Promise.all([
    dados.fotoUrl ? carregarImagem(dados.fotoUrl).catch(() => null) : Promise.resolve(null),
    // Sem esperar a fonte, o primeiro desenho sai com a fonte padrão.
    document.fonts?.load(`800 88px ${FONTE}`).catch(() => undefined),
  ]);

  desenharFundo(ctx);
  desenharLogo(ctx, 190);
  desenharFoto(ctx, foto, dados.nome, { x: 80, y: 320, tamanho: 920 });
  desenharTextos(ctx, dados);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.'))),
      'image/png',
    ),
  );
}

/** O desenho do Story como serviço, para os testes trocarem por um arquivo qualquer (jsdom não tem canvas). */
@Injectable({ providedIn: 'root' })
export class GeradorStory {
  gerar(dados: DadosStory): Promise<Blob> {
    return gerarStory(dados);
  }
}

/** "https://site.com/x" → "site.com/x", mais curto para ler na imagem. */
export function linkSemProtocolo(link: string): string {
  return link.replace(/^https?:\/\//, '');
}

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const imagem = new Image();
    // Fotos do Supabase vêm de outro endereço: sem isso o canvas não exporta.
    imagem.crossOrigin = 'anonymous';
    imagem.onload = () => resolve(imagem);
    imagem.onerror = reject;
    imagem.src = url;
  });
}

function desenharFundo(ctx: CanvasRenderingContext2D): void {
  const fundo = ctx.createLinearGradient(0, 0, 0, ALTURA_STORY);
  fundo.addColorStop(0, MARINHO);
  fundo.addColorStop(0.6, '#173275');
  fundo.addColorStop(1, AZUL);
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, LARGURA_STORY, ALTURA_STORY);
}

/** O "+" num quadrado azul e "party" ao lado, centralizados. */
function desenharLogo(ctx: CanvasRenderingContext2D, centroY: number): void {
  const icone = 96;
  ctx.font = `800 72px ${FONTE}`;
  const larguraTexto = ctx.measureText('party').width;
  const inicio = (LARGURA_STORY - (icone + 20 + larguraTexto)) / 2;

  ctx.fillStyle = AZUL;
  caminhoArredondado(ctx, inicio, centroY - icone / 2, icone, icone, 24);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('+', inicio + icone / 2, centroY + 4);
  ctx.textAlign = 'left';
  ctx.fillText('party', inicio + icone + 20, centroY + 4);
}

function desenharFoto(
  ctx: CanvasRenderingContext2D,
  foto: HTMLImageElement | null,
  nome: string,
  area: { x: number; y: number; tamanho: number },
): void {
  const { x, y, tamanho } = area;
  ctx.save();
  caminhoArredondado(ctx, x, y, tamanho, tamanho, 56);
  ctx.clip();

  if (foto) {
    // Recorta o meio da foto num quadrado, como o object-fit: cover.
    const lado = Math.min(foto.naturalWidth, foto.naturalHeight);
    const sx = (foto.naturalWidth - lado) / 2;
    const sy = (foto.naturalHeight - lado) / 2;
    ctx.drawImage(foto, sx, sy, lado, lado, x, y, tamanho, tamanho);
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(x, y, tamanho, tamanho);
    ctx.fillStyle = '#fff';
    ctx.font = `800 360px ${FONTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nome.charAt(0).toUpperCase(), x + tamanho / 2, y + tamanho / 2 + 20);
  }
  ctx.restore();
}

function desenharTextos(ctx: CanvasRenderingContext2D, dados: DadosStory): void {
  const centro = LARGURA_STORY / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';

  // Nome grande, diminuindo até caber numa linha.
  let tamanho = 96;
  do {
    ctx.font = `800 ${tamanho}px ${FONTE}`;
    tamanho -= 4;
  } while (ctx.measureText(dados.nome).width > LARGURA_STORY - 140 && tamanho > 48);
  ctx.fillText(dados.nome, centro, 1360);

  // "Peça pelo +party" numa pílula branca.
  ctx.font = `800 60px ${FONTE}`;
  const chamada = 'Peça pelo +party';
  const largura = ctx.measureText(chamada).width + 120;
  ctx.fillStyle = '#fff';
  caminhoArredondado(ctx, centro - largura / 2, 1460, largura, 120, 60);
  ctx.fill();
  ctx.fillStyle = MARINHO;
  ctx.fillText(chamada, centro, 1522);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.font = `500 40px ${FONTE}`;
  ctx.fillText('Abra a comanda no celular e peça direto da mesa', centro, 1660);

  ctx.fillStyle = '#fff';
  ctx.font = `700 40px ${FONTE}`;
  ctx.fillText(linkSemProtocolo(dados.link), centro, 1800, LARGURA_STORY - 120);
}

function caminhoArredondado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  largura: number,
  altura: number,
  raio: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, raio);
  ctx.arcTo(x + largura, y + altura, x, y + altura, raio);
  ctx.arcTo(x, y + altura, x, y, raio);
  ctx.arcTo(x, y, x + largura, y, raio);
  ctx.closePath();
}
