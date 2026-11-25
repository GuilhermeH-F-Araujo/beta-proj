import { request } from './apiAutenticacao';
import { API_URL } from './api/transporte';
type RetratoDados<T> = { dados: T | null; versao: number };
const versoes = new Map<string, number>();
const valores = new Map<string, unknown>();
export function observarAtualizacaoCatalogo(callback: () => void) {
  if (typeof EventSource === 'undefined') return () => {};
  const eventos = new EventSource(`${API_URL}/api/shared/catalogo/stream`, {
    withCredentials: true,
  });
  eventos.addEventListener('catalogo-atualizado', callback);
  return () => {
    eventos.removeEventListener('catalogo-atualizado', callback);
    eventos.close();
  };
}
export async function buscarCompartilhado<T>(chave: 'catalogo'): Promise<T | null> {
  const resultado = await request<RetratoDados<T>>('/api/shared/' + chave, {
    method: 'GET',
  });
  if (resultado.versao < (versoes.get(chave) ?? 0)) return valores.get(chave) as T | null;
  versoes.set(chave, resultado.versao);
  valores.set(chave, resultado.dados);
  return resultado.dados;
}
export async function salvarCompartilhado<T>(chave: 'catalogo', dados: T): Promise<T> {
  if (!versoes.has(chave)) await buscarCompartilhado(chave);
  let resultado: RetratoDados<T>;
  try {
    resultado = await request<RetratoDados<T>>('/api/shared/' + chave, {
      method: 'PUT',
      body: JSON.stringify({ versao: versoes.get(chave), dados }),
    });
  } catch (erroCapturado) {
    if ((erroCapturado as { status?: number }).status === 409)
      await buscarCompartilhado<T>(chave).catch(() => {});
    throw erroCapturado;
  }
  if (resultado.dados === null) throw new Error('O servidor não confirmou o cadastro.');
  if (resultado.versao < (versoes.get(chave) ?? 0)) return valores.get(chave) as T;
  versoes.set(chave, resultado.versao);
  valores.set(chave, resultado.dados);
  return resultado.dados;
}
