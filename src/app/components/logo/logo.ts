import { Component, input } from '@angular/core';

/**
 * A logo do +party (arte do Kauê), igual em todas as telas. A largura é a
 * única coisa que muda de um lugar para outro; a altura acompanha.
 */
@Component({
  selector: 'app-logo',
  template: `<img src="/img/logo/logo-plusparty.png" alt="+party" width="640" height="415" [style.width.px]="largura()" />`,
  styles: `
    :host {
      display: inline-flex;
    }

    img {
      display: block;
      height: auto;
    }
  `,
})
export class Logo {
  readonly largura = input(160);
}
