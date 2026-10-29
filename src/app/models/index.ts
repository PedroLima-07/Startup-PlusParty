export type TipoPerfil = 'cliente' | 'gerente' | 'funcionario';

export type StatusComanda =
  | 'aguardando_liberacao'
  | 'aberta'
  | 'aguardando_pagamento'
  | 'paga'
  /** O atendente não confirmou a presença do cliente. Final, como 'paga'. */
  | 'recusada'
  /** O cliente desistiu antes da liberação. Final. */
  | 'cancelada'
  /** O gerente registrou que o cliente foi embora sem pagar. Final. */
  | 'nao_paga';

/**
 * Status em que a comanda ainda prende o cliente: o banco só deixa ter uma
 * assim por vez (supabase/comanda_regras.sql).
 */
export const STATUS_ATIVOS: StatusComanda[] = ['aguardando_liberacao', 'aberta', 'aguardando_pagamento'];

/** Quantos minutos depois de fechar a conta o pagamento vira alerta (atendente e gerente). */
export const MINUTOS_ALERTA_PAGAMENTO = 30;

/** Quantos minutos esperando liberação viram alerta (atendente e gerente). */
export const MINUTOS_ALERTA_LIBERACAO = 5;

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
  /** Nota antiga, fixa no cadastro. As telas usam `nota_media`. */
  avaliacao: number | null;
  /** Média das avaliações dos clientes, calculada pelo banco (supabase/avaliacoes.sql). */
  nota_media: number | null;
  total_avaliacoes: number;
  /** Usuário sem @ (supabase/bar_redes_localizacao.sql). */
  instagram: string | null;
  tiktok: string | null;
  /** Só dígitos, com 55 e DDD. */
  whatsapp: string | null;
  latitude: number | null;
  longitude: number | null;
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
  /** Quando o cliente fechou a conta; gravado pelo banco. */
  fechada_em: string | null;
}

/** Conta fechada que ainda espera pagamento: impede o cliente de abrir outra comanda. */
export interface ContaPendente {
  id: string;
  estabelecimento: string;
  mesa: string | null;
  fechada_em: string | null;
  total: number;
}

/** A última vez que o cliente saiu sem pagar (historico_nao_paga), para quem libera. */
export interface HistoricoNaoPaga {
  estabelecimento: string;
  valor: number;
  quando: string;
  vezes: number;
}

/** Como a mesa está antes de abrir a comanda (supabase/mesa_fila.sql). */
export type SituacaoMesa = 'livre' | 'em_uso' | 'liberando';

/** O cliente esperando na fila de uma mesa. */
export interface EsperaNaFila {
  id: string;
  estabelecimento_id: string;
  estabelecimento: string;
  mesa: string;
  /** 1 = o próximo a ser chamado. */
  posicao: number;
}

/** Conta paga esperando avaliação do cliente (supabase/avaliacoes.sql). */
export interface AvaliacaoPendente {
  comanda_id: string;
  estabelecimento_id: string;
  estabelecimento: string;
  pedida_em: string;
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
  /** Id do cliente, para consultar o histórico de contas não pagas. */
  usuario_id: string;
  cliente: string;
  criada_em: string;
  fechada_em: string | null;
  liberada_em: string | null;
  /** Nome de quem liberou a comanda; null enquanto não foi liberada. */
  liberada_por: string | null;
  /** Aberta pelo banco para o primeiro da fila quando a mesa liberou. */
  veio_da_fila: boolean;
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
  foto_url: string | null;
  criada_em: string;
  /** Veio de um link de convite do gerente (pedidos antigos podem não ter). */
  peloConvite: boolean;
}

/** Atendente que já trabalha no bar do gerente. */
export interface Funcionario {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  foto_url: string | null;
}

/** O atendente como o perfil dele aparece para o gerente. */
export interface FuncionarioDetalhe extends Funcionario {
  /** Quando o gerente aprovou a entrada; null para quem entrou antes dos pedidos. */
  naEquipeDesde: string | null;
  peloConvite: boolean;
}

/** Link de convite para a equipe, como o gerente o vê. */
export interface ConviteEquipe {
  id: string;
  codigo: string;
  criado_em: string;
  expira_em: string;
}

export type SituacaoConvite = 'valido' | 'usado' | 'expirado';

/** O que a página do convite mostra antes de a pessoa aceitar. */
export interface ConviteInfo {
  estabelecimento_nome: string;
  situacao: SituacaoConvite;
}

export interface Alerta {
  id: string;
  comanda_id: string;
  tipo: TipoAlerta;
  status: StatusAlerta;
  criado_em: string;
}

/** Bebida e comida são promoções do cardápio; evento e novidade, avisos do bar. */
export type TipoPostagem = 'bebida' | 'comida' | 'evento' | 'novidade';

export interface Postagem {
  id: string;
  estabelecimento_id: string;
  tipo: TipoPostagem;
  titulo: string | null;
  texto: string | null;
  imagem_url: string | null;
  /** Preço da promoção (ou do produto novo). */
  preco: number | null;
  /** Preço normal, riscado ao lado do preço da promoção. */
  preco_antigo: number | null;
  /** Depois disso a postagem sai do Feed; null = sem prazo. */
  valida_ate: string | null;
  criada_em: string;
}

