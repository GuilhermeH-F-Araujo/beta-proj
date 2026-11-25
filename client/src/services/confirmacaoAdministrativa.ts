export type ContextoConfirmacao = {
  titulo: string;
  descricao: string;
  requireAuthenticator?: boolean;
  metodoForcado?: 'senha' | 'autenticador' | 'ambos';
  previsualizacao?: boolean;
  previsualizarObrigatoriedade?: boolean;
  // 'sensivel' abre a janela de confianca de algumas horas; 'critica' vale so para agora.
  nivel?: 'sensivel' | 'critica';
};
export type SessaoAdministrativa = {
  active: boolean;
  expiresAt: string | null;
  maximumExpiresAt: string | null;
  blockedUntil: string | null;
  mfaConfigured?: boolean;
  mfaName?: string | null;
  confirmedAt?: string | null;
};
const CHAVE_METODO = 'estacao:metodo-confirmacao';
// Lembra o ultimo metodo usado neste aparelho (nao guarda credenciais).
export function metodoPreferido(): 'senha' | 'autenticador' | null {
  try {
    const valor = window.localStorage.getItem(CHAVE_METODO);
    return valor === 'senha' || valor === 'autenticador' ? valor : null;
  } catch {
    return null;
  }
}
export function lembrarMetodo(metodo: 'senha' | 'autenticador') {
  try {
    window.localStorage.setItem(CHAVE_METODO, metodo);
  } catch {
    /* Armazenamento indisponivel: apenas nao lembra. */
  }
}
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
