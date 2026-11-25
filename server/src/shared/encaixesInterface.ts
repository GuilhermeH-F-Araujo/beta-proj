export const posicoesInterface = [
  'esquerda',
  'direita',
  'superior-antes',
  'superior-depois',
  'inferior',
] as const;
export type PosicaoInterface = (typeof posicoesInterface)[number];
type Bloco = { id: string; atalho: string };
type Estrutura = {
  posicaoMenu: string;
  cabecalho: Bloco[];
  barras: { id: string; nome: string; posicao: string; itens: Bloco[] }[];
};
export const ladoEncaixe = (posicao: string) =>
  posicao.startsWith('superior-') ? 'superior' : posicao;
export function encaixesLivres(valor: Estrutura, area?: string) {
  const ocupados = new Set([
    ...(area === 'menu' ? [] : [ladoEncaixe(valor.posicaoMenu)]),
    ...valor.barras.filter((item) => item.id !== area).map((item) => ladoEncaixe(item.posicao)),
  ]);
  return posicoesInterface.filter((posicao) => !ocupados.has(ladoEncaixe(posicao)));
}
// Configuracoes antigas sao acomodadas sem renderizar duas barras no mesmo lado.
export function normalizarEncaixes<T extends Estrutura>(valor: T): T {
  const resultado = { ...valor, cabecalho: [...valor.cabecalho], barras: [] as T['barras'] };
  for (const barra of valor.barras) {
    const livres = encaixesLivres(resultado);
    const destino = livres.includes(barra.posicao as PosicaoInterface) ? barra.posicao : livres[0];
    if (destino) resultado.barras.push({ ...barra, posicao: destino });
    else {
      const existente = resultado.barras.find(
        (item) => ladoEncaixe(item.posicao) === ladoEncaixe(barra.posicao),
      );
      const itens = existente?.itens || resultado.cabecalho;
      const novos = barra.itens.filter((item) => !itens.some((atual) => atual.id === item.id));
      if (existente) existente.itens = [...itens, ...novos].slice(0, 24);
      else resultado.cabecalho = [...itens, ...novos].slice(0, 24);
    }
  }
  return resultado;
}
