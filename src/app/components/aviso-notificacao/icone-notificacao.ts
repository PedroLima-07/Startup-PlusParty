import { TipoNotificacao } from '../../models';

/** Ícone de cada tipo de notificação, na lista e no aviso do topo da tela. */
export const ICONE_NOTIFICACAO: Record<TipoNotificacao, string> = {
  comanda_liberada: '🎟️',
  comanda_recusada: '✕',
  pedido_pronto: '🍽️',
  pagamento_confirmado: '💳',
  postagem: '🏷️',
};
