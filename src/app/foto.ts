/** Maior lado da foto de perfil depois de reduzida, em pixels. */
const LADO_PERFIL = 512;
/** Maior lado da foto de uma postagem: nítida no desktop, leve no celular. */
const LADO_POSTAGEM = 1280;
const QUALIDADE_JPEG = 0.85;

/**
 * Reduz uma foto escolhida no celular (que pode ter vários MB) para um JPEG
 * pequeno, antes de enviar. Recorta no centro para ficar quadrada, que é como
 * a foto aparece no app.
 */
export async function prepararFotoDePerfil(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const lado = Math.min(imagem.width, imagem.height);
  const destino = Math.min(LADO_PERFIL, lado);

  return desenhar(
    imagem,
    { x: (imagem.width - lado) / 2, y: (imagem.height - lado) / 2, largura: lado, altura: lado },
    destino,
    destino,
  );
}

/** Reduz a foto de uma postagem sem cortar: o Feed mostra a foto inteira. */
export async function prepararFotoDePostagem(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_POSTAGEM / Math.max(imagem.width, imagem.height));

  return desenhar(
    imagem,
    { x: 0, y: 0, largura: imagem.width, altura: imagem.height },
    Math.round(imagem.width * escala),
    Math.round(imagem.height * escala),
  );
}

function desenhar(
  imagem: ImageBitmap,
  origem: { x: number; y: number; largura: number; altura: number },
  largura: number,
  altura: number,
): Promise<Blob> {
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  tela
    .getContext('2d')!
    .drawImage(imagem, origem.x, origem.y, origem.largura, origem.altura, 0, 0, largura, altura);
  imagem.close();

  return new Promise((resolver, rejeitar) =>
    tela.toBlob(
      (foto) => (foto ? resolver(foto) : rejeitar(new Error('Não foi possível ler a foto.'))),
      'image/jpeg',
      QUALIDADE_JPEG,
    ),
  );
}
