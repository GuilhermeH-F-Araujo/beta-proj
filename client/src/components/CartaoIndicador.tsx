import type { ReactNode } from 'react';
import { Icone } from './MenuAdmin';
import './cartao-indicador.css';

type Props = {
  titulo: string;
  valor: number | string;
  descricao: string;
  icone: string;
  tom?: string;
  editorId?: string;
  oculto?: boolean;
  ativo?: boolean;
  aoClicar?: () => void;
  tendencia?: number[];
  rotuloTendencia?: string;
  total?: number;
  ajuda?: string;
};
const tons: Record<string, string> = {
  rose: 'red',
  pink: 'red',
  red: 'red',
  sky: 'blue',
  blue: 'blue',
  mint: 'green',
  green: 'green',
  yellow: 'amber',
  amber: 'amber',
  purple: 'violet',
  violet: 'violet',
  gray: 'slate',
  slate: 'slate',
};

export default function CartaoIndicador({
  titulo,
  valor,
  descricao,
  icone,
  tom = 'blue',
  editorId,
  oculto = false,
  ativo = false,
  aoClicar,
  tendencia,
  rotuloTendencia,
  total,
  ajuda,
}: Props) {
  const cor = tons[tom] ?? 'blue';
  const proporcao =
    typeof valor === 'number' && total && total > 0
      ? Math.min(100, Math.max(0, (valor / total) * 100))
      : null;
  const conteudo: ReactNode = (
    <>
      <span className="indicador-icone">
        <Icone name={icone} size={20} />
      </span>
      <div className="indicador-conteudo">
        <span className="indicador-titulo">{titulo}</span>
        <strong className="indicador-valor">{valor}</strong>
        <span className="indicador-descricao">{descricao}</span>
      </div>
      {tendencia && tendencia.length > 1 ? (
        <MiniGrafico valores={tendencia} rotulo={rotuloTendencia ?? 'Distribuição dos dados'} />
      ) : proporcao !== null ? (
        <span className="indicador-proporcao" aria-hidden="true">
          <span style={{ width: `${proporcao}%` }} />
        </span>
      ) : null}
      {aoClicar && (
        <span className="indicador-acao" aria-hidden="true">
          <Icone name="right" size={14} />
        </span>
      )}
    </>
  );
  const atributos = {
    className: `indicador-card ${cor}${ativo ? ' indicador-selecionado' : ''}`,
    'data-indicador': cor,
    'data-editor-cartao': editorId,
    'data-workspace-card-hidden': oculto,
    title: ajuda,
  };
  return aoClicar ? (
    <button
      {...atributos}
      type="button"
      aria-pressed={ativo}
      aria-label={`${titulo}: ${valor}. ${ajuda || descricao}`}
      onClick={aoClicar}
    >
      {conteudo}
    </button>
  ) : (
    <article {...atributos} aria-label={titulo}>
      {conteudo}
    </article>
  );
}
function MiniGrafico({ valores, rotulo }: { valores: number[]; rotulo: string }) {
  const maximo = Math.max(...valores, 1);
  const pontos = valores.map((valor, indice) => ({
    x: 4 + (indice * 88) / (valores.length - 1),
    y: 48 - (valor / maximo) * 36,
  }));
  return (
    <svg className="indicador-grafico" viewBox="0 0 96 56" role="img" aria-label={rotulo}>
      <polyline
        points={pontos.map(({ x, y }) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pontos.map(({ x, y }, indice) => (
        <circle key={indice} cx={x} cy={y} r="2" fill="currentColor" />
      ))}
    </svg>
  );
}
