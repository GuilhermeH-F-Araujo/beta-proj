import { useEffect, useRef, useState } from 'react';
export function useAncoraVisual(alvo: HTMLElement | null) {
  const painel = useRef<HTMLDivElement>(null);
  const [medidas, setMedidas] = useState({
    top: 80,
    left: 16,
    width: 360,
    retangulo: { top: 80, left: 16, width: 0, height: 0 },
  });
  useEffect(() => {
    if (!alvo) return;
    const medir = () => {
      if (!alvo.isConnected) return;
      const rect = alvo.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      const altura = painel.current?.offsetHeight || 250;
      const barra = document.querySelector('.canvas-editor-bar')?.getBoundingClientRect();
      const limiteSuperior = 12;
      const limiteInferior = (barra?.top ?? window.innerHeight) - 12;
      const direita = rect.right + 12;
      const esquerda = rect.left - width - 12;
      const left =
        direita + width <= window.innerWidth - 12
          ? direita
          : esquerda >= 12
            ? esquerda
            : Math.max(12, Math.min(direita, window.innerWidth - width - 12));
      const top = Math.max(
        limiteSuperior,
        Math.min(rect.top, limiteInferior - altura),
      );
      const proxima = {
        top,
        left,
        width,
        retangulo: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      };
      setMedidas((anterior) =>
        JSON.stringify(anterior) === JSON.stringify(proxima) ? anterior : proxima,
      );
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    if (painel.current) observador.observe(painel.current);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    window.addEventListener('app-preferences-change', medir);
    return () => {
      observador.disconnect();
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
      window.removeEventListener('app-preferences-change', medir);
    };
  }, [alvo]);
  return { painel, ...medidas };
}
