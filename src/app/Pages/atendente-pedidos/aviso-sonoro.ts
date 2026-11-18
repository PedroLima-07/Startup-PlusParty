// Som curto e vibração quando chega pedido novo na tela do bar.
//
// O navegador só deixa tocar som depois que a pessoa tocou na página: por isso
// o contexto de áudio é criado (ou retomado) no primeiro toque, em liberarSom().
// Com o celular bloqueado ou a aba em segundo plano o som não toca.

const CHAVE_SOM = 'atendente.som';

let contexto: AudioContext | null = null;

function criarContexto(): AudioContext | null {
  const Contexto =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Contexto ? new Contexto() : null;
}

/** Chamado a cada toque na tela: na primeira vez, libera o som. */
export function liberarSom(): void {
  try {
    contexto ??= criarContexto();
    if (contexto?.state === 'suspended') void contexto.resume();
  } catch {
    // Sem áudio no navegador: a tela segue sem som.
  }
}

/** Dois bipes curtos e uma vibração. Não faz nada se o som ainda não foi liberado. */
export function tocarAvisoPedido(): void {
  navigator.vibrate?.(200);
  if (!contexto || contexto.state !== 'running') return;

  try {
    const inicio = contexto.currentTime;
    for (const [atraso, frequencia] of [
      [0, 880],
      [0.18, 1175],
    ]) {
      const oscilador = contexto.createOscillator();
      const volume = contexto.createGain();
      oscilador.frequency.value = frequencia;
      volume.gain.setValueAtTime(0.18, inicio + atraso);
      volume.gain.exponentialRampToValueAtTime(0.001, inicio + atraso + 0.3);
      oscilador.connect(volume).connect(contexto.destination);
      oscilador.start(inicio + atraso);
      oscilador.stop(inicio + atraso + 0.3);
    }
  } catch {
    // Falha no áudio não pode atrapalhar a lista de pedidos.
  }
}

/** Preferência guardada no aparelho; começa ligado. */
export function lerSomLigado(): boolean {
  try {
    return localStorage.getItem(CHAVE_SOM) !== 'desligado';
  } catch {
    return true;
  }
}

export function guardarSomLigado(ligado: boolean): void {
  try {
    localStorage.setItem(CHAVE_SOM, ligado ? 'ligado' : 'desligado');
  } catch {
    // Sem armazenamento, a escolha vale só enquanto a tela estiver aberta.
  }
}
