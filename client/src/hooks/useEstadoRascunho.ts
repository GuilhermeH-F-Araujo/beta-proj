// O rascunho e identificado pela conta, pelo formulario e pelo registro.
// Trocar de registro nao pode reutilizar os campos de outro cadastro.
import { useState, type Dispatch, type SetStateAction } from 'react';
import { gravarRascunho, lerRascunho } from '../services/rascunhos';
export function useEstadoRascunho<T>(
  escopo: string,
  campo: string,
  inicial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const inicialLocal = () =>
    lerRascunho(escopo, campo, typeof inicial === 'function' ? (inicial as () => T)() : inicial);
  const [estado, setEstado] = useState(() => ({
    escopo: escopo,
    campo: campo,
    valor: inicialLocal(),
  }));
  let atual = estado;
  if (estado.escopo !== escopo || estado.campo !== campo) {
    atual = { escopo: escopo, campo: campo, valor: inicialLocal() };
    setEstado(atual);
  }
  return [
    atual.valor,
    (acao) =>
      setEstado((anterior) => {
        const base =
          anterior.escopo === escopo && anterior.campo === campo ? anterior.valor : inicialLocal();
        const continuar =
          typeof acao === 'function' ? (acao as (registroAtual: T) => T)(base) : acao;
        gravarRascunho(escopo, campo, continuar);
        return { escopo: escopo, campo: campo, valor: continuar };
      }),
  ];
}
