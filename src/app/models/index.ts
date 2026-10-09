export type TipoPerfil = 'cliente' | 'gerente' | 'funcionario';

export type StatusComanda =
  | 'aguardando_liberacao'
  | 'aberta'
  | 'aguardando_pagamento'
  | 'paga'
  /** O atendente não confirmou a presença do cliente. Final, como 'paga'. */
  | 'recusada';

export type StatusPedidoItem = 'novo' | 'em_andamento' | 'pronto';

export type SetorItem = 'bar' | 'cozinha';

export type TipoAlerta = 'chamar_garcom';

export type StatusAlerta = 'pendente' | 'resolvido';

export interface Estabelecimento {
  id: string;
  nome: string;
  descricao: string | null;
  endereco: string | null;
  capacidade: number | null;
  avaliacao: number | null;
  criado_em: string;
  foto_url: string | null;
  sobre: string | null;
  tags: string[];
  /** 'HH:MM:SS'; se fecha antes de abrir, fecha no dia seguinte. */
  horario_abre: string | null;
  horario_fecha: string | null;
  /** 0 = domingo ... 6 = sábado */
  dias_abertos: number[];
}

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  tipo: TipoPerfil;
  estabelecimento_id: string | null;
  criado_em: string;
}

export interface Item {
  id: string;
  estabelecimento_id: string;
  nome: string;
  categoria: string;
  preco: number;
  setor: SetorItem;
  disponivel: boolean;
}

export interface Comanda {
  id: string;
  usuario_id: string;
  estabelecimento_id: string;
  mesa: string | null;
  status: StatusComanda;
  criada_em: string;
  fechada_em: string | null;
}

export interface Pedido {
  id: string;
  comanda_id: string;
  criado_em: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  item_id: string;
  quantidade: number;
  preco_unitario: number;
  status: StatusPedidoItem;
}

/** pedido_itens com os dados do item já resolvidos, como a tela de comanda precisa exibir. */
export interface PedidoItemDetalhado extends PedidoItem {
  item: Pick<Item, 'nome' | 'setor'>;
}

/** comanda com o nome do estabelecimento já resolvido, como a tela de comanda precisa exibir. */
export interface ComandaDetalhada extends Comanda {
  estabelecimento: Pick<Estabelecimento, 'nome'>;
}

/** item + quantidade escolhida, como o carrinho da tela de cardápio guarda. */
export interface ItemCarrinho {
  item: Item;
  quantidade: number;
}

/** itens do cardápio agrupados por categoria (Cervejas, Drinks, Pra petiscar...). */
export type CardapioAgrupado = Record<string, Item[]>;

/**
 * O que o bar/cozinha vê: os itens de um mesmo pedido, só do seu setor.
 * Um pedido com chope e batata vira dois cards, um em cada aba.
 */
export interface PedidoSetor {
  id: string;
  pedido_id: string;
  setor: SetorItem;
  status: StatusPedidoItem;
  mesa: string | null;
  cliente: string;
  criado_em: string;
  itens_ids: string[];
  itens: { nome: string; quantidade: number }[];
}

/** Um item do consumo da comanda, já somado entre os pedidos em que apareceu. */
export interface ItemConsumido {
  nome: string;
  quantidade: number;
  preco_unitario: number;
}

/**
 * Comanda como o atendente a vê na aba Comandas. Pagas e recusadas não
 * entram: já saíram da mão dele.
 */
export interface ComandaAtendente {
  id: string;
  status: Extract<StatusComanda, 'aguardando_liberacao' | 'aguardando_pagamento' | 'aberta'>;
  mesa: string | null;
  cliente: string;
  criada_em: string;
  /** Soma de quantidade × preço de tudo o que foi pedido até agora. */
  total: number;
  itens: ItemConsumido[];
}

export type StatusSolicitacaoEquipe = 'pendente' | 'aprovada' | 'recusada';

/** O pedido de alguém para trabalhar num bar, como a própria pessoa o vê. */
export interface MinhaSolicitacaoEquipe {
  id: string;
  status: StatusSolicitacaoEquipe;
  estabelecimento: Pick<Estabelecimento, 'nome'>;
}

/** Um pedido esperando resposta, como o gerente o vê na aba Equipe. */
export interface SolicitacaoPendente {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  criada_em: string;
}

/** Atendente que já trabalha no bar do gerente. */
export interface Funcionario {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
}

export interface Alerta {
  id: string;
  comanda_id: string;
  tipo: TipoAlerta;
  status: StatusAlerta;
  criado_em: string;
}

export interface Postagem {
  id: string;
  estabelecimento_id: string;
  texto: string | null;
  imagem_url: string | null;
  criada_em: string;
}

export interface ComandaResumo {
  numero: string;
  cliente: string;
  /** Número da mesa, ou 'Balcão'. */
  mesa: string;
  horario: string;
  valor: number;
  status: 'aberta' | 'aguardando_pagamento' | 'paga';
}

export type TipoAlertaGerente = 'pagamento' | 'pedido_parado' | 'liberacao' | 'sem_pedido';

/** Situação que pede a atenção do gerente no painel de Movimento. */
export interface AlertaGerente {
  id: string;
  tipo: TipoAlertaGerente;
  titulo: string;
  detalhe: string;
  /** Número da comanda envolvida, quando ela aparece nas comandas do dia. */
  comanda: string | null;
}

/** Comandas abertas ao mesmo tempo numa faixa de horário. */
export interface LotacaoPorHora {
  hora: string;
  comandas: number;
}

export interface ItemVendido {
  nome: string;
  quantidade: number;
}

export interface PostagemGerente {
  id: string;
  texto: string;
  fotoUrl?: string;
  criadoEm: Date;
}

export interface PerfilBar {
  nome: string;
  descricaoCurta: string;
  endereco: string;
  /** Lotação máxima; base do selo de movimento (Normal ou Quente). */
  capacidade: number;
  horarioFuncionamento: string;
  fotoCapaUrl?: string;
}

export type StatusMovimento = 'normal' | 'quente';

