import { solicitarConfirmacao } from '../confirmacaoAdministrativa';
// Centraliza cookies, tratamento de erros e aviso de alteracao dos dados.
// Os nomes dos campos JSON pertencem ao contrato HTTP e permanecem estaveis.
import { avisarAlteracaoDados } from '../atualizacaoDados';

export const API_URL = (
  (import.meta.env?.VITE_URL_API ?? import.meta.env?.VITE_API_URL) ||
  ''
).replace(/\/$/, '');

export type CorpoErroApi = {
  message?: string;
  code?: string;
  retryAfterSeconds?: number;
};

export class ErroRequisicaoApi extends Error {
  constructor(
    mensagem: string,
    public readonly situacao: number,
    public readonly codigo?: string,
    public readonly esperaSegundos = 0,
  ) {
    super(mensagem);
    this.name = 'ErroRequisicaoApi';
  }
}

export async function lerResposta<T>(response: Response): Promise<T> {
  if (response.ok && response.status === 204) return undefined as T;
  const tipoConteudo = response.headers.get('content-type') || '';
  const corpo = tipoConteudo.includes('application/json')
    ? ((await response.json().catch(() => ({}))) as CorpoErroApi & T)
    : null;

  if (!response.ok) {
    if (corpo?.message)
      throw new ErroRequisicaoApi(
        corpo.message,
        response.status,
        corpo.code,
        typeof corpo.retryAfterSeconds === 'number' ? Math.max(0, corpo.retryAfterSeconds) : 0,
      );
    const mensagem =
      response.status === 404 || tipoConteudo.includes('text/html')
        ? `A solicitação não chegou à API (HTTP ${response.status}). Inicie o projeto com npm run dev na pasta principal e abra a porta 5173.`
        : response.status >= 500
          ? `O servidor de acesso está indisponível (HTTP ${response.status}). Confira o terminal da API na porta 3001.`
          : `A API retornou uma resposta inesperada (HTTP ${response.status}). Reinicie npm run dev.`;
    throw new ErroRequisicaoApi(mensagem, response.status);
  }

  if (!corpo)
    throw new ErroRequisicaoApi(
      `A API retornou uma página em vez de JSON (HTTP ${response.status}). Confira o proxy e reinicie npm run dev.`,
      response.status,
    );
  return corpo;
}

export async function request<T>(caminho: string, inicializacao: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${caminho}`, {
      ...inicializacao,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(inicializacao.headers ?? {}),
      },
    });
  } catch {
    throw new Error(
      'Não foi possível conectar ao serviço de acesso. Verifique sua conexão e tente novamente.',
    );
  }

  if (response.status === 401 && !caminho.startsWith('/api/auth/'))
    window.dispatchEvent(new Event('admin-session-expired'));
  // A proteção pode primeiro exigir o cadastro do autenticador e, depois,
  // confirmar a ação que ficou pendente com os dois fatores.
  for (
    let tentativasDeConfirmacao = 0;
    response.status === 428 &&
    caminho !== '/api/admin/security/confirm' &&
    tentativasDeConfirmacao < 2;
    tentativasDeConfirmacao += 1
  ) {
    const corpo = await response
      .clone()
      .json()
      .catch(() => null);
    if (corpo?.code === 'REAUTH_REQUIRED') {
      await solicitarConfirmacao(
        corpo.operation &&
          typeof corpo.operation.titulo === 'string' &&
          typeof corpo.operation.descricao === 'string'
          ? corpo.operation
          : undefined,
      );
      response = await fetch(`${API_URL}${caminho}`, {
        ...inicializacao,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(inicializacao.headers ?? {}) },
      });
      if (response.status === 401) window.dispatchEvent(new Event('admin-session-expired'));
    }
  }
  const resultado = await lerResposta<T>(response);
  if (
    /^\/api\/admin\/security\/(?:confirm|lock|admins(?:\/.*)?)$/.test(caminho) &&
    inicializacao.method !== 'GET'
  )
    window.dispatchEvent(new Event('admin-security-change'));
  const metodo = (inicializacao.method || 'GET').toUpperCase();
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(metodo) &&
    /^\/api\/(?:clients(?:\/|$)|orders(?:\/|$)|admin\/users(?:\/|$))/.test(caminho)
  )
    window.dispatchEvent(new Event('admin-notifications-refresh'));
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(metodo) &&
    caminho.startsWith('/api/') &&
    !/\/(?:auth|postal-code|admin\/preferences|admin\/notifications|admin\/security\/(?:confirm|lock))(?:\/|$)/.test(
      caminho,
    )
  )
    avisarAlteracaoDados();
  return resultado;
}
