import { TestBed } from '@angular/core/testing';
import { NovaPostagem, Postagem } from '../models';
import { AuthService } from './auth.service';
import { PostagemService, descontoPercentual, emVigor } from './postagem.service';
import { SupabaseService } from './supabase.service';

const NOVA: NovaPostagem = {
  tipo: 'bebida',
  titulo: 'Happy hour',
  texto: null,
  preco: 9,
  preco_antigo: 12,
  valida_ate: null,
};

describe('postagens: regras', () => {
  it('calcula o desconto só quando há preço normal', () => {
    expect(descontoPercentual({ preco: 9, preco_antigo: 12 })).toBe(25);
    expect(descontoPercentual({ preco: 28, preco_antigo: null })).toBeNull();
    expect(descontoPercentual({ preco: null, preco_antigo: null })).toBeNull();
  });

  it('postagem sem prazo vale sempre; com prazo, até ele passar', () => {
    const agora = new Date('2026-10-15T22:00:00Z');

    expect(emVigor({ valida_ate: null }, agora)).toBe(true);
    expect(emVigor({ valida_ate: '2026-10-16T02:59:59Z' }, agora)).toBe(true);
    expect(emVigor({ valida_ate: '2026-10-15T21:00:00Z' }, agora)).toBe(false);
  });
});

describe('PostagemService.publicar', () => {
  let service: PostagemService;
  let inserido: unknown;
  let respostaInsert: { data: unknown; error: unknown };
  let upload: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    inserido = null;
    respostaInsert = { data: { id: 'p1', ...NOVA, preco: '9.00', preco_antigo: '12.00' }, error: null };
    upload = vi.fn().mockResolvedValue({ error: null });
    remove = vi.fn().mockResolvedValue({ error: null });

    const consulta = {
      insert: (linha: unknown) => {
        inserido = linha;
        return consulta;
      },
      select: () => consulta,
      single: () => Promise.resolve(respostaInsert),
    };

    const supabase = {
      client: {
        from: () => consulta,
        storage: {
          from: () => ({
            upload,
            remove,
            getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://fotos/${caminho}` } }),
          }),
        },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: supabase },
        {
          provide: AuthService,
          useValue: {
            perfilAtual: () =>
              Promise.resolve({ nome: 'Zé', tipo: 'gerente', estabelecimento: { id: 'bar1', nome: 'Bar' } }),
          },
        },
      ],
    });
    service = TestBed.inject(PostagemService);
  });

  it('grava no bar do gerente e devolve os preços como número', async () => {
    const postagem = await service.publicar(NOVA, null);

    expect(inserido).toEqual({ ...NOVA, estabelecimento_id: 'bar1', imagem_url: null });
    expect(upload).not.toHaveBeenCalled();
    expect(postagem.preco).toBe(9);
    expect(postagem.preco_antigo).toBe(12);
  });

  it('envia a foto para a pasta do bar antes de gravar', async () => {
    await service.publicar(NOVA, new Blob(['foto']));

    const caminho = upload.mock.calls[0][0] as string;
    expect(caminho).toMatch(/^bar1\/\d+\.jpg$/);
    expect(inserido).toMatchObject({ imagem_url: `https://fotos/${caminho}` });
  });

  it('se a postagem não for gravada, apaga a foto enviada', async () => {
    respostaInsert = { data: null, error: { message: 'sem permissão' } };

    await expect(service.publicar(NOVA, new Blob(['foto']))).rejects.toBeTruthy();
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });
});

describe('PostagemService.editar', () => {
  const FOTO_ANTIGA = 'https://x.supabase.co/storage/v1/object/public/postagens/bar1/1.jpg';
  const ORIGINAL: Postagem = {
    id: 'p1',
    estabelecimento_id: 'bar1',
    ...NOVA,
    imagem_url: FOTO_ANTIGA,
    criada_em: '2026-10-20T20:00:00Z',
  };

  let service: PostagemService;
  let alterado: unknown;
  let filtro: unknown;
  let resposta: { data: unknown; error: unknown };
  let upload: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    alterado = null;
    resposta = { data: { ...ORIGINAL, titulo: 'Novo' }, error: null };
    upload = vi.fn().mockResolvedValue({ error: null });
    remove = vi.fn().mockResolvedValue({ error: null });

    const consulta = {
      update: (linha: unknown) => {
        alterado = linha;
        return consulta;
      },
      eq: (coluna: string, valor: unknown) => {
        filtro = [coluna, valor];
        return consulta;
      },
      select: () => consulta,
      single: () => Promise.resolve(resposta),
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: () => consulta,
              storage: {
                from: () => ({
                  upload,
                  remove,
                  getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://fotos/${caminho}` } }),
                }),
              },
            },
          },
        },
        { provide: AuthService, useValue: {} },
      ],
    });
    service = TestBed.inject(PostagemService);
  });

  it('mantendo a foto, grava só os dados naquela postagem', async () => {
    await service.editar(ORIGINAL, { ...NOVA, titulo: 'Novo' }, 'manter');

    expect(filtro).toEqual(['id', 'p1']);
    expect(alterado).toEqual({ ...NOVA, titulo: 'Novo', imagem_url: FOTO_ANTIGA });
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('trocando a foto, envia a nova e apaga a antiga depois de gravar', async () => {
    await service.editar(ORIGINAL, NOVA, new Blob(['nova']));

    const caminho = upload.mock.calls[0][0] as string;
    expect(caminho).toMatch(/^bar1\/\d+\.jpg$/);
    expect(alterado).toMatchObject({ imagem_url: `https://fotos/${caminho}` });
    expect(remove).toHaveBeenCalledWith(['bar1/1.jpg']);
  });

  it('removendo a foto, a postagem fica sem imagem e o arquivo sai', async () => {
    await service.editar(ORIGINAL, NOVA, 'remover');

    expect(alterado).toMatchObject({ imagem_url: null });
    expect(remove).toHaveBeenCalledWith(['bar1/1.jpg']);
  });

  it('se não gravar, apaga a foto nova e mantém a antiga', async () => {
    resposta = { data: null, error: { message: 'sem permissão' } };

    await expect(service.editar(ORIGINAL, NOVA, new Blob(['nova']))).rejects.toBeTruthy();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });
});
