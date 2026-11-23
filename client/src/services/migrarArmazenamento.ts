// Mantem os dados locais ao adotar chaves estaveis, sem rotulos de entrega.
export function normalizarChaveArmazenamento(chave: string) {
  if (!chave.startsWith('estacao-')) return chave;
  return chave.replace(/-v\d+(?=:|$|-)/g, '');
}

export function migrarArmazenamentoLocal() {
  for (const obterArmazenamento of [() => localStorage, () => sessionStorage]) {
    try {
      const armazenamento = obterArmazenamento();
      const chaves = Array.from(
        { length: armazenamento.length },
        (_, indice) => armazenamento.key(indice)!,
      );
      for (const chave of chaves) {
        const destino = normalizarChaveArmazenamento(chave);
        if (destino === chave) continue;
        const valor = armazenamento.getItem(chave);
        if (valor !== null && armazenamento.getItem(destino) === null)
          armazenamento.setItem(destino, valor);
        armazenamento.removeItem(chave);
      }
    } catch {
      // O navegador pode bloquear armazenamento; o painel continua acessivel.
    }
  }
}
