// Drafts stay on this browser, partitioned by authenticated account. Passwords and
// credentials must never be passed to this module. Large photos/files use IndexedDB.
let usuario = "";
const memoria = new Map<string, { valor: unknown; ate: number }>();
let dbPromise: Promise<IDBDatabase | null> | undefined;
const TTL = 7 * 86400000,
  prefix = "estacao-rascunho-v78:";
function banco() {
  return (dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open("estacao-rascunhos", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("campos");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  }));
}
const chave = (scope: string, field: string) =>
  prefix + usuario + ":" + scope + ":" + field;
export async function iniciarRascunhos(id: string) {
  usuario = id;
  memoria.clear();
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!;
      if (key.startsWith(prefix + id + ":")) {
        const x = JSON.parse(sessionStorage.getItem(key)!);
        if (x.ate > Date.now()) memoria.set(key, x);
        else sessionStorage.removeItem(key);
      }
    }
  } catch {}
  const db = await banco();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction("campos", "readwrite"),
      cursor = transaction.objectStore("campos").openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      const key = String(c.key);
      if (c.value.ate <= Date.now()) c.delete();
      else if (key.startsWith(prefix + id + ":")) memoria.set(key, c.value);
      c.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}
export function temRascunho(scope: string, field: string) {
  return !!usuario && !!memoria.get(chave(scope, field));
}
export function lerRascunho<T>(scope: string, field: string, inicial: T): T {
  if (!usuario) return inicial;
  const item = memoria.get(chave(scope, field));
  return item && item.ate > Date.now() ? (item.valor as T) : inicial;
}
export function gravarRascunho(scope: string, field: string, valor: unknown) {
  if (!usuario || /password|senha|token|secret|credencial/i.test(field)) return;
  const key = chave(scope, field),
    item = { valor, ate: Date.now() + TTL };
  memoria.set(key, item);
  try {
    const json = JSON.stringify(item, (_, v) =>
      typeof v === "number" && !Number.isFinite(v) ? null : v,
    );
    if (
      json.length < 120000 &&
      !/"data:[^"]*base64/.test(json) &&
      !(valor instanceof File)
    )
      sessionStorage.setItem(key, json);
    else sessionStorage.removeItem(key);
  } catch {}
  void banco().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction("campos", "readwrite");
      tx.objectStore("campos").put(item, key);
      tx.onerror = () => window.dispatchEvent(new Event("draft-storage-error"));
    } catch {
      window.dispatchEvent(new Event("draft-storage-error"));
    }
  });
}
export function limparRascunho(scope: string) {
  const start = prefix + usuario + ":" + scope + ":";
  for (const key of [...memoria.keys()])
    if (key.startsWith(start)) {
      memoria.delete(key);
      try {
        sessionStorage.removeItem(key);
      } catch {}
      void banco().then((db) => {
        if (db) {
          const tx = db.transaction("campos", "readwrite");
          tx.objectStore("campos").delete(key);
        }
      });
    }
}
export function suspenderRascunhos() {
  usuario = "";
  memoria.clear();
}
