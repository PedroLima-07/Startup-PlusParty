import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GoogleMapsService, linkComoChegar } from '../../services/google-maps.service';
import { linkDaNotificacao } from '../../services/notificacoes.service';
import { Mapa } from './mapa';

describe('Mapa', () => {
  async function montar(modo: 'ver' | 'escolher'): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [Mapa],
      providers: [
        provideRouter([]),
        // Sem chave: é como o app fica até o Google Cloud ser configurado.
        { provide: GoogleMapsService, useValue: { temChave: false, carregar: async () => null } },
      ],
    });
    const fixture = TestBed.createComponent(Mapa);
    fixture.componentRef.setInput('modo', modo);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((pronto) => setTimeout(pronto));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('sem a chave do Google, avisa que o mapa está indisponível e manda usar a lista', async () => {
    const el = await montar('ver');
    expect(el.textContent).toContain('Mapa indisponível');
    expect(el.textContent).toContain('Use a lista');
  });

  it('no modo de escolher, explica que o "Como chegar" usa o endereço', async () => {
    const el = await montar('escolher');
    expect(el.textContent).toContain('O "Como chegar" usa o endereço');
  });
});

describe('linkComoChegar', () => {
  it('usa o ponto do mapa quando o bar marcou', () => {
    expect(linkComoChegar({ latitude: -23.5, longitude: -46.6, endereco: 'Rua A, 1' })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-23.5%2C-46.6',
    );
  });

  it('sem ponto, usa o endereço; sem nada, não tem link', () => {
    expect(linkComoChegar({ latitude: null, longitude: null, endereco: 'Rua A, 1' })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Rua%20A%2C%201',
    );
    expect(linkComoChegar({ latitude: null, longitude: null, endereco: null })).toBeNull();
  });
});

describe('linkDaNotificacao', () => {
  it('lembrete de evento abre o perfil do bar na aba Agenda', () => {
    expect(linkDaNotificacao({ tipo: 'evento_lembrete', link: '/cliente/estabelecimento/b1' })).toBe(
      '/cliente/estabelecimento/b1?aba=agenda',
    );
    expect(linkDaNotificacao({ tipo: 'pedido_pronto', link: '/cliente/comanda/c1' })).toBe('/cliente/comanda/c1');
  });
});
