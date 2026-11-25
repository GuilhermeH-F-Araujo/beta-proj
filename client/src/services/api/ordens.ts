import { API_URL, CorpoErroApi, ErroRequisicaoApi, request } from './transporte';

export type OpcoesNovaOrdem = {
  clients: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    cpf: string | null;
  }[];
  motorcycles: {
    id: number;
    clientId: number;
    model: string;
    plate: string;
    year: number | null;
    color: string | null;
    mileage: number | null;
  }[];
  mechanics: { id: number; name: string }[];
  services: { id: string; name: string; categoryId: string; duration: string; price: number }[];
  serviceCategories: { id: string; name: string }[];
};

export type DadosNovaOrdem = {
  clientId: number | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientCpf: string;
  motorcycleId: number | null;
  model: string;
  plate: string;
  year: number | null;
  color: string;
  mileage: number | null;
  mechanicId: number | null;
  entryAt: string;
  forecastAt: string;
  noForecastConfirmed: boolean;
  photoCaptureVersion: 2;
  problem: string;
  observations: string;
  services: string[];
  photos: { position: 'front' | 'left' | 'rear' | 'right' | 'extra'; data: string }[];
};

export function buscarOpcoesNovaOrdem() {
  return request<OpcoesNovaOrdem>('/api/orders/create-options', { method: 'GET' });
}

export function criarOrdem(entrada: DadosNovaOrdem) {
  return request<{ id: number; clientId: number; motorcycleId: number }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(entrada),
  });
}

export type SituacaoOrdem =
  | 'aguardando'
  | 'em andamento'
  | 'aguardando peça'
  | 'pronto'
  | 'entregue'
  | 'cancelada';

export type ItemOrdem = {
  id: number;
  status: SituacaoOrdem;
  entry: string;
  forecast: string | null;
  total: number | null;
  client: string;
  phone: string | null;
  motorcycle: string;
  plate: string | null;
  mechanic: string;
  paymentStatus: 'pendente' | 'pago';
};

export type RespostaOrdens = {
  items: ItemOrdem[];
  total: number;
  page: number;
  pageSize: 15;
  counts: Record<SituacaoOrdem, number>;
};

export type FiltrosOrdens = {
  page: number;
  search: string;
  status: SituacaoOrdem | 'todos';
  period: 'todos' | '7d' | '30d' | 'mes';
  dateFrom?: string;
  dateTo?: string;
  clientId?: number;
};

export function setSituacaoOrdem(id: number, situacao: SituacaoOrdem, observacao = '') {
  return request<{ id: number; status: SituacaoOrdem }>(`/api/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: situacao, observation: observacao }),
  });
}

export type DetalhesAcaoOrdem = {
  id: number;
  status: SituacaoOrdem;
  client: { name: string; phone: string | null; email: string | null; cpf: string | null };
  motorcycle: { model: string; plate: string; year: number | null; color: string | null };
  problem: string | null;
  observations: string | null;
};

export function buscarDetalhesAcaoOrdem(id: number) {
  return request<DetalhesAcaoOrdem>(`/api/orders/${id}/actions`, { method: 'GET' });
}

export function salvarDetalhesAcaoOrdem(
  id: number,
  valores: {
    client: { name: string; phone: string; email: string; cpf: string };
    motorcycle: { model: string; plate: string; year: number | null; color: string };
    problem: string;
    observations: string;
  },
) {
  return request<{ ok: true }>(`/api/orders/${id}/actions`, {
    method: 'PUT',
    body: JSON.stringify(valores),
  });
}

export function excluirOrdem(id: number, motivo = '') {
  return request<void>(`/api/orders/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmId: id, reason: motivo }),
  });
}

export function ordensParametros(filtros: FiltrosOrdens) {
  const parametros = new URLSearchParams({
    page: String(filtros.page),
    search: filtros.search,
    status: filtros.status,
    period: filtros.period,
  });
  if (filtros.dateFrom && filtros.dateTo) {
    parametros.set('dateFrom', filtros.dateFrom);
    parametros.set('dateTo', filtros.dateTo);
  }
  if (filtros.clientId) parametros.set('clientId', String(filtros.clientId));
  return parametros;
}

export function buscarOrdens(filtros: FiltrosOrdens) {
  return request<RespostaOrdens>(`/api/orders?${ordensParametros(filtros)}`, { method: 'GET' });
}

