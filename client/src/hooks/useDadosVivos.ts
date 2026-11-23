import { useEffect, useRef } from 'react';
import { observarDados } from '../services/atualizacaoDados';
export function useDadosVivos(
  atualizar: (valido: () => boolean) => Promise<unknown> | void,
  ativo = true,
  chave = '',
) {
  const referencia = useRef(atualizar);
  referencia.current = atualizar;
  useEffect(() => {
    if (!ativo) return;
    let montado = true;
    let ocupado = false;
    const parar = observarDados(() => {
      if (!montado || ocupado) return;
      ocupado = true;
      Promise.resolve()
        .then(() => referencia.current(() => montado))
        .catch(() => {})
        .finally(() => {
          ocupado = false;
        });
    });
    return () => {
      montado = false;
      parar();
    };
  }, [ativo, chave]);
}
