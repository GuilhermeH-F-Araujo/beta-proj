// Uma única conexão SSE acorda as listas quando o servidor recebe um evento
// Realtime do Postgres. As leituras ficam sob demanda; não há polling periódico.
const API_URL = (
  (import.meta.env?.VITE_URL_API ?? import.meta.env?.VITE_API_URL) || ''
).replace(/\/$/, '');
const ESPERA_APOS_ALTERACAO_MS = 180;

const observadores = new Set<() => void>();
let eventos: EventSource | null = null;
let naFila: ReturnType<typeof setTimeout> | undefined;
function emitir() {
  if (!observadores.size || typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden' || !navigator.onLine) return;
  for (const funcao of observadores) funcao();
}
function agendar() {
  clearTimeout(naFila);
  naFila = setTimeout(emitir, ESPERA_APOS_ALTERACAO_MS);
}
function abrirEventos() {
  if (eventos || typeof EventSource === 'undefined') return;
  eventos = new EventSource(`${API_URL}/api/shared/catalogo/stream`, { withCredentials: true });
  eventos.addEventListener('dados-atualizados', agendar);
  eventos.addEventListener('open', agendar);
}
function fecharEventos() {
  eventos?.removeEventListener('dados-atualizados', agendar);
  eventos?.removeEventListener('open', agendar);
  eventos?.close();
  eventos = null;
}

const canal =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('estacao-dados') : null;
(canal as (BroadcastChannel & { unref?: () => void }) | null)?.unref?.();
canal?.addEventListener('message', agendar);

export function avisarAlteracaoDados() {
  agendar();
  canal?.postMessage('alterado');
}

export function observarDados(funcao: () => void) {
  observadores.add(funcao);
  abrirEventos();
  if (observadores.size === 1) {
    window.addEventListener('focus', agendar);
    window.addEventListener('online', agendar);
    document.addEventListener('visibilitychange', agendar);
  }
  return () => {
    observadores.delete(funcao);
    if (!observadores.size) {
      fecharEventos();
      clearTimeout(naFila);
      window.removeEventListener('focus', agendar);
      window.removeEventListener('online', agendar);
      document.removeEventListener('visibilitychange', agendar);
    }
  };
}
