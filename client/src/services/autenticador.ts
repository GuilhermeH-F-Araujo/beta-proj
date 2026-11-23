import { request } from './api/transporte';

export type EstadoAutenticador = { configured: boolean; name: string | null };
export type CadastroAutenticador = { factorId: string; qrCode: string; secret: string };

/** Status do fator TOTP da conta autenticada. */
export function consultarAutenticador() {
  return request<EstadoAutenticador>('/api/admin/security/mfa', { method: 'GET' });
}

/** Abre um cadastro novo. A API exige confirmação recente da senha. */
export function iniciarCadastroAutenticador() {
  return request<CadastroAutenticador>('/api/admin/security/mfa/enroll', { method: 'POST' });
}

/** Confirma o código gerado pelo aplicativo e ativa o fator TOTP. */
export function verificarCadastroAutenticador(factorId: string, code: string) {
  return request<{ configured: true }>('/api/admin/security/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ factorId, code }),
  });
}

/** Confirma a senha e, quando exigido, o TOTP para qualquer ação protegida. */
export function confirmarIdentidadeAdministrativa(
  password: string,
  options: { code?: string; method?: 'password' | 'authenticator' | 'both'; requireAuthenticator?: boolean; employeeApproval?: boolean } = {},
) {
  return request('/api/admin/security/confirm', {
    method: 'POST',
    body: JSON.stringify({ ...(password ? { password } : {}), ...options }),
  });
}

/** Valida a senha no servidor sem autorizar a acao protegida nem emitir prova. */
export function validarSenhaAdministrativa(password: string) {
  return request<{ passwordVerified: true }>('/api/admin/security/confirm', {
    method: 'POST',
    body: JSON.stringify({ password, phase: 'password' }),
  });
}