export type DetalhesOrdem = {
  id: number;
  status: SituacaoOrdem;
  entry: string | null;
  exit: string | null;
  forecast: string | null;
  lastUpdated: string | null;
  mechanic: string;
  total: number | null;
  movements: {
    id: string;
    action: 'status' | 'edicao';
    before: SituacaoOrdem | null;
    after: SituacaoOrdem | null;
    note: string | null;
    actor: string;
    at: string;
  }[];
  problem: string | null;
  observations: string | null;
  cancellationReason: string | null;
  client: { name: string; phone: string | null; email: string | null; photo: string | null };
  motorcycle: {
    model: string;
    plate: string | null;
    year: number | null;
    color: string | null;
    photo: string | null;
    kmEntry: number | null;
    kmExit: number | null;
  };
  services: { description: string; price: number }[];
  parts: { name: string; quantity: number; unitPrice: number }[];
  photos: {
    id: number;
    url: string;
    position: 'front' | 'left' | 'rear' | 'right' | 'extra' | null;
    recordedAt: string | null;
  }[];
  serviceTotal: number;
  partsTotal: number;
  paymentStatus: 'pendente' | 'pago';
};

export function buscarDetalhesOrdem(id: number) {
  return request<DetalhesOrdem>(`/api/orders/${id}`, { method: 'GET' });
}

export async function buscarFotoCliente(id: number): Promise<Blob> {
  const response = await fetch(`${API_URL}/api/orders/${id}/client-photo`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Foto indisponível.');
  return response.blob();
}

export type RegistroHistoricoObservacao = {
  id: string;
  kind: 'observacao_anterior' | 'nota_status';
  body: string;
  at: string;
  actor: string;
  context: string | null;
};

export function buscarHistoricoObservacoes(id: number) {
  return request<{ entries: RegistroHistoricoObservacao[] }>(
    `/api/orders/${id}/observation-history`,
    { method: 'GET' },
  );
}

export type HistoricoMotocicleta = {
  motorcycle: {
    id: number;
    model: string;
    plate: string | null;
    year: number | null;
    color: string | null;
    photo: string | null;
    km: number;
    client: string;
  };
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    waitingParts: number;
    cancelled: number;
    open: number;
    services: number;
    parts: number;
    spent: number;
  };
  mostUsedParts: { name: string; quantity: number; total: number }[];
  orders: {
    id: number;
    status: SituacaoOrdem;
    entry: string;
    exit: string | null;
    problem: string | null;
    observations: string | null;
    cancellationReason: string | null;
    kmEntry: number | null;
    kmExit: number | null;
    mechanic: string;
    paymentStatus: 'pago' | 'pendente';
    total: number | null;
    services: { description: string; price: number }[];
    parts: { name: string; quantity: number; unitPrice: number }[];
  }[];
};

export function buscarHistoricoMotocicleta(idOrdem: number) {
  return request<HistoricoMotocicleta>(`/api/orders/${idOrdem}/history`, { method: 'GET' });
}

export type ResumoPagamento = {
  id: number;
  client: string;
  phone: string | null;
  motorcycle: string;
  plate: string | null;
  partsTotal: number;
  servicesTotal: number;
  discount: number;
  amount: number;
};

export function buscarResumoPagamento(id: number) {
  return request<ResumoPagamento>(`/api/orders/${id}/payment`, { method: 'GET' });
}

export function registrarPagamentoOrdem(
  id: number,
  pago: boolean,
  detalhes?: {
    method: 'pix' | 'credito' | 'debito';
    terminal: 'rede' | 'stone' | null;
    installments: number;
  },
) {
  return request<{ paymentStatus: 'pendente' | 'pago' }>(`/api/orders/${id}/payment`, {
    method: 'POST',
    body: JSON.stringify(pago ? { paid: pago, ...detalhes } : { paid: pago }),
  });
}

export async function exportarOrdens(filtros: FiltrosOrdens) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/orders/export?${ordensParametros(filtros)}`, {
      credentials: 'include',
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor para exportar as ordens.');
  }
  if (!response.ok) {
    const corpo = (await response.json().catch(() => ({}))) as CorpoErroApi;
    throw new ErroRequisicaoApi(
      corpo.message || 'Não foi possível exportar as ordens.',
      response.status,
      corpo.code,
    );
  }
  const url = URL.createObjectURL(await response.blob());
  const ligacao = document.createElement('a');
  ligacao.href = url;
  ligacao.download = 'ordens-de-servico.csv';
  ligacao.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
