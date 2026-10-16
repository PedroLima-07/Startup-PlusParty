const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" ou a data (dd/mm). */
export function haQuantoTempo(data: string, agora = new Date()): string {
  const passou = agora.getTime() - new Date(data).getTime();

  if (passou < MINUTO) return 'agora';
  if (passou < HORA) return `há ${Math.floor(passou / MINUTO)} min`;
  if (passou < DIA) return `há ${Math.floor(passou / HORA)} h`;
  if (passou < 2 * DIA) return 'ontem';
  if (passou < 7 * DIA) return `há ${Math.floor(passou / DIA)} dias`;

  const quando = new Date(data);
  return `${String(quando.getDate()).padStart(2, '0')}/${String(quando.getMonth() + 1).padStart(2, '0')}`;
}
