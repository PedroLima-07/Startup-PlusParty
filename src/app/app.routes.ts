import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { semSessaoGuard } from './guards/sem-sessao.guard';
import { staffGuard } from './guards/staff.guard';
import { gerenteGuard } from './guards/gerente.guard';

// Navegar pelos bares (discovery, perfil, cardápio em modo visualizar, home)
// não exige login, para demonstrar sem conta. Abrir e usar uma comanda exige.
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./Pages/login/login').then((m) => m.LoginPage),
    canActivate: [semSessaoGuard],
  },
  {
    path: 'redefinir-senha',
    loadComponent: () =>
      import('./Pages/redefinir-senha/redefinir-senha').then((m) => m.RedefinirSenhaPage),
  },
  {
    path: 'cliente/discovery',
    loadComponent: () => import('./Pages/discovery/discovery').then((m) => m.DiscoveryPage),
  },
  {
    path: 'cliente/estabelecimento/:id',
    loadComponent: () =>
      import('./Pages/estabelecimento/estabelecimento').then((m) => m.EstabelecimentoPage),
  },
  {
    path: 'cliente/estabelecimento/:id/cardapio',
    loadComponent: () => import('./Pages/cardapio/cardapio').then((m) => m.CardapioPage),
    data: { modo: 'visualizar' },
  },
  {
    path: 'cliente/home',
    loadComponent: () => import('./Pages/home/home').then((m) => m.HomePage),
  },
  // Promoções e eventos dos bares: aberto sem login, como o Discovery.
  {
    path: 'cliente/novidades',
    loadComponent: () => import('./Pages/feed/feed').then((m) => m.FeedPage),
  },
  // Endereço antigo da aba: links e notificações já enviadas continuam funcionando.
  { path: 'cliente/feed', redirectTo: 'cliente/novidades' },
  {
    path: 'cliente/notificacoes',
    loadComponent: () =>
      import('./Pages/notificacoes/notificacoes').then((m) => m.NotificacoesPage),
    canActivate: [authGuard],
  },
  {
    path: 'cliente/abrir-comanda/:id',
    loadComponent: () =>
      import('./Pages/abrir-comanda/local/local').then((m) => m.AbrirComandaLocalComponent),
    canActivate: [authGuard],
  },
  {
    path: 'cliente/comanda/:id',
    loadComponent: () => import('./Pages/comanda/comanda').then((m) => m.ComandaPage),
    canActivate: [authGuard],
  },
  {
    path: 'cliente/cardapio/:id',
    loadComponent: () => import('./Pages/cardapio/cardapio').then((m) => m.CardapioPage),
    data: { modo: 'pedir' },
    canActivate: [authGuard],
  },
  // Link de convite do gerente: a única porta de entrada para a equipe de um
  // bar. Quem aceita espera a aprovação do gerente na tela seguinte.
  {
    path: 'convite/:codigo',
    loadComponent: () => import('./Pages/convite/convite').then((m) => m.ConvitePage),
  },
  {
    path: 'atendente/aguardando',
    loadComponent: () =>
      import('./Pages/atendente-aguardando/atendente-aguardando').then(
        (m) => m.AtendenteAguardandoPage,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'atendente/pedidos',
    loadComponent: () =>
      import('./Pages/atendente-pedidos/atendente-pedidos').then((m) => m.AtendentePedidos),
    canActivate: [staffGuard],
  },
  {
    path: 'atendente/comandas',
    loadComponent: () =>
      import('./Pages/atendente-comandas/atendente-comandas').then((m) => m.AtendenteComandas),
    canActivate: [staffGuard],
  },
  {
    path: 'gerente',
    canActivate: [gerenteGuard],
    loadComponent: () => import('./Pages/gerente/gerente-layout/gerente-layout').then(m => m.GerenteLayout),
    children: [
      { path: '', redirectTo: 'movimento', pathMatch: 'full' },
      { path: 'movimento', loadComponent: () => import('./Pages/gerente/movimento/movimento').then(m => m.Movimento) },
      { path: 'movimento/resumo', loadComponent: () => import('./Pages/gerente/resumo/resumo').then(m => m.Resumo) },
      { path: 'resultados', loadComponent: () => import('./Pages/gerente/resultados/resultados').then(m => m.Resultados) },
      { path: 'postagens', loadComponent: () => import('./Pages/gerente/postagens/postagens').then(m => m.Postagens) },
      { path: 'agenda', loadComponent: () => import('./Pages/gerente/agenda/agenda').then(m => m.AgendaGerente) },
      { path: 'avaliacoes', loadComponent: () => import('./Pages/gerente/avaliacoes/avaliacoes').then(m => m.AvaliacoesGerente) },
      { path: 'divulgar', loadComponent: () => import('./Pages/gerente/divulgar/divulgar').then(m => m.Divulgar) },
      // O convite vem antes da Equipe: senão "convite" seria lido como o id de um atendente.
      { path: 'equipe/convite', loadComponent: () => import('./Pages/gerente/equipe-convite/equipe-convite').then(m => m.EquipeConvite) },
      // O perfil do atendente abre dentro da Equipe: ao lado da lista no
      // desktop, no lugar dela no celular.
      {
        path: 'equipe',
        loadComponent: () => import('./Pages/gerente/equipe/equipe').then(m => m.Equipe),
        children: [
          { path: ':id', loadComponent: () => import('./Pages/gerente/equipe-perfil/equipe-perfil').then(m => m.EquipePerfil) },
        ],
      },
      // Aberta pela engrenagem do topo (celular) e pelo menu lateral (desktop).
      // O endereço antigo continua valendo.
      { path: 'configuracoes', loadComponent: () => import('./Pages/gerente/perfil-bar/perfil-bar').then(m => m.PerfilBarComponent) },
      { path: 'perfil-bar', redirectTo: 'configuracoes', pathMatch: 'full' }
    ]
  },
  {
    path: 'cliente',
    redirectTo: 'cliente/discovery',
    pathMatch: 'full',
  },
  // A raiz e endereços desconhecidos vão para o login. Quem já está logado
  // é mandado de lá para a própria tela inicial (semSessaoGuard).
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
