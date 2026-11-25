import { request } from './transporte';

export type DadosNovoUsuario = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  position: 'Administrador' | 'Cliente' | 'Mecânico';
  profile: 'Administrador' | 'Cliente' | 'Mecânico';
  password: string;
};

export function cadastrarUsuario(entrada: DadosNovoUsuario) {
  return request<{ id: number; approvalPending?: boolean }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(entrada),
  });
}
