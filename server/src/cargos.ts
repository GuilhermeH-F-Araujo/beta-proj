import { eventosNotificacao, gruposNotificacao } from './shared/catalogoNotificacoes.js';
import type { SupabaseClient } from '@supabase/supabase-js';
const operacoes = ['visualizar', 'criar', 'editar', 'excluir'] as const;
export type Acesso = {
  administrador: boolean;
  nivel?: 'administrador' | 'superadministrador' | 'dono';
  cargo: string;
  permissoes: Record<string, Partial<Record<(typeof operacoes)[number], boolean>>>;
};
const normal = (valorAtual: string) =>
  (valorAtual ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
const permissoesFixas: Record<string, Acesso['permissoes']> = {
  gerente: {
    dashboard: { visualizar: true },
    clientes: { visualizar: true },
    ordens: { visualizar: true, criar: true, editar: true },
    motocicletas: { visualizar: true },
    funcionarios: { visualizar: true },
  },
  mecanico: {
    ordens: { visualizar: true, editar: true },
    motocicletas: { visualizar: true },
  },
  atendente: {
    dashboard: { visualizar: true },
    clientes: { visualizar: true, criar: true, editar: true },
    ordens: { visualizar: true, criar: true },
    motocicletas: { visualizar: true },
    agendamentos: { visualizar: true, criar: true, editar: true },
  },
};
export const administrador = (registroAtual: { cargo: string; perfil_acesso: string }) =>
  normal(registroAtual.cargo) === 'administrador' &&
  normal(registroAtual.perfil_acesso) === 'administrador';
export async function lerAcesso(
  db: SupabaseClient,
  perfil: { id_funcionario: number; cargo: string; perfil_acesso: string },
): Promise<Acesso | null> {
  if (administrador(perfil)) {
    const { data: estado, error } = await db.rpc('consultar_nivel_administrativo', {
      p_usuario: (perfil as typeof perfil & { auth_user_id?: string }).auth_user_id,
    });
    if (error) throw error;
    if (!estado) return null;
    const nivel = estado as 'administrador' | 'superadministrador' | 'dono';
    const cargo =
      nivel === 'dono'
        ? 'Dono'
        : nivel === 'superadministrador'
          ? 'Superadministrador'
          : 'Administrador';
    return { administrador: true, nivel, cargo, permissoes: {} };
  }
  const cargo = normal(perfil.cargo);
  const permissoes = permissoesFixas[cargo];
  return permissoes ? { administrador: false, cargo: perfil.cargo, permissoes } : null;
}
export function permitir(primeiroElemento: Acesso, modulo: string, acao: string) {
  return (
    primeiroElemento.administrador ||
    (primeiroElemento.permissoes[modulo]?.visualizar === true &&
      primeiroElemento.permissoes[modulo]?.[acao as 'visualizar'] === true)
  );
}
export function tiposAvisos(primeiroElemento: Acesso): string[] | null {
  if (primeiroElemento.administrador) return null;
  const grupos = new Set(
    gruposNotificacao
      .filter(
        ({ modulo }) => modulo !== 'miniaturas' && permitir(primeiroElemento, modulo, 'visualizar'),
      )
      .map(({ titulo }) => titulo),
  );
  return eventosNotificacao.filter(({ grupo }) => grupos.has(grupo)).map(({ id }) => id);
}
export function permitirRequisicao(
  primeiroElemento: Acesso,
  metodo: string,
  caminho: string,
  corpo?: unknown,
) {
  if (primeiroElemento.administrador) return true;
  const registroAtual = caminho.split('?')[0].replace(/\/+$/, '');
  if (metodo === 'HEAD') metodo = 'GET';
  if (metodo === 'GET' && /^\/api\/postal-code\/\d{8}$/.test(registroAtual))
    return ['clientes', 'funcionarios', 'configuracoes'].some((modulo) =>
      permitir(primeiroElemento, modulo, 'visualizar'),
    );
  if (metodo === 'GET' && registroAtual === '/api/shared/catalogo/stream')
    return (
      primeiroElemento.administrador ||
      Object.keys(primeiroElemento.permissoes).some((modulo) =>
        permitir(primeiroElemento, modulo, 'visualizar'),
      )
    );
  if (/^\/api\/shared\/catalogo$/.test(registroAtual))
    return (
      ['GET', 'PUT'].includes(metodo) &&
      permitir(primeiroElemento, 'servicos', 'visualizar')
    );
  if (metodo === 'GET' && registroAtual === '/api/employees/options')
    return (
      permitir(primeiroElemento, 'agendamentos', 'visualizar') ||
      permitir(primeiroElemento, 'ordens', 'criar')
    );
  if (metodo === 'POST' && registroAtual === '/api/admin/users') {
    const segundoElemento = corpo as { position?: string; profile?: string } | null;
    return (
      segundoElemento?.position === 'Cliente' &&
      segundoElemento.profile === 'Cliente' &&
      permitir(primeiroElemento, 'clientes', 'criar')
    );
  }
  if (metodo === 'GET' && registroAtual === '/api/orders/create-options')
    return (
      permitir(primeiroElemento, 'ordens', 'visualizar') ||
      permitir(primeiroElemento, 'motocicletas', 'visualizar')
    );
  if (/^\/api\/admin\/security\/(confirm|lock|session)$/.test(registroAtual)) return true;
  if (metodo === 'GET' && registroAtual === '/api/admin/search') return true;
  if (/^\/api\/admin\/(profile(?:\/|$)|preferences(?:\/|$))/.test(registroAtual)) return true;
  if (/^\/api\/admin\/notifications(?:\/|$)/.test(registroAtual)) return true;
  let modulo = /^\/api\/orders(?:\/|$)/.test(registroAtual)
    ? 'ordens'
    : /^\/api\/clients(?:\/|$)/.test(registroAtual)
      ? 'clientes'
      : /^\/api\/motorcycles(?:\/|$)/.test(registroAtual)
        ? 'motocicletas'
        : /^\/api\/employees(?:\/|$)/.test(registroAtual)
          ? 'funcionarios'
          : /^\/api\/agendamentos(?:\/|$)/.test(registroAtual)
            ? 'agendamentos'
          : registroAtual === '/api/admin/dashboard'
            ? 'dashboard'
            : '';
  if (/^\/api\/motorcycle-(brands|models|thumbnails)(?:\/|$)/.test(registroAtual))
    return (
      metodo === 'GET' &&
      (permitir(primeiroElemento, 'motocicletas', 'visualizar') ||
        permitir(primeiroElemento, 'ordens', 'visualizar'))
    );
  if (!modulo) return false;
  if (modulo === 'funcionarios' && metodo !== 'GET') return false;
  const acao =
    metodo === 'GET'
      ? 'visualizar'
      : metodo === 'DELETE'
        ? 'excluir'
        : metodo === 'POST' &&
        ['/api/orders', '/api/clients', '/api/motorcycles', '/api/agendamentos'].includes(
          registroAtual,
        )
          ? 'criar'
          : 'editar';
  return permitir(primeiroElemento, modulo, acao);
}
