import { pode } from './acessoConta';
import { buscarCompartilhado, salvarCompartilhado } from './dadosCompartilhados';
export type CategoriaServico = {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  icone: string;
};
export type ItemCatalogoServico = {
  id: string;
  nome: string;
  categoriaId: string;
  descricao: string;
  preco: number;
  custo: number;
  duracao: string;
  ativo: boolean;
  icone: string;
  adicional: string;
};
export type CatalogoServicos = { categorias: CategoriaServico[]; servicos: ItemCatalogoServico[] };

let catalogoMemoria: CatalogoServicos | undefined;
const CHAVE_ARMAZENAMENTO = 'estacao-motos-catalogo-servicos';
export const CATALOGO_SERVICOS_EVENTO = 'estacao-motos-catalogo-servicos-atualizado';
const padroes: CatalogoServicos = { categorias: [], servicos: [] };

export function lerCatalogoServicos(): CatalogoServicos {
  if (catalogoMemoria) return catalogoMemoria;
  try {
    const bruto = localStorage.getItem(CHAVE_ARMAZENAMENTO);
    if (!bruto) return padroes;
    const valor = JSON.parse(bruto) as Partial<CatalogoServicos>;
    if (!Array.isArray(valor.categorias) || !Array.isArray(valor.servicos)) return padroes;
    return { categorias: valor.categorias, servicos: valor.servicos };
  } catch {
    return padroes;
  }
}
export async function salvarCatalogoServicos(catalogo: CatalogoServicos) {
  const anterior = lerCatalogoServicos();
  if (
    (catalogo.servicos.some(
      (textoAtual) =>
        !anterior.servicos.some((primeiroElemento) => primeiroElemento.id === textoAtual.id),
    ) &&
      !pode('servicos', 'criar')) ||
    (anterior.servicos.some(
      (textoAtual) =>
        !catalogo.servicos.some((primeiroElemento) => primeiroElemento.id === textoAtual.id),
    ) &&
      !pode('servicos', 'excluir')) ||
    (catalogo.servicos.some((textoAtual) => {
      const primeiroElemento = anterior.servicos.find(
        (primeiroElemento) => primeiroElemento.id === textoAtual.id,
      );
      return primeiroElemento && JSON.stringify(primeiroElemento) !== JSON.stringify(textoAtual);
    }) &&
      !pode('servicos', 'editar')) ||
    (JSON.stringify(catalogo.categorias) !== JSON.stringify(anterior.categorias) &&
      !pode('servicos', 'editar'))
  )
    throw new Error('Seu cargo não permite alterar este item do catálogo.');
  await salvarCompartilhado('catalogo', catalogo);
  receberCatalogo(catalogo);
}
export function receberCatalogo(catalogo: CatalogoServicos) {
  catalogoMemoria = catalogo;
  try {
    const antigo = localStorage.getItem(CHAVE_ARMAZENAMENTO);
    if (antigo && !localStorage.getItem(CHAVE_ARMAZENAMENTO + '-backup-anterior'))
      localStorage.setItem(CHAVE_ARMAZENAMENTO + '-backup-anterior', antigo);
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(catalogo));
  } catch {
    /* A gravacao no servidor ja foi confirmada; cache indisponivel nao desfaz a operacao. */
  }
  window.dispatchEvent(new CustomEvent(CATALOGO_SERVICOS_EVENTO));
}
export function observarCatalogoServicos(retorno: () => void) {
  window.addEventListener(CATALOGO_SERVICOS_EVENTO, retorno);
  const alterado = (evento: StorageEvent) => {
    if (evento.key === CHAVE_ARMAZENAMENTO) {
      catalogoMemoria = undefined;
      retorno();
    }
  };
  window.addEventListener('storage', alterado);
  return () => {
    window.removeEventListener(CATALOGO_SERVICOS_EVENTO, retorno);
    window.removeEventListener('storage', alterado);
  };
}

export async function atualizarCatalogoCompartilhado() {
  const resultado = await buscarCompartilhado<CatalogoServicos>('catalogo');
  if (resultado) {
    receberCatalogo(resultado);
    return resultado;
  }
  if (!pode('servicos', 'criar')) {
    const vazio = { categorias: [], servicos: [] };
    receberCatalogo(vazio);
    return vazio;
  }
  const vazio: CatalogoServicos = { categorias: [], servicos: [] };
  receberCatalogo(vazio);
  return vazio;
}
