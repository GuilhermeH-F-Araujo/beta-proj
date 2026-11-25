import { useRef } from 'react';
// Atualizacoes conservam a tabela anterior; o estado de rede continua separado.
export function useCargaInicial(carregando: boolean) {
  const pronto = useRef(false);
  if (!carregando) pronto.current = true;
  return carregando && !pronto.current;
}
