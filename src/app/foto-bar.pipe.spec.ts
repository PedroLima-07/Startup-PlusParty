import { fotoDoBar, srcsetDoBar } from './foto-bar.pipe';

describe('fotos dos bares em tamanhos menores', () => {
  it('aceita o endereço como vem do banco, sem a barra inicial', () => {
    expect(fotoDoBar('img/estabelecimentos/bar-dze.jpg', 480)).toBe('img/estabelecimentos/bar-dze-480.webp');
  });

  it('troca a foto do app pela versão na largura pedida', () => {
    expect(fotoDoBar('/img/estabelecimentos/bar-dze.jpg', 160)).toBe('/img/estabelecimentos/bar-dze-160.webp');
    expect(fotoDoBar('/img/estabelecimentos/vinil-bar.webp', 480)).toBe('/img/estabelecimentos/vinil-bar-480.webp');
  });

  it('monta o srcset com as três larguras', () => {
    expect(srcsetDoBar('/img/estabelecimentos/neon-club.jpg')).toBe(
      '/img/estabelecimentos/neon-club-160.webp 160w, /img/estabelecimentos/neon-club-480.webp 480w, /img/estabelecimentos/neon-club-960.webp 960w',
    );
  });

  it('foto enviada pelo gerente (Storage) segue como está', () => {
    const doStorage = 'https://exemplo.supabase.co/storage/v1/object/public/estabelecimentos/abc/foto.jpg';

    expect(fotoDoBar(doStorage, 160)).toBe(doStorage);
    expect(srcsetDoBar(doStorage)).toBeNull();
  });

  it('sem foto, nada', () => {
    expect(fotoDoBar(null, 480)).toBeNull();
    expect(srcsetDoBar(undefined)).toBeNull();
  });
});
