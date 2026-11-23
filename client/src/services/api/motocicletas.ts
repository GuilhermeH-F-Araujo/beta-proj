import { SituacaoOrdem } from './ordens';
import { request } from './transporte';

export type SituacaoMotocicleta =
  | 'active'
  | 'maintenance'
  | 'completed'
  | 'pickup'
  | 'inactive'
  | 'delivered'
  | 'cancelled'
  | 'no-orders';

export type ItemMotocicleta = {
  id: number;
  clientId: number;
  client: string;
  phone: string | null;
  model: string;
  plate: string;
  year: number | null;
  modelYear: number | null;
  color: string | null;
  mileage: number | null;
  chassis: string;
  renavam: string;
  notes: string;
  active: boolean;
  status: SituacaoMotocicleta;
  lastOrder: {
    id: number;
    date: string;
    status: SituacaoOrdem;
    paymentStatus: 'pago' | 'pendente';
  } | null;
  orderCount: number;
};

export type DadosMotocicleta = {
  clientId: number;
  model: string;
  plate: string;
  year: number | null;
  modelYear: number | null;
  color: string;
  mileage: number | null;
  chassis: string;
  renavam: string;
  notes: string;
  active: boolean;
};

export type RespostaMotocicletas = {
  items: ItemMotocicleta[];
  counts: Record<SituacaoMotocicleta | 'all', number>;
  clients: { id: number; name: string }[];
};

export function buscarMotocicletas() {
  return request<RespostaMotocicletas>('/api/motorcycles', { method: 'GET' });
}

export function criarMotocicleta(entrada: DadosMotocicleta) {
  return request<{ id: number }>('/api/motorcycles', {
    method: 'POST',
    body: JSON.stringify(entrada),
  });
}

export function atualizarMotocicleta(id: number, entrada: DadosMotocicleta) {
  return request<{ ok: true }>(`/api/motorcycles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(entrada),
  });
}
