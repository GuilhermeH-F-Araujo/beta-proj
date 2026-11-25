import type { AcessoConta } from '../acessoConta';
import { request } from './transporte';

export type DadosEntrada = {
  identifier: string;
  password: string;
  remember: boolean;
};

export function entrar(conteudoEnviado: DadosEntrada) {
  return request<{
    user: {
      id: string;
      email: string | null;
      nome: string;
      telefone?: string | null;
      perfil: string;
      acesso: AcessoConta;
    };
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(conteudoEnviado),
  });
}

export function solicitarRecuperacaoSenha(email: string) {
  return request<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email, clientOrigin: window.location.origin }),
  });
}

export function redefinirSenha(conteudoEnviado: {
  password: string;
  tokenHash?: string;
  accessToken?: string;
  refreshToken?: string;
}) {
  return request<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(conteudoEnviado),
  });
}

export function buscarUsuarioAtual() {
  return request<{
    user: {
      id: string;
      email: string | null;
      nome: string;
      telefone?: string | null;
      perfil: string;
      acesso: AcessoConta;
    };
  }>('/api/auth/me', { method: 'GET' });
}

// Somente dados pessoais e de contato; campos de RH ficam na gestao de funcionarios.
export type PerfilFuncionario = {
  name: string;
  email: string;
  phone: string;
  cpfMasked: string;
  address: string;
  zipCode: string;
};
export type EdicaoMeuPerfil = Pick<PerfilFuncionario, 'name' | 'phone' | 'address' | 'zipCode'>;

export function buscarMeuPerfil() {
  return request<{ profile: PerfilFuncionario }>('/api/admin/profile', { method: 'GET' });
}

export function atualizarMeuPerfil(entrada: Partial<EdicaoMeuPerfil>) {
  return request<{ user: { nome: string; telefone: string | null } }>('/api/admin/profile', {
    method: 'PATCH',
    body: JSON.stringify(entrada),
  });
}

export function atualizarMinhaFoto(dados: string) {
  return request<{ ok: true }>('/api/admin/profile/photo', {
    method: 'PUT',
    body: JSON.stringify({ data: dados }),
  });
}

export function alterarMinhaSenha(
  senhaAtual: string,
  novaSenha: string,
  codigoAutenticador?: string,
) {
  return request<{ message: string }>('/api/admin/profile/password', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: senhaAtual,
      newPassword: novaSenha,
      ...(codigoAutenticador ? { authenticatorCode: codigoAutenticador } : {}),
    }),
  });
}

export function sair() {
  return request<void>('/api/auth/logout', { method: 'POST' });
}
