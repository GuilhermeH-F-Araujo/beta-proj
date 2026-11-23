import type { ReactNode } from 'react';
import { Icone } from '../MenuAdmin';

export function pesoRotulo(valor: number) {
  if (valor <= 400) return 'Regular';
  if (valor <= 500) return 'Médio';
  if (valor <= 600) return 'Forte';
  return 'Extra forte';
}

export function PreferenciaIntervalo({
  title: titulo,
  description: descricao,
  min: minimo,
  max: maximo,
  step: passo,
  value: valor,
  valueLabel: valorRotulo,
  onChange: aoAlterar,
}: {
  title: string;
  description: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueLabel: string;
  onChange: (valor: number) => void;
}) {
  const progresso = `${((valor - minimo) / (maximo - minimo)) * 100}%`;
  const iconesPorControle: Record<string, string> = {
    'Tamanho do conteúdo': 'eye',
    'Menu lateral': 'dashboard',
    Cabeçalho: 'sliders',
    'Modais e janelas': 'package',
    'Tamanho dos botões': 'sliders',
    'Espessura das letras': 'pencil',
  };
  const icone = iconesPorControle[titulo] ?? 'activity';
  const rotulosPorControle: Record<string, [string, string]> = {
    'Espessura das letras': ['Mais leve', 'Mais marcada'],
    'Espaço entre linhas': ['Mais junto', 'Mais espaçado'],
  };
  const [rotuloInicial, rotuloFinal] = rotulosPorControle[titulo] ?? ['Menor', 'Maior'];
  return (
    <div className="settings-range-control">
      <div className="settings-range-top">
        <span className="settings-range-symbol">
          <Icone name={icone} size={20} />
        </span>
        <span>
          <b>{titulo}</b>
          <small>{descricao}</small>
        </span>
      </div>
      <div className="settings-range-adjust" data-app-preference-control>
        <button
          type="button"
          aria-label={`Diminuir ${titulo.toLowerCase()}`}
          disabled={valor <= minimo}
          onClick={() => aoAlterar(Math.max(minimo, valor - passo))}
        >
          −
        </button>
        <input
          type="range"
          min={minimo}
          max={maximo}
          step={passo}
          value={valor}
          aria-label={titulo}
          aria-valuetext={valorRotulo}
          style={{ '--slider-progress': progresso } as React.CSSProperties}
          onChange={(evento) => aoAlterar(Number(evento.target.value))}
        />
        <button
          type="button"
          aria-label={`Aumentar ${titulo.toLowerCase()}`}
          disabled={valor >= maximo}
          onClick={() => aoAlterar(Math.min(maximo, valor + passo))}
        >
          +
        </button>
        <output aria-live="off">{valorRotulo}</output>
      </div>
      <span className="settings-range-ends">
        <small>{rotuloInicial}</small>
        <small>{rotuloFinal}</small>
      </span>
    </div>
  );
}

export function CartaoCabecalho({
  icon: icone,
  title: titulo,
  note: anotacao,
  action: acao,
  actionLabel: acaoRotulo,
}: {
  icon: string;
  title: string;
  note?: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <header className="settings-card-heading">
      <span className="settings-card-icon">
        <Icone name={icone} size={16} />
      </span>
      <div>
        <h2>{titulo}</h2>
        {anotacao && <p>{anotacao}</p>}
      </div>
      {acao && (
        <button className="settings-button compact" onClick={acao}>
          <Icone name="pencil" size={13} />
          {acaoRotulo}
        </button>
      )}
    </header>
  );
}

export function ResumoLinha({
  icon: icone,
  label: rotulo,
  value: valor,
  detail: detalhe,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="settings-summary-row">
      <Icone name={icone} size={14} />
      <span>
        <b>{rotulo}</b>
        <small>{detalhe}</small>
      </span>
      <strong>{valor}</strong>
    </div>
  );
}

export function InterruptorLinha({
  title: titulo,
  description: descricao,
  checked: marcado,
  onChange: aoAlterar,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (valor: boolean) => void;
}) {
  return (
    <div className="settings-toggle-row">
      <span>
        <b>{titulo}</b>
        <small>{descricao}</small>
      </span>
      <button
        type="button"
        className={`settings-switch${marcado ? ' checked' : ''}`}
        role="switch"
        aria-checked={marcado}
        aria-label={titulo}
        onClick={() => aoAlterar(!marcado)}
      >
        <i />
      </button>
    </div>
  );
}
