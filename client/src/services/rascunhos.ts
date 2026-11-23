import { normalizarChaveArmazenamento } from './migrarArmazenamento';
// Rascunhos pertencem a conta e ficam neste navegador por ate sete dias.
// Senhas nao sao persistidas. Fotos e arquivos maiores usam IndexedDB.
let usuario = '';
const memoria = new Map<string, { valor: unknown; ate: number }>();
let bancoPromessa: Promise<IDBDatabase | null> | undefined;
const TTL = 7 * 86400000;
const prefixo = 'estacao-rascunho:';
function banco() {
  return (bancoPromessa ??= new Promise((resolver) => {
    if (typeof indexedDB === 'undefined') return resolver(null);
    const request = indexedDB.open('estacao-rascunhos', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('campos');
    request.onsuccess = () => resolver(request.result);
    request.onerror = () => resolver(null);
    request.onblocked = () => resolver(null);
  }));
}
const chave = (escopo: string, campo: string) => prefixo + usuario + ':' + escopo + ':' + campo;
export async function iniciarRascunhos(id: string) {
  usuario = id;
  memoria.clear();
  try {
    for (let indice = 0; indice < sessionStorage.length; indice++) {
      const chaveLocal = sessionStorage.key(indice)!;
      if (chaveLocal.startsWith(prefixo + id + ':')) {
        const itemAtual = JSON.parse(sessionStorage.getItem(chaveLocal)!);
        if (itemAtual.ate > Date.now()) memoria.set(chaveLocal, itemAtual);
        else sessionStorage.removeItem(chaveLocal);
      }
    }
  } catch {}
  const bancoLocal = await banco();
  if (!bancoLocal) return;
  await new Promise<void>((resolver) => {
    const transacao = bancoLocal.transaction('campos', 'readwrite');
    const cursor = transacao.objectStore('campos').openCursor();
    cursor.onsuccess = () => {
      const elementoAtual = cursor.result;
      if (!elementoAtual) return;
      const chaveOriginal = String(elementoAtual.key);
      const chaveLocal = normalizarChaveArmazenamento(chaveOriginal);
      if (chaveLocal !== chaveOriginal && elementoAtual.value.ate > Date.now()) {
        const armazenamento = transacao.objectStore('campos');
        const existente = armazenamento.get(chaveLocal);
        existente.onsuccess = () => {
          if (!existente.result || existente.result.ate < elementoAtual.value.ate)
            armazenamento.put(elementoAtual.value, chaveLocal);
        };
        elementoAtual.delete();
      }
      if (elementoAtual.value.ate <= Date.now()) elementoAtual.delete();
      else if (chaveLocal.startsWith(prefixo + id + ':')) {
        const anterior = memoria.get(chaveLocal);
        if (!anterior || anterior.ate < elementoAtual.value.ate)
          memoria.set(chaveLocal, elementoAtual.value);
      }
      elementoAtual.continue();
    };
    transacao.oncomplete = () => resolver();
    transacao.onerror = () => resolver();
    transacao.onabort = () => resolver();
  });
}
export function temRascunho(escopo: string, campo: string) {
  return !!usuario && !!memoria.get(chave(escopo, campo));
}
export function lerRascunho<T>(escopo: string, campo: string, inicial: T): T {
  if (!usuario) return inicial;
  const item = memoria.get(chave(escopo, campo));
  return item && item.ate > Date.now() ? (item.valor as T) : inicial;
}
export function gravarRascunho(escopo: string, campo: string, valor: unknown) {
  if (!usuario || /password|senha|token|secret|credencial/i.test(campo)) return;
  const chaveLocal = chave(escopo, campo);
  const item = { valor, ate: Date.now() + TTL };
  memoria.set(chaveLocal, item);
  try {
    const conteudoConteudoConteudoJson = JSON.stringify(item, (_, valorAtual) =>
      typeof valorAtual === 'number' && !Number.isFinite(valorAtual) ? null : valorAtual,
    );
    if (
      conteudoConteudoConteudoJson.length < 120000 &&
      !/"data:[^"]*base64/.test(conteudoConteudoConteudoJson) &&
      !(valor instanceof File)
    )
      sessionStorage.setItem(chaveLocal, conteudoConteudoConteudoJson);
    else sessionStorage.removeItem(chaveLocal);
  } catch {}
  void banco().then((bancoLocal) => {
    if (!bancoLocal) return;
    try {
      const transacaoLocal = bancoLocal.transaction('campos', 'readwrite');
      transacaoLocal.objectStore('campos').put(item, chaveLocal);
      transacaoLocal.onerror = () => window.dispatchEvent(new Event('draft-storage-error'));
    } catch {
      window.dispatchEvent(new Event('draft-storage-error'));
    }
  });
}
export function limparRascunho(escopo: string) {
  const inicio = prefixo + usuario + ':' + escopo + ':';
  for (const chaveLocal of [...memoria.keys()])
    if (chaveLocal.startsWith(inicio)) {
      memoria.delete(chaveLocal);
      try {
        sessionStorage.removeItem(chaveLocal);
      } catch {}
      void banco().then((bancoLocal) => {
        if (bancoLocal) {
          const transacaoLocal = bancoLocal.transaction('campos', 'readwrite');
          transacaoLocal.objectStore('campos').delete(chaveLocal);
        }
      });
    }
}
export function suspenderRascunhos() {
  usuario = '';
  memoria.clear();
}
