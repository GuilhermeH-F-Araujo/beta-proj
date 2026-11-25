/** Compara palavras sem acentos, aceitando trechos e pequenos erros de digitação. */
export function textoDeBusca(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function distancia(a: string, b: string, limite: number) {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  let duasAtras: number[] | null = null;
  let anterior = Array.from({ length: b.length + 1 }, (_, indice) => indice);
  for (let linha = 1; linha <= a.length; linha++) {
    const atual = [linha];
    let minimo = linha;
    for (let coluna = 1; coluna <= b.length; coluna++) {
      atual[coluna] = Math.min(
        anterior[coluna] + 1,
        atual[coluna - 1] + 1,
        anterior[coluna - 1] + (a[linha - 1] === b[coluna - 1] ? 0 : 1),
      );
      if (
        duasAtras &&
        linha > 1 &&
        coluna > 1 &&
        a[linha - 1] === b[coluna - 2] &&
        a[linha - 2] === b[coluna - 1]
      )
        atual[coluna] = Math.min(atual[coluna], duasAtras[coluna - 2] + 1);
      minimo = Math.min(minimo, atual[coluna]);
    }
    if (minimo > limite) return limite + 1;
    duasAtras = anterior;
    anterior = atual;
  }
  return anterior[b.length];
}

function palavraCombina(termo: string, palavra: string) {
  if (palavra.includes(termo)) return true;
  if (termo.length < 4) return false;
  const limite = termo.length >= 9 ? 2 : 1;
  const inicio = Math.max(1, termo.length - limite);
  const fim = Math.min(palavra.length, termo.length + limite);
  for (let tamanho = inicio; tamanho <= fim; tamanho++) {
    for (let indice = 0; indice <= palavra.length - tamanho; indice++) {
      if (distancia(termo, palavra.slice(indice, indice + tamanho), limite) <= limite)
        return true;
    }
  }
  return false;
}

export function correspondeBusca(consulta: string, conteudo: string) {
  const termos = textoDeBusca(consulta).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const numeros = consulta.replace(/\D/g, '');
  if (termos.length === 1 && numeros.length >= 5 && conteudo.replace(/\D/g, '').includes(numeros))
    return true;
  const palavras = textoDeBusca(conteudo).split(/\s+/).filter(Boolean);
  return termos.every((termo) => palavras.some((palavra) => palavraCombina(termo, palavra)));
}
