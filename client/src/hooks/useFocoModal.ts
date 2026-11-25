import { useEffect, useRef } from 'react';

const pilha: HTMLElement[] = [];
const seletor = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]';

function controles(dialogo: HTMLElement) {
  return Array.from(dialogo.querySelectorAll<HTMLElement>(seletor)).filter(
    (elemento) =>
      elemento.tabIndex >= 0 &&
      !elemento.matches(':disabled') &&
      !elemento.closest('[hidden], [inert], [aria-hidden="true"]') &&
      elemento.getClientRects().length > 0 &&
      elemento.ownerDocument.defaultView?.getComputedStyle(elemento).visibility === 'visible',
  );
}

export function useFocoModal<T extends HTMLElement>(aberto = true) {
  const referencia = useRef<T>(null);
  useEffect(() => {
    const dialogo = referencia.current;
    if (!aberto || !dialogo) return;
    const origem = document.activeElement;
    pilha.push(dialogo);
    // Preserva o foco inicial explicito do formulario.
    if (!dialogo.contains(origem)) (controles(dialogo)[0] ?? dialogo).focus();
    function limitar(evento: KeyboardEvent) {
      if (evento.key !== 'Tab' || pilha.at(-1) !== dialogo) return;
      // Dialogos nativos controlam o proprio foco.
      if (document.querySelector('dialog[open]:modal')) return;
      const itens = controles(dialogo!);
      const ativo = document.activeElement;
      const indice = itens.findIndex((item) => item === ativo);
      if (indice < 0 || (evento.shiftKey ? indice === 0 : indice === itens.length - 1)) {
        evento.preventDefault();
        (itens[evento.shiftKey ? itens.length - 1 : 0] ?? dialogo)?.focus();
      }
    }
    document.addEventListener('keydown', limitar);
    return () => {
      document.removeEventListener('keydown', limitar);
      const eraAtivo = pilha.at(-1) === dialogo;
      const indice = pilha.lastIndexOf(dialogo);
      if (indice >= 0) pilha.splice(indice, 1);
      if (eraAtivo && origem instanceof HTMLElement && origem.isConnected) origem.focus();
    };
  }, [aberto]);
  return referencia;
}
