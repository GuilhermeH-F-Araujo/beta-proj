import { useState, type Dispatch, type SetStateAction } from "react";
import { lerRascunho, gravarRascunho } from "../services/rascunhos";
export function useEstadoRascunho<T>(
  scope: string,
  field: string,
  inicial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const initial = () =>
    lerRascunho(
      scope,
      field,
      typeof inicial === "function" ? (inicial as () => T)() : inicial,
    );
  const [state, setState] = useState(() => ({
    scope,
    field,
    value: initial(),
  }));
  let current = state;
  if (state.scope !== scope || state.field !== field) {
    current = { scope, field, value: initial() };
    setState(current);
  }
  return [
    current.value,
    (action) =>
      setState((previous) => {
        const base =
          previous.scope === scope && previous.field === field
            ? previous.value
            : initial();
        const next =
          typeof action === "function" ? (action as (p: T) => T)(base) : action;
        gravarRascunho(scope, field, next);
        return { scope, field, value: next };
      }),
  ];
}
