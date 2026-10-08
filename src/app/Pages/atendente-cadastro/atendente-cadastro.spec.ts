import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MinhaSolicitacaoEquipe } from '../../models';
import { AuthService, PerfilAtual } from '../../services/auth.service';
import { EquipeService } from '../../services/equipe.service';
import { EstabelecimentosService } from '../../services/estabelecimentos.service';
import { AtendenteCadastroPage } from './atendente-cadastro';

const CLIENTE: PerfilAtual = { nome: 'Gil', tipo: 'cliente', estabelecimento: null };

describe('AtendenteCadastroPage', () => {
  let fixture: ComponentFixture<AtendenteCadastroPage>;
  let router: Router;
  let perfil: PerfilAtual | null;
  let solicitacao: MinhaSolicitacaoEquipe | null;
  let sessaoDepoisDoCadastro: boolean;
  let cadastrar: ReturnType<typeof vi.fn>;
  let solicitar: ReturnType<typeof vi.fn>;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function preencher(seletor: string, valor: string): void {
    const campo = tela().querySelector<HTMLInputElement | HTMLSelectElement>(seletor)!;
    campo.value = valor;
    campo.dispatchEvent(new Event(campo instanceof HTMLSelectElement ? 'change' : 'input'));
  }

  async function enviar(): Promise<void> {
    tela().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  async function abrir(): Promise<void> {
    cadastrar = vi.fn().mockResolvedValue(undefined);
    solicitar = vi.fn().mockResolvedValue(undefined);

    const authService = {
      perfilAtual: () => Promise.resolve(perfil),
      // Depois do cadastro a sessão existe, a não ser com confirmação de e-mail ligada.
      usuarioAtual: () => Promise.resolve(sessaoDepoisDoCadastro ? { id: 'u1' } : null),
      cadastrar,
      telaInicial: () => '/atendente/pedidos',
    };

    await TestBed.configureTestingModule({
      imports: [AtendenteCadastroPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        {
          provide: EquipeService,
          useValue: { buscarMinhaSolicitacao: () => Promise.resolve(solicitacao), solicitar },
        },
        {
          provide: EstabelecimentosService,
          useValue: { listar: () => Promise.resolve([{ id: 'b1', nome: 'Neon Club' }]) },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(AtendenteCadastroPage);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    perfil = null;
    solicitacao = null;
    sessaoDepoisDoCadastro = true;
  });

  it('para quem não tem conta, pede os dados da conta, o telefone e o bar', async () => {
    await abrir();

    expect(tela().querySelector('input[type=email]')).not.toBeNull();
    expect(tela().querySelector('input[type=password]')).not.toBeNull();
    expect(tela().querySelector('input[type=tel]')).not.toBeNull();
    expect(tela().querySelector('select')?.textContent).toContain('Neon Club');
  });

  it('cria a conta, envia o pedido e vai para a tela de espera', async () => {
    await abrir();
    preencher('input[type=text]', ' Gil ');
    preencher('input[type=email]', 'gil@party.app');
    preencher('input[type=password]', 'senha123');
    preencher('input[type=tel]', '(15) 99999-0000');
    preencher('select', 'b1');

    await enviar();

    expect(cadastrar).toHaveBeenCalledWith('Gil', 'gil@party.app', 'senha123');
    expect(solicitar).toHaveBeenCalledWith('b1', '(15) 99999-0000');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/atendente/aguardando', { replaceUrl: true });
  });

  it('não envia sem telefone válido ou sem bar', async () => {
    await abrir();
    preencher('input[type=text]', 'Gil');
    preencher('input[type=email]', 'gil@party.app');
    preencher('input[type=password]', 'senha123');
    preencher('input[type=tel]', 'abc');

    await enviar();

    expect(cadastrar).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Informe um telefone com DDD');
    expect(tela().textContent).toContain('Escolha o bar');
  });

  it('com confirmação de e-mail ligada, avisa e não tenta enviar o pedido', async () => {
    sessaoDepoisDoCadastro = false;
    await abrir();
    preencher('input[type=text]', 'Gil');
    preencher('input[type=email]', 'gil@party.app');
    preencher('input[type=password]', 'senha123');
    preencher('input[type=tel]', '15999990000');
    preencher('select', 'b1');

    await enviar();

    expect(solicitar).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Confirme o e-mail');
  });

  it('se o pedido falhar depois de criar a conta, tentar de novo não cadastra outra vez', async () => {
    await abrir();
    solicitar.mockRejectedValueOnce(new Error('sem rede'));
    preencher('input[type=text]', 'Gil');
    preencher('input[type=email]', 'gil@party.app');
    preencher('input[type=password]', 'senha123');
    preencher('input[type=tel]', '15999990000');
    preencher('select', 'b1');

    await enviar();
    expect(tela().textContent).toContain('Sua conta foi criada, mas não foi possível enviar o pedido');
    expect(tela().querySelector('input[type=password]')).toBeNull();

    await enviar();
    expect(cadastrar).toHaveBeenCalledTimes(1);
    expect(solicitar).toHaveBeenCalledTimes(2);
  });

  it('para o cliente já logado, pede só o telefone e o bar', async () => {
    perfil = CLIENTE;
    await abrir();

    expect(tela().querySelector('input[type=password]')).toBeNull();
    expect(tela().textContent).toContain('Pedido em nome de Gil');

    preencher('input[type=tel]', '15999990000');
    preencher('select', 'b1');
    await enviar();

    expect(cadastrar).not.toHaveBeenCalled();
    expect(solicitar).toHaveBeenCalledWith('b1', '15999990000');
  });

  it('quem já pediu é levado para a tela de espera', async () => {
    perfil = CLIENTE;
    solicitacao = { id: 's1', status: 'pendente', estabelecimento: { nome: 'Neon Club' } };
    await abrir();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/atendente/aguardando', { replaceUrl: true });
  });

  it('quem já trabalha num bar é levado para a própria tela inicial', async () => {
    perfil = { nome: 'Ana', tipo: 'funcionario', estabelecimento: { id: 'b1', nome: 'Neon Club' } };
    await abrir();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/atendente/pedidos', { replaceUrl: true });
  });
});
