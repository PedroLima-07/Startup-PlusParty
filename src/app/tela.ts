import { DestroyRef, Signal, inject, signal } from '@angular/core';

/** A mesma largura do `@include desktop` (src/styles/_desktop.scss). */
export const CONSULTA_DESKTOP = '(min-width: 1024px)';

/**
 * Se a tela está no layout de desktop, e acompanha quando a janela muda de
 * tamanho. Para as poucas diferenças que não são só de estilo (no desktop o
 * atendente age direto no cartão, sem a janela de confirmação).
 * Chamar no construtor do componente.
 */
export function telaDesktop(): Signal<boolean> {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return signal(false);
  }

  const consulta = window.matchMedia(CONSULTA_DESKTOP);
  const desktop = signal(consulta.matches);
  const aoMudar = (evento: MediaQueryListEvent) => desktop.set(evento.matches);

  consulta.addEventListener('change', aoMudar);
  inject(DestroyRef).onDestroy(() => consulta.removeEventListener('change', aoMudar));

  return desktop.asReadonly();
}