/** Postagem como o Feed mostra: com o bar que publicou. */
export interface PostagemFeed extends Postagem {
  estabelecimento: Pick<Estabelecimento, 'id' | 'nome' | 'foto_url'>;
}

/** O que o gerente preenche para publicar. */
export interface NovaPostagem {
  tipo: TipoPostagem;
  titulo: string;
  texto: string | null;
  preco: number | null;
  preco_antigo: number | null;
  valida_ate: string | null;
}

export type TipoNotificacao =
  | 'comanda_liberada'
  | 'comanda_recusada'
  | 'pedido_pronto'
  | 'pagamento_confirmado'
  | 'postagem'
  | 'mesa_liberada'
  | 'evento_lembrete'
  | 'evento_cancelado';

/** Aviso para o cliente. Quem cria é o banco (supabase/feed_notificacoes.sql). */
export interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  texto: string | null;
  /** Tela do app que o aviso abre. */
  link: string | null;
  criada_em: string;
  lida_em: string | null;
}

export interface ComandaResumo {
  id: string;
  numero: string;
  cliente: string;
  /** Número da mesa, ou 'Balcão'. */
  mesa: string;
  horario: string;
  valor: number;
  status: 'aberta' | 'aguardando_pagamento' | 'paga' | 'nao_paga';
}

export type TipoAlertaGerente = 'pagamento' | 'pedido_parado' | 'liberacao' | 'sem_pedido' | 'nota_baixa';

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

/** O que o gerente edita em Configurações (tabela estabelecimentos). */
export type DadosDoBar = Pick<
  Estabelecimento,
  'nome' | 'descricao' | 'sobre' | 'endereco' | 'capacidade' | 'horario_abre' | 'horario_fecha' | 'dias_abertos'
>;

export type StatusMovimento = 'normal' | 'quente';

/** Uma vez de um evento na agenda do bar (agenda_do_bar; eventos semanais aparecem uma vez por semana). */
export interface EventoAgenda {
  evento_id: string;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string | null;
  capa_url: string | null;
  /** Valor da entrada; null ou 0 = grátis. */
  entrada: number | null;
  repete_semanal: boolean;
  cancelado: boolean;
  interessados: number;
  tenho_interesse: boolean;
}

/** Avaliação mostrada no perfil do bar (avaliacoes_do_bar: só o primeiro nome do autor). */
export interface AvaliacaoDoBar {
  id: string;
  autor: string;
  nota: number;
  comentario: string | null;
  criada_em: string;
  resposta: string | null;
  respondida_em: string | null;
}

/** Números de um período em Resultados (supabase/resultados_periodo.sql → totais). */
export interface TotaisResultados {
  faturamento: number;
  comandas_pagas: number;
  ticket_medio: number | null;
  nao_pagas: number;
  valor_nao_pago: number;
  recusadas: number;
  canceladas: number;
  clientes: number;
  clientes_que_voltaram: number;
  comandas_na_mesa: number;
  comandas_no_balcao: number;
  itens_vendidos: number;
  faturamento_bar: number;
  faturamento_cozinha: number;
  minutos_permanencia: number | null;
  minutos_para_liberar: number | null;
  minutos_para_pagar: number | null;
  minutos_preparo_bar: number | null;
  minutos_preparo_cozinha: number | null;
}

/** Tudo o que a tela Resultados mostra para 3, 7, 15 ou 30 dias, já somado no banco. */
export interface ResultadosPeriodo {
  periodo: { dias: number; de: string; ate: string };
  totais: TotaisResultados;
  /** Os mesmos números no período anterior de mesmo tamanho. */
  anterior: TotaisResultados;
  por_dia: { dia: string; faturamento: number; comandas_pagas: number }[];
  /** Comandas abertas por dia da semana (0 = domingo) e hora. */
  calor: { dia_semana: number; hora: number; comandas: number }[];
  mais_vendidos: { nome: string; quantidade: number; receita: number }[];
  mais_receita: { nome: string; quantidade: number; receita: number }[];
  sem_venda: { nome: string; categoria: string }[];
}

/** Números das avaliações no período (avaliacoes_periodo). */
export interface AvaliacoesPeriodo {
  dias: number;
  total: number;
  media: number | null;
  sem_resposta: number;
  distribuicao: Record<'1' | '2' | '3' | '4' | '5', number>;
  anterior: { total: number; media: number | null };
}

/** Avaliação como o gerente vê: com a denúncia, se houver. */
export interface AvaliacaoGerente extends AvaliacaoDoBar {
  denunciada_em: string | null;
}

/** Evento como o gerente cadastra (tabela eventos). */
export interface EventoDoBar {
  id: string;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string | null;
  entrada: number | null;
  repete_semanal: boolean;
  cancelado_em: string | null;
  /** Vem de agenda_do_bar: o gerente não lê a lista de quem marcou. */
  interessados: number;
}

export type NovoEvento = Pick<EventoDoBar, 'titulo' | 'descricao' | 'inicio' | 'entrada' | 'repete_semanal'>;
