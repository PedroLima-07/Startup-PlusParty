import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MinhaSolicitacaoEquipe, StatusSolicitacaoEquipe } from '../../models';
import { AuthService } from '../../services/auth.service';
import { EquipeService } from '../../services/equipe.service';
import { SupabaseService } from '../../services/supabase.service';
import { AtendenteAguardandoPage } from './atendente-aguardando';

function pedido(status: StatusSolicitacaoEquipe): MinhaSolicitacaoEquipe {
  return { id: 's1', status, estabelecimento: { nome: 'Neon Club' } };
}

describe('AtendenteAguardandoPage', () => {
  let fixture: ComponentFixture<AtendenteAguardandoPage>;
  let router: Router;
  let buscarMinhaSolicitacao: ReturnType<typeof vi.fn>;
  let desistir: ReturnType<typeof vi.fn>;
  let esquecerPerfil: ReturnType<typeof vi.fn>;
  let escutarMudancas: ReturnType<typeof vi.fn>;
  let avisarMudanca: () => void;

  function tela(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(texto: string): HTMLButtonElement {
    return Array.from(tela().querySelectorAll('button')).find((b) =>
      b.textContent?.includes(texto),
    )!;
  }

  async function abrir(solicitacao: MinhaSolicitacaoEquipe | null): Promise<void> {
    buscarMinhaSolicitacao = vi.fn().mockResolvedValue(solicitacao);
    desistir = vi.fn().mockResolvedValue(undefined);
    esquecerPerfil = vi.fn();
    escutarMudancas = vi.fn((_tabelas: unknown, aoMudar: () => void) => {
      avisarMudanca = aoMudar;
      return () => undefined;
    });

    await TestBed.configureTestingModule({
      imports: [AtendenteAguardandoPage],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { usuarioAtual: () => Promise.resolve({ id: 'u1' }), esquecerPerfil },
        },
        { provide: EquipeService, useValue: { buscarMinhaSolicitacao, desistir } },
        { provide: SupabaseService, useValue: { escutarMudancas } },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(AtendenteAguardandoPage);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('enquanto o gerente não responde, mostra a espera e o nome do bar', async () => {
    await abrir(pedido('pendente'));

    expect(tela().textContent).toContain('Aguardando liberação');
    expect(tela().textContent).toContain('Neon Club');
  });

  it('escuta só as mudanças do pedido de quem está logado', async () => {
    await abrir(pedido('pendente'));

    expect(escutarMudancas.mock.calls[0][0]).toEqual([
      { tabela: 'solicitacoes_equipe', filtro: 'usuario_id=eq.u1' },
    ]);
  });

  it('muda sozinha quando o gerente aprova', async () => {
    await abrir(pedido('pendente'));
    buscarMinhaSolicitacao.mockResolvedValue(pedido('aprovada'));

    avisarMudanca();
    await fixture.whenStable();

    expect(tela().textContent).toContain('Acesso liberado!');
  });

  it('aprovado: descarta o perfil guardado antes de entrar na área do atendente', async () => {
    await abrir(pedido('aprovada'));

    botao('Entrar na área do atendente').click();
    await fixture.whenStable();

    expect(esquecerPerfil).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/atendente/pedidos', { replaceUrl: true });
  });

  it('cancelar o pedido apaga a solicitação e volta para a home', async () => {
    await abrir(pedido('pendente'));

    botao('Cancelar pedido').click();
    await fixture.whenStable();

    expect(desistir).toHaveBeenCalledWith('s1');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/cliente/home', { replaceUrl: true });
  });

  it('recusado: pedir de novo dispensa a recusa e volta ao cadastro', async () => {
    await abrir(pedido('recusada'));
    expect(tela().textContent).toContain('Pedido não aprovado');

    botao('Pedir de novo').click();
    await fixture.whenStable();

    expect(desistir).toHaveBeenCalledWith('s1');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/atendente/cadastro', { replaceUrl: true });
  });

  it('se cancelar falhar, avisa e continua na tela', async () => {
    await abrir(pedido('pendente'));
    desistir.mockRejectedValueOnce(new Error('sem rede'));

    botao('Cancelar pedido').click();
    await fixture.whenStable();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(tela().textContent).toContain('Não foi possível concluir agora');
  });

  it('sem pedido nenhum, manda para o cadastro de atendente', async () => {
    await abrir(null);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/atendente/cadastro', { replaceUrl: true });
  });
});
