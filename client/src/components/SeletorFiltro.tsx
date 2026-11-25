import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { escalaAtual } from '../services/preferenciasGlobais';
import { Icone } from './MenuAdmin';
import './seletor-filtro.css';

export type FiltroOpcao<T extends string> = {
  value: T;
  label: string;
  tone?: string;
  icon?: string;
};

type Props<T extends string> = {
  label: string;
  value: T;
  options: readonly FiltroOpcao<T>[];
  onChange: (valor: T) => void;
  variant?: 'toolbar' | 'compact' | 'staff' | 'settings';
  disabled?: boolean;
};

export default function SeletorFiltro<T extends string>({
  label: rotulo,
  value: valor,
  options: opcoes,
  onChange: aoAlterar,
  variant: variante = 'compact',
  disabled: desabilitado = false,
}: Props<T>) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 320,
    scale: 1,
  });
  const acionador = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const atual = opcoes.find((opcao) => opcao.value === valor) ?? opcoes[0];

  useEffect(() => {
    if (!aberto) return;
    const posicionar = () => {
      const retangulo = acionador.current?.getBoundingClientRect();
      if (!retangulo) return;
      const escala = escalaAtual(acionador.current);
      const altura = Math.min(opcoes.length * 40 + 12, 320) * escala;
      const abaixo = window.innerHeight - retangulo.bottom - 12;
      const acima = retangulo.top - 12;
      const abreAcima = abaixo < Math.min(altura, 160) && acima > abaixo;
      const maximoAltura = Math.min(altura, abreAcima ? acima : abaixo);
      setPosicao({
        top:
          (abreAcima ? retangulo.top - Math.max(maximoAltura, 0) - 6 : retangulo.bottom + 6) /
          escala,
        left:
          Math.max(
            8,
            Math.min(
              retangulo.left,
              window.innerWidth -
                Math.max(retangulo.width, variante !== 'compact' ? 218 * escala : retangulo.width) -
                8,
            ),
          ) / escala,
        width:
          Math.max(retangulo.width, variante !== 'compact' ? 218 * escala : retangulo.width) /
          escala,
        maxHeight: Math.max(80, maximoAltura) / escala,
        scale: escala,
      });
    };
    const fora = (evento: PointerEvent) => {
      if (
        evento.target instanceof Node &&
        !acionador.current?.contains(evento.target) &&
        !menu.current?.contains(evento.target)
      )
        setAberto(false);
    };
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setAberto(false);
        acionador.current?.focus();
      }
    };
    const fecharVisualizacao = () => setAberto(false);
    posicionar();
    window.addEventListener('settings-view-change', fecharVisualizacao);
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', escapar);
    window.addEventListener('resize', posicionar);
    window.addEventListener('app-preferences-change', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      window.removeEventListener('settings-view-change', fecharVisualizacao);
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', escapar);
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('app-preferences-change', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [aberto, opcoes.length, variante]);

  function escolher(opcao: T) {
    aoAlterar(opcao);
    setAberto(false);
    acionador.current?.focus();
  }
  function moverFoco(evento: ReactKeyboardEvent<HTMLButtonElement>) {
    const botoes = [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ];
    const indice = botoes.indexOf(evento.currentTarget);
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      botoes[
        (indice + (evento.key === 'ArrowDown' ? 1 : -1) + botoes.length) % botoes.length
      ]?.focus();
    } else if (evento.key === 'Home' || evento.key === 'End') {
      evento.preventDefault();
      botoes[evento.key === 'Home' ? 0 : botoes.length - 1]?.focus();
    }
  }

  return (
    <div className={`filter-select filter-select--${variante}`}>
      {(variante === 'compact' || variante === 'settings') && (
        <span className="filter-select-label">{rotulo}</span>
      )}
      <button
        ref={acionador}
        type="button"
        className="filter-select-trigger"
        aria-label={`${rotulo}: ${atual?.label ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={id}
        disabled={desabilitado}
        onClick={() => setAberto((anterior) => !anterior)}
        onKeyDown={(evento) => {
          if (!aberto && (evento.key === 'ArrowDown' || evento.key === 'Enter')) {
            evento.preventDefault();
            setAberto(true);
            requestAnimationFrame(() =>
              menu.current?.querySelector<HTMLButtonElement>('button[role="option"]')?.focus(),
            );
          }
        }}
      >
        {variante === 'toolbar' && (
          <span className={`filter-select-dot ${atual?.tone ?? ''}`} aria-hidden="true" />
        )}
        {variante === 'staff' && atual?.tone && (
          <span className={`filter-select-dot ${atual.tone}`} aria-hidden="true" />
        )}
        {variante === 'staff' && !atual?.tone && atual?.icon && (
          <Icone name={atual.icon} size={15} />
        )}
        <span className="filter-select-value">{atual?.label ?? '—'}</span>
        <Icone name="chevron" size={variante !== 'compact' ? 15 : 12} />
      </button>
      {aberto &&
        createPortal(
          <div
            ref={menu}
            id={id}
            className={`filter-select-menu filter-select-menu--${variante}`}
            data-personalizador={
              acionador.current?.closest('[data-personalizador]') ? true : undefined
            }
            role="listbox"
            aria-label={rotulo}
            style={
              {
                zIndex: acionador.current?.closest('[data-personalizador]')
                  ? 2147483600
                  : undefined,
                top: posicao.top,
                left: posicao.left,
                width: posicao.width,
                maxHeight: posicao.maxHeight,
                '--app-floating-scale': posicao.scale,
              } as React.CSSProperties
            }
          >
            {opcoes.map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                role="option"
                aria-selected={opcao.value === valor}
                onClick={() => escolher(opcao.value)}
                onKeyDown={moverFoco}
              >
                {variante === 'toolbar' && (
                  <span className={`filter-select-dot ${opcao.tone ?? ''}`} aria-hidden="true" />
                )}
                {variante === 'staff' && opcao.tone && (
                  <span className={`filter-select-dot ${opcao.tone}`} aria-hidden="true" />
                )}
                {variante === 'staff' && !opcao.tone && opcao.icon && (
                  <Icone name={opcao.icon} size={15} />
                )}
                <span>{opcao.label}</span>
                {opcao.value === valor && <Icone name="check" size={14} />}
              </button>
            ))}
          </div>,
          acionador.current?.closest('dialog,[role="dialog"]') ?? document.body,
        )}
    </div>
  );
}
