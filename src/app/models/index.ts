export type TipoPerfil = 'cliente' | 'gerente' | 'funcionario';

export type StatusComanda =
  | 'aguardando_liberacao'
  | 'aberta'
  | 'aguardando_pagamento'
  | 'paga';

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
