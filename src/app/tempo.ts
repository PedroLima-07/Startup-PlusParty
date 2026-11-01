import { DestroyRef, Signal, inject, signal } from '@angular/core';

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

/** Tempo de espera em texto: "12 min", "3 h" ou "21 dias". */
export function duracaoEspera(valor: number | null): string {
  const minutos = valor ?? 0;
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 24 * 60) {
    const resto = minutos % 60;
    return `${Math.floor(minutos / 60)} h${resto ? ` ${resto} min` : ''}`;
  }
  const dias = Math.floor(minutos / (24 * 60));
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

/** Minutos inteiros desde `data` (nunca negativo). */
export function minutosDesde(data: string, agora = Date.now()): number {
  return Math.max(0, Math.floor((agora - new Date(data).getTime()) / MINUTO));
}

/**
 * Hora atual que se atualiza sozinha, para "há X min" andar na tela sem
 * recarregar. Chame no construtor (precisa do contexto de injeção).
 */
export function relogio(intervaloMs = 30_000): Signal<number> {
  const agora = signal(Date.now());
  const timer = setInterval(() => agora.set(Date.now()), intervaloMs);
  inject(DestroyRef).onDestroy(() => clearInterval(timer));
  return agora.asReadonly();
}
