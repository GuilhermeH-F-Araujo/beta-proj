import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { escalaAtual } from '../services/preferenciasGlobais';
import './menu-acoes-ordem.css';

type Acao = 'status' | 'edit' | 'delete';
export default function MenuAcoesOrdem({
  anchor: ancora,
  onClose: aoFechar,
  onSelect: aoSelecionar,
}: {
  anchor: { x: number; bottom: number };
  onClose: () => void;
  onSelect: (acao: Acao) => void;
}) {
  const escala = escalaAtual();
  const largura = 184 * escala;
  const esquerda = Math.max(8, Math.min(window.innerWidth - largura - 8, ancora.x - largura / 2));
  const alturaMenu = 130 * escala;
  const acima = ancora.bottom + alturaMenu + 12 > window.innerHeight;
  const superior = acima ? Math.max(8, ancora.bottom - alturaMenu - 35) : ancora.bottom + 10;
  const arrowEsquerda = Math.max(16, Math.min(largura - 16, ancora.x - esquerda));
  useEffect(() => {
    const fora = (evento: PointerEvent) => {
      if (
        !(evento.target instanceof Element) ||
        !evento.target.closest('.os-action-menu,.action-more')
      )
        aoFechar();
    };
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar();
    };
    const rolagem = () => aoFechar();
    document.addEventListener('pointerdown', fora);
    window.addEventListener('keydown', escapar);
    window.addEventListener('scroll', rolagem, true);
    window.addEventListener('resize', rolagem);
    return () => {
      document.removeEventListener('pointerdown', fora);
      window.removeEventListener('keydown', escapar);
      window.removeEventListener('scroll', rolagem, true);
      window.removeEventListener('resize', rolagem);
    };
  }, [aoFechar]);
  return createPortal(
    <div
      className={`os-action-menu${acima ? ' menu-above' : ''}`}
      style={
        {
          left: esquerda / escala,
          top: superior / escala,
          '--arrow-left': `${arrowEsquerda / escala}px`,
          '--app-floating-scale': escala,
        } as CSSProperties
      }
      role="menu"
      aria-label="Ações da OS"
    >
      <button type="button" role="menuitem" onClick={() => aoSelecionar('status')}>
        <span className="menu-icon status">
          <span className="menu-glyph" />
        </span>
        Alterar status
      </button>
      <button type="button" role="menuitem" onClick={() => aoSelecionar('edit')}>
        <span className="menu-icon edit">
          <span className="menu-glyph" />
        </span>
        Corrigir informações
      </button>
      <button type="button" role="menuitem" onClick={() => aoSelecionar('delete')}>
        <span className="menu-icon delete">
          <span className="menu-glyph" />
        </span>
        Excluir ordem
      </button>
    </div>,
    document.body,
  );
}
