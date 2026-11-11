// One scheduler for mounted views. Mutations refresh immediately; remote changes are
// collected every 15s while visible. No navigation, filter reset or reload.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let queued: ReturnType<typeof setTimeout> | undefined;
function emitir() {
  if (!listeners.size || typeof document === "undefined") return;
  if (document.visibilityState === "hidden" || !navigator.onLine) return;
  for (const fn of listeners) fn();
}
function agendar() {
  clearTimeout(queued);
  queued = setTimeout(emitir, 200);
}
const canal =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("estacao-dados-v78")
    : null;
(canal as (BroadcastChannel & { unref?: () => void }) | null)?.unref?.();
canal?.addEventListener("message", agendar);
export function avisarAlteracaoDados() {
  agendar();
  canal?.postMessage("alterado");
}
export function observarDados(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    timer = setInterval(emitir, 15000);
    window.addEventListener("focus", agendar);
    window.addEventListener("online", agendar);
    document.addEventListener("visibilitychange", agendar);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
      clearTimeout(queued);
      window.removeEventListener("focus", agendar);
      window.removeEventListener("online", agendar);
      document.removeEventListener("visibilitychange", agendar);
    }
  };
}
