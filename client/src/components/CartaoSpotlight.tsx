import type { PointerEvent, ReactNode } from 'react';

type Props = {
  className: string;
  children: ReactNode;
};

// Efeito adaptado de Spotlight Card, do React Bits.
export default function CartaoSpotlight({ className, children }: Props) {
  function iluminar(evento: PointerEvent<HTMLDivElement>) {
    if (evento.pointerType === 'touch') return;
    const cartao = evento.currentTarget;
    const limites = cartao.getBoundingClientRect();
    if (!limites.width || !limites.height) return;
    cartao.style.setProperty(
      '--spotlight-x',
      `${((evento.clientX - limites.left) / limites.width) * 100}%`,
    );
    cartao.style.setProperty(
      '--spotlight-y',
      `${((evento.clientY - limites.top) / limites.height) * 100}%`,
    );
  }

  return (
    <div className={className} aria-hidden="true" onPointerMove={iluminar}>
      {children}
    </div>
  );
}
