import { Estabelecimento } from './models';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

type Horario = Pick<Estabelecimento, 'horario_abre' | 'horario_fecha' | 'dias_abertos'>;

export interface StatusHorario {
  aberto: boolean;
  texto: string;
}

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** '02:00:00' -> '2h', '18:30:00' -> '18h30' */
export function formatarHora(hora: string): string {
  const [h, m] = hora.split(':').map(Number);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** {2,3,4,5,6} -> 'Ter a Sáb'; {0,3,4,5,6} -> 'Qua a Dom'; os 7 -> 'Todos os dias' */
export function resumirDias(dias: number[]): string {
  const unicos = [...new Set(dias)].sort((a, b) => a - b);
  if (unicos.length === 7) return 'Todos os dias';
  if (unicos.length === 1) return DIAS[unicos[0]];

  const inicio = unicos.find((d) => !unicos.includes((d + 6) % 7));
  if (inicio !== undefined) {
    const fim = (inicio + unicos.length - 1) % 7;
    const sequencia = unicos.every((d) => (d - inicio + 7) % 7 < unicos.length);
    if (sequencia) {
      return `${DIAS[inicio]} ${unicos.length === 2 ? 'e' : 'a'} ${DIAS[fim]}`;
    }
  }
  return unicos.map((d) => DIAS[d]).join(', ');
}

export function statusHorario(e: Horario, agora = new Date()): StatusHorario | null {
  if (!e.horario_abre || !e.horario_fecha || e.dias_abertos.length === 0) return null;

  const abre = minutos(e.horario_abre);
  const fecha = minutos(e.horario_fecha);
  const viraNoite = fecha <= abre;
  const dia = agora.getDay();
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  const abreHoje = e.dias_abertos.includes(dia);

  const abertoPelaNoiteDeOntem =
    viraNoite && e.dias_abertos.includes((dia + 6) % 7) && agoraMin < fecha;
  const abertoHoje = abreHoje && agoraMin >= abre && (viraNoite || agoraMin < fecha);

  if (abertoPelaNoiteDeOntem || abertoHoje) {
    return { aberto: true, texto: `Aberto agora · fecha às ${formatarHora(e.horario_fecha)}` };
  }

  const horaAbre = formatarHora(e.horario_abre);
  if (abreHoje && agoraMin < abre) {
    return { aberto: false, texto: `Fechado · abre hoje às ${horaAbre}` };
  }

  for (let k = 1; k <= 7; k++) {
    const proximo = (dia + k) % 7;
    if (e.dias_abertos.includes(proximo)) {
      const quando = k === 1 ? 'amanhã' : DIAS_EXTENSO[proximo];
      return { aberto: false, texto: `Fechado · abre ${quando} às ${horaAbre}` };
    }
  }
  return null;
}
