const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export type DadosEntrada = {
  identifier: string;
  password: string;
  remember: boolean;
};

type ApiErrorBody = {
  message?: string;
  code?: string;
};

export class ErroRequisicaoApi extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ErroRequisicaoApi';
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.ok && response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? (await response.json().catch(() => ({}))) as ApiErrorBody & T
    : null;

  if (!response.ok) {
    if (body?.message) throw new ErroRequisicaoApi(body.message, response.status, body.code);
    const message = response.status === 404 || contentType.includes('text/html')
      ? `A solicitação não chegou à API (HTTP ${response.status}). Inicie o projeto com npm run dev na pasta principal e abra a porta 5173.`
      : response.status >= 500
        ? `O servidor de acesso está indisponível (HTTP ${response.status}). Confira o terminal da API na porta 3001.`
        : `A API retornou uma resposta inesperada (HTTP ${response.status}). Reinicie npm run dev.`;
    throw new ErroRequisicaoApi(message, response.status);
  }

  if (!body) throw new ErroRequisicaoApi(`A API retornou uma página em vez de JSON (HTTP ${response.status}). Confira o proxy e reinicie npm run dev.`, response.status);
  return body;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error('Não foi possível conectar ao serviço de acesso. Verifique sua conexão e tente novamente.');
  }

  return readResponse<T>(response);
}

export function login(payload: DadosEntrada) {
  return request<{
    user: { id: string; email: string | null; nome: string; telefone?: string | null; perfil: 'Administrador' };
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function solicitarRecuperacaoSenha(email: string) {
  return request<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email, clientOrigin: window.location.origin }),
  });
}

