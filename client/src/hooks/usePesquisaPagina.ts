import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
export function useParametroPagina(nome: string, alterar: (valor: string) => void) {
  const rota = useLocation();
  const atual = useRef(alterar);
  atual.current = alterar;
  useEffect(() => {
    const valor = new URLSearchParams(rota.search).get(nome);
    if (valor !== null) atual.current(valor);
  }, [rota.pathname, rota.search, nome]);
}
export function usePesquisaPagina(alterar: (valor: string) => void) {
  useParametroPagina('search', alterar);
}
