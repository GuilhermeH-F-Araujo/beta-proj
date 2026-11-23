import { useSyncExternalStore } from 'react';
export type AcessoConta = {
  administrador: boolean;
  nivel?: 'administrador' | 'superadministrador' | 'dono';
  cargo: string;
  permissoes: Record<
    string,
    Partial<Record<'visualizar' | 'criar' | 'editar' | 'excluir', boolean>>
  >;
};
let atual: AcessoConta = { administrador: false, cargo: '', permissoes: {} };
const observadores = new Set<() => void>();
export function setAcessoConta(primeiroElemento: AcessoConta) {
  atual = primeiroElemento;
  observadores.forEach((funcao) => funcao());
}
export function pode(modulo: string, acao = 'visualizar') {
  return (
    atual.administrador ||
    (atual.permissoes[modulo]?.visualizar === true &&
      atual.permissoes[modulo]?.[acao as 'visualizar'] === true)
  );
}
export function useAcessoConta() {
  return useSyncExternalStore(
    (funcao) => {
      observadores.add(funcao);
      return () => {
        observadores.delete(funcao);
      };
    },
    () => atual,
  );
}
export const moduloPagina = (caminho: string) =>
  caminho.startsWith('/clientes')
    ? 'clientes'
    : caminho.startsWith('/motocicletas') || caminho.startsWith('/miniaturas')
      ? 'motocicletas'
      : caminho.startsWith('/ordens-de-servico')
        ? 'ordens'
        : caminho.startsWith('/funcionarios')
          ? 'funcionarios'
          : caminho.startsWith('/servicos')
            ? 'servicos'
            : caminho.startsWith('/agendamentos')
              ? 'agendamentos'
              : caminho === '/dashboard'
                ? 'dashboard'
                : null;
