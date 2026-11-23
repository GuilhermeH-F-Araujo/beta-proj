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
    scope: escopo,
    field: campo,
    value: inicialLocal(),
  }));
  let atual = estado;
  if (estado.scope !== escopo || estado.field !== campo) {
    atual = { scope: escopo, field: campo, value: inicialLocal() };
    setEstado(atual);
  }
  return [
    atual.value,
    (acao) =>
      setEstado((anterior) => {
        const base =
          anterior.scope === escopo && anterior.field === campo ? anterior.value : inicialLocal();
        const continuar =
          typeof acao === 'function' ? (acao as (registroAtual: T) => T)(base) : acao;
        gravarRascunho(escopo, campo, continuar);
        return { scope: escopo, field: campo, value: continuar };
      }),
  ];
}
