export function relevanciaTexto(consulta: string, texto: string) {
  const normalizar = (valor: string) =>
    valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const termos = normalizar(consulta).split(/\s+/).filter(Boolean);
  const palavras = normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
  if (!termos.length) return 0;
  const combina = (termo: string, palavra: string) => {
    if (palavra.includes(termo)) return true;
    if (termo.length < 4) return false;
    const limite = termo.length >= 9 ? 2 : 1;
    const inicial = Math.max(1, termo.length - limite);
    const final = Math.min(palavra.length, termo.length + limite);
    for (let tamanho = inicial; tamanho <= final; tamanho++) {
      for (let inicio = 0; inicio <= palavra.length - tamanho; inicio++) {
        const candidata = palavra.slice(inicio, inicio + tamanho);
        if (Math.abs(termo.length - candidata.length) > limite) continue;
        let anterior = Array.from({ length: candidata.length + 1 }, (_, indice) => indice);
        for (let linha = 1; linha <= termo.length; linha++) {
          const atual = [linha];
          for (let coluna = 1; coluna <= candidata.length; coluna++)
            atual[coluna] = Math.min(
              atual[coluna - 1] + 1,
              anterior[coluna] + 1,
              anterior[coluna - 1] + (termo[linha - 1] === candidata[coluna - 1] ? 0 : 1),
            );
          anterior = atual;
        }
        if (anterior[candidata.length] <= limite) return true;
      }
    }
    return false;
  };
  return termos.every((termo) => palavras.some((palavra) => combina(termo, palavra))) ? 60 : 0;
}
