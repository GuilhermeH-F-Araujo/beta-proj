import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './menu-acoes-ordem.css';

type Action = 'status' | 'edit' | 'delete';
export default function MenuAcoesOrdem({ anchor, onClose, onSelect }: {
  anchor: { x: number; bottom: number }; onClose: () => void; onSelect: (action: Action) => void;
}) {
  const width = 184;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.x - width / 2));
  const menuHeight = 130;
  const above = anchor.bottom + menuHeight + 12 > window.innerHeight;
  const top = above ? Math.max(8, anchor.bottom - menuHeight - 35) : anchor.bottom + 10;
  const arrowLeft = Math.max(16, Math.min(width - 16, anchor.x - left));
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest('.os-action-menu,.action-more')) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const scroll = () => onClose();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll); };
  }, [onClose]);
  return createPortal(<div className={`os-action-menu${above ? ' menu-above' : ''}`} style={{ left, top, '--arrow-left': `${arrowLeft}px` } as CSSProperties} role="menu" aria-label="Ações da OS">
    <button type="button" role="menuitem" onClick={() => onSelect('status')}><span className="menu-icon status"><span className="menu-glyph"/></span>Alterar status</button>
    <button type="button" role="menuitem" onClick={() => onSelect('edit')}><span className="menu-icon edit"><span className="menu-glyph"/></span>Corrigir informações</button>
    <button type="button" role="menuitem" onClick={() => onSelect('delete')}><span className="menu-icon delete"><span className="menu-glyph"/></span>Excluir ordem</button>
  </div>, document.body);
}
