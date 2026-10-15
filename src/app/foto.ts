/** Maior lado da foto de perfil depois de reduzida, em pixels. */
const LADO_MAXIMO = 512;
const QUALIDADE_JPEG = 0.85;

/**
 * Reduz uma foto escolhida no celular (que pode ter vários MB) para um JPEG
 * pequeno, antes de enviar. Recorta no centro para ficar quadrada, que é como
 * a foto aparece no app.
 */
export async function prepararFotoDePerfil(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const lado = Math.min(imagem.width, imagem.height);
  const destino = Math.min(LADO_MAXIMO, lado);

  const tela = document.createElement('canvas');
  tela.width = destino;
  tela.height = destino;
  tela
    .getContext('2d')!
    .drawImage(
      imagem,
      (imagem.width - lado) / 2,
      (imagem.height - lado) / 2,
      lado,
      lado,
      0,
      0,
      destino,
      destino,
    );
  imagem.close();

  return new Promise((resolver, rejeitar) =>
    tela.toBlob(
      (foto) => (foto ? resolver(foto) : rejeitar(new Error('Não foi possível ler a foto.'))),
      'image/jpeg',
      QUALIDADE_JPEG,
    ),
  );
}
