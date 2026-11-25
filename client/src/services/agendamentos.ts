import { request } from './apiAutenticacao';

export type ItemAgendamento = {
  id: number;
  clienteId: number;
  cliente: string;
  telefone: string;
  motoId: number;
  moto: string;
  motoFoto?: string | null;
  placa: string;
  mecanicoId: number | null;
  mecanico: string;
  servico: string;
  status: 'Confirmado' | 'Pendente' | 'Concluído' | 'Cancelado';
  data: string;
  hora: string;
  duracao: string;
  observacoes: string;
};

export type OpcoesAgendamento = {
  clientes: { id: number; nome: string; telefone: string | null; motos: MotoAgendamento[] }[];
  mecanicos: { id: number; nome: string }[];
};
export type MotoAgendamento = { id: number; modelo: string; placa: string | null };
export type EntradaAgendamento = {
  clienteId: number;
  motoId: number;
  mecanicoId: number;
  servico: string;
  status: ItemAgendamento['status'];
  data: string;
  hora: string;
  duracao: string;
  observacoes: string;
};

export async function buscarAgendamentos() {
  return (await request<{ itens: ItemAgendamento[] }>('/api/agendamentos', { method: 'GET' }))
    .itens;
}

export function buscarOpcoesAgendamento(sinal?: AbortSignal) {
  return request<OpcoesAgendamento>('/api/agendamentos/opcoes', { method: 'GET', signal: sinal });
}

export async function salvarAgendamento(id: number | null, entrada: EntradaAgendamento) {
  const resultado = await request<{ item: ItemAgendamento }>(
    id === null ? '/api/agendamentos' : `/api/agendamentos/${id}`,
    { method: id === null ? 'POST' : 'PATCH', body: JSON.stringify(entrada) },
  );
  return resultado.item;
}

export function excluirAgendamento(id: number) {
  return request<void>(`/api/agendamentos/${id}`, { method: 'DELETE' });
}
