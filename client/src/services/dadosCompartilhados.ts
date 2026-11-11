import { request } from "./apiAutenticacao";
type Snapshot<T> = { dados: T | null; versao: number };
const versoes = new Map<string, number>(),
  valores = new Map<string, unknown>();
export async function buscarCompartilhado<T>(
  chave: "catalogo" | "agenda",
): Promise<T | null> {
  const result = await request<Snapshot<T>>("/api/shared/" + chave, {
    method: "GET",
  });
  if (result.versao < (versoes.get(chave) ?? 0))
    return valores.get(chave) as T | null;
  versoes.set(chave, result.versao);
  valores.set(chave, result.dados);
  return result.dados;
}
export async function salvarCompartilhado<T>(
  chave: "catalogo" | "agenda",
  dados: T,
): Promise<T> {
  if (!versoes.has(chave)) await buscarCompartilhado(chave);
  let result: Snapshot<T>;
  try {
    result = await request<Snapshot<T>>("/api/shared/" + chave, {
      method: "PUT",
      body: JSON.stringify({ versao: versoes.get(chave), dados }),
    });
  } catch (e) {
    if ((e as { status?: number }).status === 409)
      await buscarCompartilhado<T>(chave).catch(() => {});
    throw e;
  }
  if (result.dados === null)
    throw new Error("O servidor não confirmou o cadastro.");
  if (result.versao < (versoes.get(chave) ?? 0)) return valores.get(chave) as T;
  versoes.set(chave, result.versao);
  valores.set(chave, result.dados);
  return result.dados;
}
