import { SituacaoOrdem } from './ordens';
import { API_URL, request } from './transporte';

export type SituacaoCliente =
  | 'em andamento'
  | 'aguardando peça'
  | 'pronto'
  | 'aguardando'
  | 'retorno'
  | 'entregue'
  | 'cancelada'
  | 'sem-os';

export type ItemCliente = {
  id: number;
  name: string;
  phone: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  motorcycle: string | null;
  plate: string | null;
  motorcycles: { id: number; model: string; plate: string | null }[];
  firstAttendance: string | null;
  lastAttendance: string | null;
  situation: SituacaoCliente;
  active: boolean;
  awaitingReturn: boolean;
  newThisMonth: boolean;
  motorcycleCount: number;
  orderCount: number;
};

export type RespostaClientes = {
  items: ItemCliente[];
  counts: { all: number; active: number; return: number; new: number };
  models: string[];
};

export type DadosPerfilCliente = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  photoRevision: string | null;
  birthDate: string | null;
  postalCode: string | null;
  address: string | null;
  addressNumber: string | null;
  complement?: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  motorcycles: {
    id_moto: number;
    modelo: string;
    placa: string | null;
    ano: number | null;
    cor: string | null;
    quilometragem: number | null;
  }[];
  orders: {
    id_os: number;
    id_moto: number;
    status: SituacaoOrdem;
    data_entrada: string;
    data_saida: string | null;
    total: number | null;
    problema_relatado: string | null;
  }[];
  summary: {
    motorcycleCount: number;
    orderCount: number;
    recordedTotal: number;
    firstAttendance: string | null;
    lastAttendance: string | null;
  };
};

export function buscarClientes() {
  return request<RespostaClientes>('/api/clients', { method: 'GET' });
}

export function buscarPerfilCliente(id: number) {
  return request<DadosPerfilCliente>(`/api/clients/${id}`, { method: 'GET' });
}

export function excluirCliente(id: number, motivo: string) {
  return request<{ ok: true }>(`/api/clients/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason: motivo }),
  });
}

export type EdicaoPerfilCliente = {
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string;
  birthDate: string | null;
  postalCode: string | null;
  address: string | null;
  addressNumber: string | null;
  complement?: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  photo?: string;
};

export function atualizarPerfilCliente(id: number, valores: EdicaoPerfilCliente) {
  return request<{ ok: true }>(`/api/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(valores),
  });
}

export async function buscarFotoDiretorioCliente(id: number): Promise<Blob> {
  const response = await fetch(`${API_URL}/api/clients/${id}/photo`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Foto indisponível.');
  return response.blob();
}
