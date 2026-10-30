import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** E-mail da equipe para pedidos sobre dados pessoais (LGPD). */
export const CONTATO_PRIVACIDADE = 'technomind.pp@gmail.com';

/** Data da versão em vigor dos textos. Mude junto quando o texto mudar. */
export const ATUALIZADO_EM = '29 de outubro de 2026';

/**
 * Política de Privacidade e Termos de Uso do +party (rotas /privacidade e
 * /termos, abertas sem login). O texto descreve o que o app faz hoje: se uma
 * tela passar a coletar outro dado, atualize aqui também.
 */
@Component({
  selector: 'app-legal',
  imports: [RouterLink],
  templateUrl: './legal.html',
  styleUrl: './legal.scss',
})
export class LegalPage {
  /** Vem do `data` da rota. */
  readonly documento = input<'privacidade' | 'termos'>('privacidade');

  protected readonly contato = CONTATO_PRIVACIDADE;
  protected readonly atualizadoEm = ATUALIZADO_EM;

  protected voltar(): void {
    history.length > 1 ? history.back() : location.assign('/');
  }
}
