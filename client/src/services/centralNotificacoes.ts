import {
  buscarNotificacoesAdmin,
  type NotificacaoAdmin,
} from "./apiAutenticacao";
import { reproduzirSomDeNotificacaoNovo } from "./sonsNotificacao";
export type EstadoCentral = {
  items: NotificacaoAdmin[];
  loading: boolean;
  error: string;
};
let estado: EstadoCentral = { items: [], loading: true, error: "" };
let user = "";
let conhecidos: Set<number> | null = null;
let sequencia = 0;
let pendente: Promise<void> | null = null;
let repetir = false;
const ouvintes = new Set<() => void>();
const publicar = (proximo: EstadoCentral) => {
  estado = proximo;
  ouvintes.forEach((fn) => fn());
};
export const estadoNotificacoes = () => estado;
export const observarNotificacoes = (fn: () => void) => {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
};
export function configurarCentralNotificacoes(id: string) {
  if (user === id) return;
  user = id;
  sequencia++;
  conhecidos = null;
  pendente = null;
  repetir = false;
  publicar({ items: [], loading: true, error: "" });
}
export function atualizarCentralNotificacoes(): Promise<void> {
  if (pendente) {
    repetir = true;
    return pendente;
  }
  const atual = sequencia;
  pendente = (async () => {
    try {
      const resposta = await buscarNotificacoesAdmin();
      if (atual !== sequencia) return;
      const anteriores = conhecidos;
      const novos = resposta.items.filter(
        (item) => !item.read && !anteriores?.has(item.id),
      );
      conhecidos = new Set(resposta.items.map((item) => item.id));
      publicar({ items: resposta.items, loading: false, error: "" });
      if (anteriores && novos.length)
        void reproduzirSomDeNotificacaoNovo(novos.map((item) => item.kind));
    } catch (error) {
      if (atual === sequencia)
        publicar({
          ...estado,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os avisos.",
        });
    } finally {
      if (atual === sequencia) {
        pendente = null;
        if (repetir) {
          repetir = false;
          void atualizarCentralNotificacoes();
        }
      }
    }
  })();
  return pendente;
}
export function atualizarAvisoLocal(id: number, acao: "ler" | "dispensar") {
  sequencia++;
  pendente = null;
  repetir = false;
  publicar({
    ...estado,
    items:
      acao === "dispensar"
        ? estado.items.filter((item) => item.id !== id)
        : estado.items.map((item) =>
            item.id === id ? { ...item, read: true } : item,
          ),
  });
}
export function limparAvisosLocais() {
  sequencia++;
  pendente = null;
  repetir = false;
  publicar({ ...estado, items: [] });
}
