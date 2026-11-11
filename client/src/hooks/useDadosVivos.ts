import { useEffect, useRef } from "react";
import { observarDados } from "../services/atualizacaoDados";
export function useDadosVivos(
  atualizar: (valido: () => boolean) => Promise<unknown> | void,
  ativo = true,
  chave = "",
) {
  const ref = useRef(atualizar);
  ref.current = atualizar;
  useEffect(() => {
    if (!ativo) return;
    let mounted = true,
      busy = false;
    const stop = observarDados(() => {
      if (!mounted || busy) return;
      busy = true;
      Promise.resolve()
        .then(() => ref.current(() => mounted))
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    });
    return () => {
      mounted = false;
      stop();
    };
  }, [ativo, chave]);
}
