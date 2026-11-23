export type ContextoConfirmacao = {
  titulo: string;
  descricao: string;
  requireAuthenticator?: boolean;
  metodoForcado?: 'senha' | 'autenticador' | 'ambos';
  previsualizacao?: boolean;
  previsualizarObrigatoriedade?: boolean;
};
export type SessaoAdministrativa = {
  active: boolean;
  expiresAt: string | null;
  maximumExpiresAt: string | null;
  blockedUntil: string | null;
  mfaConfigured?: boolean;
  mfaName?: string | null;
};
let confirmar: ((contexto?: ContextoConfirmacao) => Promise<void>) | null = null;
let pendente: Promise<void> | null = null;

export function registrarConfirmacao(acao: NonNullable<typeof confirmar>) {
  confirmar = acao;
  return () => {
    if (confirmar === acao) confirmar = null;
    pendente = null;
  };
}
export function solicitarConfirmacao(contexto?: ContextoConfirmacao) {
  if (pendente) return pendente;
  if (!confirmar)
    return Promise.reject(new Error('Entre novamente para confirmar sua identidade.'));
  const atual = confirmar(contexto).finally(() => {
    if (pendente === atual) pendente = null;
  });
  pendente = atual;
  return atual;
}
