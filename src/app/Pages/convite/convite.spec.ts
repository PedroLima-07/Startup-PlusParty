import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ConviteInfo } from '../../models';
import { AuthService, PerfilAtual } from '../../services/auth.service';
import { EquipeService } from '../../services/equipe.service';
import { ConvitePage } from './convite';

const VALIDO: ConviteInfo = { estabelecimento_nome: "Bar D'Zé", situacao: 'valido' };
const CLIENTE: PerfilAtual = { nome: 'Gil', tipo: 'cliente', estabelecimento: null };

describe('ConvitePage', () => {
  let fixture: ComponentFixture<ConvitePage>;
  let router: Router;
  let convite: ConviteInfo | null;
  let perfil: PerfilAtual | null;
  let sessaoDepoisDoCadastro: boolean;
  let cadastrar: ReturnType<typeof vi.fn>;
  let aceitarConvite: ReturnType<typeof vi.fn>;
  let confirmarEmail: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function preencher(seletor: string, valor: string): void {
    const campo = tela().querySelector<HTMLInputElement>(seletor)!;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
  }

  function preencherConta(): void {
    preencher('input[type=text]', ' Gil ');
    preencher('input[type=email]', 'gil@party.app');
    preencher('input[type=password]', 'senha123');
  }

  async function enviar(): Promise<void> {
    tela().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  async function abrir(): Promise<void> {
    cadastrar = vi.fn().mockResolvedValue(undefined);
    aceitarConvite = vi.fn().mockResolvedValue(undefined);
    confirmarEmail = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [ConvitePage],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            perfilAtual: () => Promise.resolve(perfil),
            usuarioAtual: () => Promise.resolve(sessaoDepoisDoCadastro ? { id: 'u1' } : null),
            cadastrar,
            confirmarEmail,
            reenviarCodigo: vi.fn().mockResolvedValue(undefined),
            atualizarFoto: vi.fn(),
            telaInicial: () => '/atendente/pedidos',
          },
        },
        {
          provide: EquipeService,
          useValue: { verConvite: () => Promise.resolve(convite), aceitarConvite },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(ConvitePage);
    fixture.componentRef.setInput('codigo', 'A3F9-C17B-2D40');
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    convite = VALIDO;
    perfil = null;
    sessaoDepoisDoCadastro = true;
  });

  it('mostra o bar do convite e pede a conta, a foto e o telefone, sem lista de bares', async () => {
    await abrir();

    expect(tela().textContent).toContain("Bar D'Zé");
    expect(tela().textContent).toContain('Adicionar foto');
    expect(tela().querySelector('input[type=password]')).not.toBeNull();
    expect(tela().querySelector('input[type=tel]')).not.toBeNull();
    expect(tela().querySelector('select')).toBeNull();
  });

  it('cria a conta, aceita o convite e vai para a tela de espera', async () => {
    await abrir();
    preencherConta();
    preencher('input[type=tel]', '(15) 99999-0000');

    await enviar();

    expect(cadastrar).toHaveBeenCalledWith('Gil', 'gil@party.app', 'senha123');
    expect(aceitarConvite).toHaveBeenCalledWith('A3F9-C17B-2D40', '(15) 99999-0000');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/atendente/aguardando', { replaceUrl: true });
  });

  it('cliente já logado só completa o telefone', async () => {
    perfil = CLIENTE;
    await abrir();

    expect(tela().querySelector('input[type=password]')).toBeNull();
    expect(tela().textContent).toContain('Pedido em nome de Gil');

    preencher('input[type=tel]', '15999990000');
    await enviar();

    expect(cadastrar).not.toHaveBeenCalled();
    expect(aceitarConvite).toHaveBeenCalledWith('A3F9-C17B-2D40', '15999990000');
  });

  it('quem já tem conta pode entrar e voltar para este convite', async () => {
    await abrir();
    const entrar = Array.from(tela().querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Entrar e aceitar'),
    )!;

    expect(entrar.getAttribute('href')).toBe('/login?voltar=%2Fconvite%2FA3F9-C17B-2D40');
  });

  it('mostra a frase do banco quando o convite é recusado na hora de aceitar', async () => {
    perfil = CLIENTE;
    await abrir();
    aceitarConvite.mockRejectedValueOnce({ code: 'P0001', message: 'Este convite já foi usado. Peça um novo ao gerente.' });

    preencher('input[type=tel]', '15999990000');
    await enviar();

    expect(tela().textContent).toContain('Este convite já foi usado');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('com confirmação de e-mail ligada, pede o código antes de aceitar', async () => {
    sessaoDepoisDoCadastro = false;
    await abrir();
    preencherConta();
    preencher('input[type=tel]', '15999990000');

    await enviar();

    expect(aceitarConvite).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Confirme seu e-mail');
    expect(tela().textContent).toContain('gil@party.app');
    expect(tela().querySelector('form input[type=password]')).toBeNull();
  });

  it('depois do código, o pedido segue sozinho, sem abrir o link de novo', async () => {
    sessaoDepoisDoCadastro = false;
    await abrir();
    preencherConta();
    preencher('input[type=tel]', '15999990000');
    await enviar();

    preencher('input[autocomplete=one-time-code]', '123456');
    await fixture.whenStable();
    await new Promise((resolver) => setTimeout(resolver));

    expect(confirmarEmail).toHaveBeenCalledWith('gil@party.app', '123456');
    expect(aceitarConvite).toHaveBeenCalledWith('A3F9-C17B-2D40', '15999990000');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/atendente/aguardando', { replaceUrl: true });
  });

  it('convite usado ou expirado não mostra o formulário', async () => {
    convite = { estabelecimento_nome: "Bar D'Zé", situacao: 'expirado' };
    await abrir();

    expect(tela().querySelector('form')).toBeNull();
    expect(tela().textContent).toContain('Este convite expirou');
  });

  it('código que não existe avisa que o convite não foi encontrado', async () => {
    convite = null;
    await abrir();

    expect(tela().querySelector('form')).toBeNull();
    expect(tela().textContent).toContain('Convite não encontrado');
  });

  it('quem já trabalha num bar é levado para a própria tela', async () => {
    perfil = { nome: 'Ana', tipo: 'funcionario', estabelecimento: { id: 'b1', nome: "Bar D'Zé" } };
    await abrir();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/atendente/pedidos', { replaceUrl: true });
  });
});
