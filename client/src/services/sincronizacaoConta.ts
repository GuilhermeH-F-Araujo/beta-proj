import { request } from "./apiAutenticacao";
export type SecaoPreferencia = "leitura" | "notificacoes" | "seguranca";
type Pendente = { valor: unknown; versao: number };
export type EstadoSincronizacao = {
  estado: "carregando" | "salvando" | "salvo" | "erro";
  mensagem: string;
};
let escutando = false;
let conta = "";
let geracao = 0;
let fila: Partial<Record<SecaoPreferencia, Pendente>> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let executando: Promise<void> | null = null;
let contador = 0;
let status: EstadoSincronizacao = {
  estado: "carregando",
  mensagem: "Carregando preferências da conta…",
};
const listeners = new Set<() => void>();
export const contaPreferenciasAtual = () => conta;
export const estadoSincronizacao = () => status;
export const observarSincronizacao = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const publicar = (estado: EstadoSincronizacao["estado"], mensagem: string) => {
  status = { estado, mensagem };
  listeners.forEach((fn) => fn());
};
const chaveFila = (id = conta) => `estacao-conta-${id}-alteracoes-pendentes`;
function persistir() {
  try {
    localStorage.setItem(chaveFila(), JSON.stringify(fila));
  } catch {}
}
export function iniciarSincronizacaoConta(id: string) {
  if (!escutando && typeof window.addEventListener === "function") {
    const retomar = () => {
      if (conta && Object.keys(fila).length)
        void sincronizarPreferenciasConta();
    };
    window.addEventListener("online", retomar);
    escutando = true;
  }
  if (conta === id) return;
  conta = id;
  geracao++;
  clearTimeout(timer);
  executando = null;
  try {
    fila = JSON.parse(localStorage.getItem(chaveFila()) || "{}") || {};
  } catch {
    fila = {};
  }
  for (const [key, value] of Object.entries(fila))
    if (
      !["leitura", "notificacoes", "seguranca"].includes(key) ||
      !value ||
      typeof value !== "object" ||
      !("valor" in value)
    )
      delete fila[key as SecaoPreferencia];
  contador = Math.max(0, ...Object.values(fila).map((v) => v?.versao || 0));
  publicar("carregando", "Carregando preferências da conta…");
}
export const preferenciaPendente = (secao: SecaoPreferencia) =>
  fila[secao]?.valor;
export function enfileirarPreferenciaConta(
  secao: SecaoPreferencia,
  valor: unknown,
) {
  if (!conta) return;
  fila[secao] = { valor, versao: ++contador };
  persistir();
  publicar("salvando", "Salvando suas preferências na conta…");
  clearTimeout(timer);
  timer = setTimeout(() => void sincronizarPreferenciasConta(), 500);
}
export function sincronizarPreferenciasConta(): Promise<void> {
  if (!conta) return Promise.resolve();
  if (executando) return executando;
  clearTimeout(timer);
  const owner = conta,
    generation = geracao;
  executando = (async () => {
    try {
      while (generation === geracao) {
        const entry = Object.entries(fila)[0] as
          [SecaoPreferencia, Pendente] | undefined;
        if (!entry) break;
        const [secao, alteracao] = entry;
        publicar("salvando", "Salvando suas preferências na conta…");
        const resposta = await request<{ ok: true; conta: string }>(
          `/api/admin/preferences/${secao}`,
          {
            method: "PUT",
            body: JSON.stringify({ conta: owner, valor: alteracao.valor }),
          },
        );
        if (generation !== geracao) return;
        if (resposta.conta !== owner)
          throw new Error("A conta mudou. Entre novamente antes de salvar.");
        if (fila[secao]?.versao === alteracao.versao) delete fila[secao];
        persistir();
      }
      if (generation === geracao)
        publicar("salvo", "Preferências salvas na sua conta.");
    } catch (error) {
      if (generation === geracao) {
        publicar(
          "erro",
          error instanceof Error
            ? error.message
            : "Sem conexão. Suas alterações serão sincronizadas assim que possível.",
        );
        timer = setTimeout(() => void sincronizarPreferenciasConta(), 10000);
      }
    } finally {
      if (generation === geracao) executando = null;
    }
  })();
  return executando;
}
export function concluirCarregamentoConta() {
  if (Object.keys(fila).length) void sincronizarPreferenciasConta();
  else publicar("salvo", "Preferências salvas na sua conta.");
}
export function sinalizarFalhaSincronizacao(message: string) {
  publicar("erro", message);
}
export type PreferenciasRemotas = {
  conta: string;
  leitura: Record<string, unknown> | null;
  notificacoes: Record<string, unknown> | null;
  seguranca: { inatividade?: number } | null;
  somVersao: string | null;
  atualizadoEm: string | null;
};
export const buscarPreferenciasConta = () =>
  request<PreferenciasRemotas>("/api/admin/preferences", { method: "GET" });
export type SomRemoto = {
  name: string;
  base64: string;
  duration: number;
  size: number;
  mimeType: string;
};
export async function enviarSomConta(
  valor: { name: string; base64: string } | null,
) {
  if (!conta) return null;
  const owner = conta;
  const result = await request<{ conta: string; somVersao: string | null }>(
    "/api/admin/preferences/som",
    { method: "PUT", body: JSON.stringify({ conta: owner, valor }) },
  );
  if (result.conta !== owner || conta !== owner)
    throw new Error("A conta mudou durante o envio. Entre novamente.");
  return result.somVersao;
}
export async function buscarSomConta() {
  const owner = conta;
  if (!owner) return null;
  const result = await request<{
    conta: string;
    som: SomRemoto | null;
    versao: string | null;
  }>("/api/admin/preferences/som", { method: "GET" });
  if (result.conta !== owner || conta !== owner)
    throw new Error("A conta mudou durante a consulta do áudio.");
  return result;
}

export const temAlteracoesPendentes = () => Object.keys(fila).length > 0;
export function suspenderSincronizacaoConta() {
  if (conta) persistir();
  clearTimeout(timer);
  geracao++;
  conta = "";
  fila = {};
  executando = null;
}