export function redefinirSenha(payload: { password: string; tokenHash?: string; accessToken?: string; refreshToken?: string }) {
  return request<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function buscarUsuarioAtual() {
  return request<{
    user: { id: string; email: string | null; nome: string; telefone?: string | null; perfil: 'Administrador' };
  }>('/api/auth/me', { method: 'GET' });
}

export function atualizarMeuPerfil(input:{name:string;phone:string}) {
  return request<{ user:{ nome:string;telefone:string|null } }>('/api/admin/profile',{method:'PATCH',body:JSON.stringify(input)});
}
export function atualizarMinhaFoto(data:string) {
  return request<{ok:true}>('/api/admin/profile/photo',{method:'PUT',body:JSON.stringify({data})});
}
export function alterarMinhaSenha(currentPassword:string,newPassword:string) {
  return request<{message:string}>('/api/admin/profile/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
}

export type OpcoesNovaOrdem = {
  clients: { id:number; name:string; phone:string|null; email:string|null; cpf:string|null }[];
  motorcycles: { id:number; clientId:number; model:string; plate:string; year:number|null; color:string|null; mileage:number|null }[];
  mechanics: { id:number; name:string }[];
};
export type DadosNovaOrdem = {
  clientId:number|null; clientName:string; clientPhone:string; clientEmail:string; clientCpf:string;
  motorcycleId:number|null; model:string; plate:string; year:number|null; color:string;
  mileage:number|null; mechanicId:number|null; entryAt:string; forecastAt:string;
  problem:string; observations:string; photos:{ data:string }[];
};
export function buscarOpcoesNovaOrdem() { return request<OpcoesNovaOrdem>('/api/orders/create-options',{ method:'GET' }); }
export function criarOrdem(input:DadosNovaOrdem) {
  return request<{ id:number; clientId:number; motorcycleId:number }>('/api/orders',{ method:'POST',body:JSON.stringify(input) });
}
export type StatusMotocicleta='active'|'maintenance'|'completed'|'pickup'|'inactive'|'delivered'|'cancelled'|'no-orders';
export type ItemMotocicleta={id:number;clientId:number;client:string;phone:string|null;model:string;plate:string;
  year:number|null;modelYear:number|null;color:string|null;mileage:number|null;chassis:string;renavam:string;notes:string;
  active:boolean;status:StatusMotocicleta;lastOrder:{id:number;date:string;status:StatusOrdem;paymentStatus:'pago'|'pendente'}|null;orderCount:number};
export type DadosMotocicleta={clientId:number;model:string;plate:string;year:number|null;modelYear:number|null;color:string;
  mileage:number|null;chassis:string;renavam:string;notes:string;active:boolean};
export type RespostaMotocicletas={items:ItemMotocicleta[];counts:Record<StatusMotocicleta|'all',number>;clients:{id:number;name:string}[]};
export function buscarMotocicletas(){return request<RespostaMotocicletas>('/api/motorcycles',{method:'GET'});}
export function buscarMarcasMotocicleta(){return request<{brands:string[]}>('/api/motorcycle-brands',{method:'GET'});}
export function criarMotocicleta(input:DadosMotocicleta){return request<{id:number}>('/api/motorcycles',{method:'POST',body:JSON.stringify(input)});}
export function atualizarMotocicleta(id:number,input:DadosMotocicleta){return request<{ok:true}>(`/api/motorcycles/${id}`,{method:'PATCH',body:JSON.stringify(input)});}
export function excluirMotocicleta(id:number){return request<{ok:true}>(`/api/motorcycles/${id}`,{method:'DELETE'});}
export type DadosNovoUsuario = {
  name:string; email:string; phone:string; cpf:string;
  position:'Administrador'|'Cliente'|'Mecânico';
  profile:'Administrador'|'Cliente'|'Mecânico';
  password:string;
};
export function cadastrarUsuario(input:DadosNovoUsuario) {
  return request<{ id:number }>('/api/admin/users',{ method:'POST',body:JSON.stringify(input) });
}
export type NotificacaoAdmin={id:number;kind:'new_order'|'waiting_part'|'ready'|'cancelled';
  orderId:number|null;title:string;body:string;createdAt:string;read:boolean};
export function buscarNotificacoesAdmin(){return request<{items:NotificacaoAdmin[];unreadCount:number}>('/api/admin/notifications',{method:'GET'});}
export function limparNotificacoesAdmin(){return request<{cleared:number}>('/api/admin/notifications/clear',{method:'POST'});}
export function atualizarNotificacaoAdmin(id:number,action:'read'|'dismiss'){
  return request<{ok:true}>(`/api/admin/notifications/${id}`,{method:'PATCH',body:JSON.stringify({action})});
}

export type SituacaoCliente = 'em andamento' | 'aguardando peça' | 'pronto' | 'aguardando' | 'retorno' | 'entregue' | 'cancelada' | 'sem-os';
export type ItemCliente = {
  id: number; name: string; phone: string | null; hasPhoto: boolean; photoUrl: string | null;
  motorcycle: string | null; plate: string | null;
  motorcycles: { id: number; model: string; plate: string | null }[];
  firstAttendance: string | null; lastAttendance: string | null;
  situation: SituacaoCliente; active: boolean; awaitingReturn: boolean; newThisMonth: boolean;
  motorcycleCount: number; orderCount: number;
};
export type RespostaClientes = {
  items: ItemCliente[]; counts: { all: number; active: number; return: number; new: number }; models: string[];
};
export type DadosPerfilCliente = {
  id: number; name: string; phone: string | null; email: string | null; cpf: string | null; hasPhoto: boolean; photoUrl: string | null;
  photoRevision: string | null; birthDate: string | null; postalCode: string | null; address: string | null;
  addressNumber: string | null; district: string | null; city: string | null; state: string | null;
  motorcycles: { id_moto: number; modelo: string; placa: string | null; ano: number | null; cor: string | null; quilometragem: number | null }[];
  orders: { id_os: number; id_moto: number; status: StatusOrdem; data_entrada: string; data_saida: string | null; total: number | null; problema_relatado: string | null }[];
  summary: { motorcycleCount: number; orderCount: number; recordedTotal: number; firstAttendance: string | null; lastAttendance: string | null };
};
export function buscarClientes() { return request<RespostaClientes>('/api/clients', { method: 'GET' }); }
export function buscarPerfilCliente(id: number) { return request<DadosPerfilCliente>(`/api/clients/${id}`, { method: 'GET' }); }
export function excluirCliente(id: number, reason: string) {
  return request<{ ok: true }>(`/api/clients/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
}
export type EdicaoPerfilCliente = {
  name: string; phone: string | null; email: string | null; cpf: string;
  birthDate: string | null; postalCode: string | null; address: string | null;
  addressNumber: string | null; district: string | null; city: string | null; state: string | null;
  photo?: string;
};
export function atualizarPerfilCliente(id: number, values: EdicaoPerfilCliente) {
  return request<{ ok: true }>(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(values) });
}
export async function buscarFotoDiretorioCliente(id: number): Promise<Blob> {
  const response = await fetch(`${API_URL}/api/clients/${id}/photo`, { credentials: 'include' });
  if (!response.ok) throw new Error('Foto indisponível.');
  return response.blob();
}

export type StatusOrdem = 'aguardando' | 'em andamento' | 'aguardando peça' | 'pronto' | 'entregue' | 'cancelada';
export type ItemOrdem = {
  id: number; status: StatusOrdem; entry: string; forecast: string | null; total: number | null;
  client: string; phone: string | null; motorcycle: string; plate: string | null; mechanic: string;
  paymentStatus: 'pendente' | 'pago';
};
export type RespostaOrdens = {
  items: ItemOrdem[]; total: number; page: number; pageSize: 15;
  counts: Record<StatusOrdem, number>;
};
export type FiltrosOrdens = { page: number; search: string; status: StatusOrdem | 'todos'; period: 'todos' | '7d' | '30d' | 'mes'; dateFrom?: string; dateTo?: string; clientId?: number };

export function definirStatusOrdem(id: number, status: StatusOrdem, observation = '') {
  return request<{ id: number; status: StatusOrdem }>(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, observation }) });
}

export type DetalhesAcaoOrdem = {
  id: number; status: StatusOrdem;
  client: { name: string; phone: string | null; email: string | null; cpf: string | null };
  motorcycle: { model: string; plate: string; year: number | null; color: string | null };
  problem: string | null; observations: string | null;
};
export function buscarDetalhesAcaoOrdem(id: number) {
  return request<DetalhesAcaoOrdem>(`/api/orders/${id}/actions`, { method: 'GET' });
}
export function salvarDetalhesAcaoOrdem(id: number, values: {
  client: { name: string; phone: string; email: string; cpf: string };
  motorcycle: { model: string; plate: string; year: number | null; color: string };
  problem: string; observations: string;
}) {
  return request<{ ok: true }>(`/api/orders/${id}/actions`, { method: 'PUT', body: JSON.stringify(values) });
}
export function excluirOrdem(id: number, reason = '') {
  return request<void>(`/api/orders/${id}`, { method: 'DELETE', body: JSON.stringify({ confirmId: id, reason }) });
}

function ordersParams(filters: FiltrosOrdens) {
  const params = new URLSearchParams({ page: String(filters.page), search: filters.search, status: filters.status, period: filters.period });
  if (filters.dateFrom && filters.dateTo) { params.set('dateFrom', filters.dateFrom); params.set('dateTo', filters.dateTo); }
  if (filters.clientId) params.set('clientId', String(filters.clientId));
  return params;
}

export function buscarOrdens(filters: FiltrosOrdens) {
  return request<RespostaOrdens>(`/api/orders?${ordersParams(filters)}`, { method: 'GET' });
}

export type DetalhesOrdem = {
  id: number; status: StatusOrdem; entry: string | null; exit: string | null;
  forecast: string | null; lastUpdated: string | null; mechanic: string; total: number | null;
  movements: { id: string; action: 'status' | 'edit'; before: StatusOrdem | null; after: StatusOrdem | null;
    note: string | null; actor: string; at: string }[];
  problem: string | null; observations: string | null; cancellationReason: string | null;
  client: { name: string; phone: string | null; email: string | null; photo: string | null };
  motorcycle: { model: string; plate: string | null; year: number | null; color: string | null;
    photo: string | null; kmEntry: number | null; kmExit: number | null };
  services: { description: string; price: number }[];
  parts: { name: string; quantity: number; unitPrice: number }[];
  photos: { id: number; url: string; recordedAt: string | null }[];
  serviceTotal: number; partsTotal: number; paymentStatus: 'pendente' | 'pago';
};

export function buscarDetalhesOrdem(id: number) {
  return request<DetalhesOrdem>(`/api/orders/${id}`, { method: 'GET' });
}

export async function buscarFotoCliente(id:number):Promise<Blob> {
  const response=await fetch(`${API_URL}/api/orders/${id}/client-photo`,{credentials:'include'});
  if(!response.ok)throw new Error('Foto indisponível.');
  return response.blob();
}
export type RegistroHistoricoObservacao = { id: string; kind: 'previous_observation' | 'status_note'; body: string; at: string; actor: string; context: string | null };
export function buscarHistoricoObservacoes(id: number) {
  return request<{ entries: RegistroHistoricoObservacao[] }>(`/api/orders/${id}/observation-history`, { method:'GET' });
}

export type HistoricoMotocicleta = {
  motorcycle: { id: number; model: string; plate: string | null; year: number | null; color: string | null; photo: string | null; km: number; client: string };
  summary: { total: number; completed: number; inProgress: number; waitingParts: number; cancelled: number; open: number; services: number; parts: number; spent: number };
  mostUsedParts: { name: string; quantity: number; total: number }[];
  orders: { id: number; status: StatusOrdem; entry: string; exit: string | null; problem: string | null; observations: string | null; cancellationReason:string|null;
    kmEntry: number | null; kmExit: number | null; mechanic: string; paymentStatus: 'pago' | 'pendente'; total: number | null;
    services: { description: string; price: number }[]; parts: { name: string; quantity: number; unitPrice: number }[] }[];
};

export function buscarHistoricoMotocicleta(orderId: number) {
  return request<HistoricoMotocicleta>(`/api/orders/${orderId}/history`, { method: 'GET' });
}

export type ResumoPagamento = {
  id: number; client: string; phone: string | null; motorcycle: string; plate: string | null;
  partsTotal: number; servicesTotal: number; discount: number; amount: number;
};

export function buscarResumoPagamento(id: number) {
  return request<ResumoPagamento>(`/api/orders/${id}/payment`, { method: 'GET' });
}

export function registrarPagamentoOrdem(id: number, paid: boolean, details?: {
  method: 'pix' | 'credito' | 'debito'; terminal: 'rede' | 'stone' | null; installments: number;
}) {
  return request<{ paymentStatus: 'pendente' | 'pago' }>(`/api/orders/${id}/payment`, {
    method: 'POST', body: JSON.stringify(paid ? { paid, ...details } : { paid }),
  });
}

export async function exportarOrdens(filters: FiltrosOrdens) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/orders/export?${ordersParams(filters)}`, { credentials: 'include' });
  } catch {
    throw new Error('Não foi possível conectar ao servidor para exportar as ordens.');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ErroRequisicaoApi(body.message || 'Não foi possível exportar as ordens.', response.status, body.code);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url; link.download = 'ordens-de-servico.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function logout() {
  return request<void>('/api/auth/logout', { method: 'POST' });
}
