import { Component, input } from '@angular/core';

/** Ampulheta animada mostrada enquanto os dados de uma tela chegam. */
@Component({
  selector: 'app-carregando',
  templateUrl: './carregando.html',
  styleUrl: './carregando.scss',
})
export class Carregando {
  /** Lido por leitores de tela; não aparece na tela. */
  readonly texto = input('Carregando');
}
