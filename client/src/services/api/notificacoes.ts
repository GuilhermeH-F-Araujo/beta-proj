import type { EventoNotificacao } from '../catalogoNotificacoes';
import { request } from './transporte';

export type NotificacaoAdministrador = {
  id: number;
  kind: EventoNotificacao;
  orderId: number | null;
  clientId?: number | null;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
};

export function buscarNotificacoesAdministrador() {
  return request<{ items: NotificacaoAdministrador[]; unreadCount: number }>(
    '/api/admin/notifications',
    { method: 'GET' },
  );
}

export function limparNotificacoesAdministrador() {
  return request<{ cleared: number }>('/api/admin/notifications/clear', { method: 'POST' });
}

export function atualizarNotificacaoAdministrador(id: number, acao: 'ler' | 'dispensar') {
  return request<{ ok: true }>(`/api/admin/notifications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: acao }),
  });
}
