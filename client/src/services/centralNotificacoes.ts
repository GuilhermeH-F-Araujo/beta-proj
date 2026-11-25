// Somente eventos novos podem tocar. Reabrir a tela nao repete o aviso.
import { buscarNotificacoesAdministrador, type NotificacaoAdministrador } from './apiAutenticacao';
import { reproduzirSomDeNotificacaoNovo } from './sonsNotificacao';
export type EstadoCentral = {
  items: NotificacaoAdministrador[];
  loading: boolean;
  error: string;
};
let estado: EstadoCentral = { items: [], loading: true, error: '' };
let usuario = '';
let conhecidos: Set<number> | null = null;
let sequencia = 0;
let pendente: Promise<void> | null = null;
let repetir = false;
const ouvintes = new Set<() => void>();
const publicar = (proximo: EstadoCentral) => {
  estado = proximo;
  ouvintes.forEach((funcao) => funcao());
};
export const estadoNotificacoes = () => estado;
export const observarNotificacoes = (funcao: () => void) => {
  ouvintes.add(funcao);
  return () => {
    ouvintes.delete(funcao);
  };
};
export function configurarCentralNotificacoes(id: string) {
  if (usuario === id) return;
  usuario = id;
  sequencia++;
  conhecidos = null;
  pendente = null;
  repetir = false;
  publicar({ items: [], loading: true, error: '' });
}
export function atualizarCentralNotificacoes(): Promise<void> {
  if (pendente) {
    repetir = true;
    return pendente;
  }
  const atual = sequencia;
  pendente = (async () => {
    try {
      const res = await buscarNotificacoesAdministrador();
      if (atual !== sequencia) return;
      const anteriores = conhecidos;
      const novos = res.items.filter((item) => !item.read && !anteriores?.has(item.id));
      conhecidos = new Set(res.items.map((item) => item.id));
      publicar({ items: res.items, loading: false, error: '' });
      if (anteriores && novos.length)
        void reproduzirSomDeNotificacaoNovo(novos.map((item) => item.kind));
    } catch (erro) {
      if (atual === sequencia)
        publicar({
          ...estado,
          loading: false,
          error: erro instanceof Error ? erro.message : 'Não foi possível carregar os avisos.',
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
export function atualizarAvisoLocal(id: number, acao: 'ler' | 'dispensar') {
  sequencia++;
  pendente = null;
  repetir = false;
  publicar({
    ...estado,
    items:
      acao === 'dispensar'
        ? estado.items.filter((item) => item.id !== id)
        : estado.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
  });
}
export function limparAvisosLocais() {
  sequencia++;
  pendente = null;
  repetir = false;
  publicar({ ...estado, items: [] });
}
