import { lerOrganizacaoInterface } from '../services/preferenciasGlobais';
import { useOrganizacaoInterface, useArrasteInterface } from '../services/organizacaoInterface';
export function useCartoesPagina<T>(
  pagina: string,
  itens: readonly T[],
  chave: (item: T) => string,
) {
  const valor = useOrganizacaoInterface(lerOrganizacaoInterface);
  const editando = useArrasteInterface();
  const visiveis = valor.cartoes[pagina];
  return editando || visiveis === undefined
    ? itens
    : itens.filter((item) => visiveis.includes(chave(item)));
}
export function useCartaoVisivel(pagina: string) {
  const valor = useOrganizacaoInterface(lerOrganizacaoInterface);
  return (id: string) => valor.cartoes[pagina] === undefined || valor.cartoes[pagina].includes(id);
}
