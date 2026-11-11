import { useSyncExternalStore } from "react";
export type AcessoConta = {
  administrador: boolean;
  cargo: string;
  permissoes: Record<
    string,
    Partial<Record<"visualizar" | "criar" | "editar" | "excluir", boolean>>
  >;
};
let atual: AcessoConta = { administrador: false, cargo: "", permissoes: {} };
const listeners = new Set<() => void>();
export function definirAcessoConta(a: AcessoConta) {
  atual = a;
  listeners.forEach((fn) => fn());
}
export function pode(modulo: string, acao = "visualizar") {
  return (
    atual.administrador ||
    (atual.permissoes[modulo]?.visualizar === true &&
      atual.permissoes[modulo]?.[acao as "visualizar"] === true)
  );
}
export function useAcessoConta() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => atual,
  );
}
export const moduloPagina = (path: string) =>
  path.startsWith("/clientes")
    ? "clientes"
    : path.startsWith("/motocicletas")
      ? "motocicletas"
      : path.startsWith("/ordens-de-servico")
        ? "ordens"
        : path.startsWith("/funcionarios")
          ? "funcionarios"
          : path.startsWith("/servicos")
            ? "servicos"
            : path.startsWith("/agendamentos")
              ? "agendamentos"
              : path === "/dashboard"
                ? "dashboard"
                : null;
