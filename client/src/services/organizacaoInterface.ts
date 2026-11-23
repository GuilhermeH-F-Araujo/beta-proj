import { normalizarEncaixes } from '../../../server/src/shared/encaixesInterface';
export { encaixesLivres, ladoEncaixe } from '../../../server/src/shared/encaixesInterface';
import { useEffect, useState } from 'react';
import { atalhosInterface, cartoesInterface, rotasMenu } from './catalogoInterface';
export const posicoesBarra = [
  'esquerda',
  'direita',
  'superior-antes',
  'superior-depois',
  'inferior',
] as const;
export type PosicaoBarra = (typeof posicoesBarra)[number];
export type BlocoInterface = { id: string; atalho: string };
export type BarraInterface = {
  id: string;
  nome: string;
  posicao: PosicaoBarra;
  itens: BlocoInterface[];
};
export type OrganizacaoInterface = {
  posicaoMenu: PosicaoBarra;
  ordemMenu: string[];
  cabecalho: BlocoInterface[];
  barras: BarraInterface[];
  cartoes: Record<string, string[]>;
};
export function organizacaoPadrao(): OrganizacaoInterface {
  return {
    posicaoMenu: 'esquerda',
    ordemMenu: [...rotasMenu],
    cabecalho: ['pesquisa-geral', 'personalizar', 'nova-os', 'novo-usuario', 'notificacoes'].map(
      (atalho) => ({ id: `padrao-${atalho}`, atalho }),
    ),
    barras: [],
    cartoes: {},
  };
}
export function normalizarOrganizacao(
  entrada?: Partial<OrganizacaoInterface>,
): OrganizacaoInterface {
  const padrao = organizacaoPadrao();
  const posicao = (valor: unknown): PosicaoBarra =>
    posicoesBarra.includes(valor as PosicaoBarra) ? (valor as PosicaoBarra) : 'esquerda';
  const blocos = (itens: unknown): BlocoInterface[] =>
    Array.isArray(itens)
      ? itens
          .filter(
            (item) =>
              item &&
              typeof item.id === 'string' &&
              /^[a-z0-9-]{1,70}$/.test(item.id) &&
              atalhosInterface.some((atalho) => atalho.id === item.atalho),
          )
          .filter(
            (item, indice, lista) => lista.findIndex((outro) => outro.id === item.id) === indice,
          )
          .slice(0, 24)
          .map(({ id, atalho }) => ({ id, atalho }))
      : [];
  const ordem = Array.isArray(entrada?.ordemMenu)
    ? entrada.ordemMenu.filter((rota) => rotasMenu.includes(rota))
    : [];
  return normalizarEncaixes({
    posicaoMenu: posicao(entrada?.posicaoMenu),
    ordemMenu: [...new Set([...ordem, ...rotasMenu])],
    cabecalho: entrada?.cabecalho ? blocos(entrada.cabecalho) : padrao.cabecalho,
    barras: (Array.isArray(entrada?.barras) ? entrada.barras : [])
      .filter(
        (barra) => barra && typeof barra.id === 'string' && /^[a-z0-9-]{1,70}$/.test(barra.id),
      )
      .filter(
        (barra, indice, lista) => lista.findIndex((outra) => outra.id === barra.id) === indice,
      )
      .slice(0, 6)
      .map((barra) => ({
        id: barra.id,
        nome: typeof barra.nome === 'string' ? barra.nome.slice(0, 40) : 'Atalhos',
        posicao: posicao(barra.posicao),
        itens: blocos(barra.itens),
      })),
    cartoes: Object.fromEntries(
      Object.entries(entrada?.cartoes || {})
        .filter(([pagina, itens]) => pagina in cartoesInterface && Array.isArray(itens))
        .map(([pagina, itens]) => [
          pagina,
          [
            ...new Set(
              itens.filter((id) => cartoesInterface[pagina].itens.some((item) => item.id === id)),
            ),
          ].slice(0, 12),
        ]),
    ),
  });
}
export function novoBloco(atalho: string): BlocoInterface {
  return { id: `bloco-${crypto.randomUUID()}`, atalho };
}
export function moverItem<T>(lista: T[], de: number, para: number): T[] {
  if (de < 0 || para < 0 || de >= lista.length || para >= lista.length) return lista;
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}
export function abrirOrganizador() {
  window.dispatchEvent(new Event('app-organizar'));
}
// O gancho recebe o leitor para manter o modelo independente da sincronizacao.
export function useOrganizacaoInterface(ler: () => OrganizacaoInterface) {
  const [valor, setValor] = useState(ler);
  useEffect(() => {
    const atualizar = () => setValor(ler());
    atualizar();
    window.addEventListener('app-preferences-change', atualizar);
    return () => window.removeEventListener('app-preferences-change', atualizar);
  }, [ler]);
  return valor;
}
let modoArraste = false;
export function ativarArrasteInterface(ativo: boolean) {
  modoArraste = ativo;
  window.dispatchEvent(new Event('app-layout-drag'));
}
export function useArrasteInterface() {
  const [ativo, setAtivo] = useState(modoArraste);
  useEffect(() => {
    const atualizar = () => setAtivo(modoArraste);
    window.addEventListener('app-layout-drag', atualizar);
    return () => window.removeEventListener('app-layout-drag', atualizar);
  }, []);
  return ativo;
}
