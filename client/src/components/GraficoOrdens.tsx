import { useEffect, useRef, useState } from 'react';
type Dia = { key: string; label: string; count: number; tooltipLabel?: string };
export default function GraficoOrdens({ data: dados }: { data: Dia[] }) {
  const raiz = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(700);
  const [ativo, setAtivo] = useState<number | null>(null);
  useEffect(() => {
    if (!raiz.current) return;
    const observador = new ResizeObserver((registros) =>
      setLargura(registros[0].contentRect.width),
    );
    observador.observe(raiz.current);
    return () => observador.disconnect();
  }, []);
  const altura = 190;
  const esquerda = 38;
  const direita = 22;
  const superior = 24;
  const inferior = 40;
  const base = altura - inferior;
  const maximo = Math.max(2, ...dados.map((dadosAtual) => dadosAtual.count));
  const passo = Math.max(1, Math.ceil(maximo / 4));
  const teto = Math.ceil(maximo / passo) * passo;
  const pontos = dados.map((dadosAtual, indice) => ({
    ...dadosAtual,
    x:
      dados.length === 1
        ? esquerda + (largura - esquerda - direita) / 2
        : esquerda + (indice * (largura - esquerda - direita)) / Math.max(1, dados.length - 1),
    y: base - (dadosAtual.count / teto) * (base - superior),
  }));
  const caminho = pontos
    .map((registroAtual, indice) => `${indice ? 'L' : 'M'}${registroAtual.x},${registroAtual.y}`)
    .join(' ');
  const item = ativo === null ? null : pontos[ativo];
  return (
    <div className="operation-chart" ref={raiz} onMouseLeave={() => setAtivo(null)}>
      <svg
        width="100%"
        height={altura}
        role="img"
        aria-label="Evolução do número de ordens de serviço"
      >
        <defs>
          <linearGradient id="os-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef3348" stopOpacity=".24" />
            <stop offset="100%" stopColor="#ef3348" stopOpacity=".06" />
          </linearGradient>
        </defs>
        {Array.from({ length: teto / passo + 1 }, (_, indice) => indice * passo).map((valor) => {
          const outroItem = base - (valor / teto) * (base - superior);
          return (
            <g key={valor}>
              <line
                x1={esquerda}
                x2={largura - direita}
                y1={outroItem}
                y2={outroItem}
                stroke="var(--theme-border, #e7ebf1)"
                strokeDasharray="3 5"
              />
              <text x={esquerda - 12} y={outroItem + 4} textAnchor="end">
                {valor}
              </text>
            </g>
          );
        })}
        <path
          d={`${caminho} L${pontos.at(-1)?.x ?? esquerda},${base} L${esquerda},${base}Z`}
          fill="url(#os-area)"
        />
        <path d={caminho} fill="none" stroke="#ec2842" strokeWidth="1.7" />
        {pontos.map((registroAtual, indice) => (
          <g key={registroAtual.key}>
            {((indice % Math.max(1, Math.ceil(pontos.length / 8)) === 0 &&
              pontos.length - 1 - indice >= Math.ceil(pontos.length / 16)) ||
              indice === pontos.length - 1) && (
              <text x={registroAtual.x} y={altura - 13} textAnchor="middle">
                {registroAtual.label}
              </text>
            )}
            <circle
              cx={registroAtual.x}
              cy={registroAtual.y}
              r={ativo === indice ? 4.5 : 2.5}
              stroke="#ec2842"
              strokeWidth="1.2"
              fill="#ef3348"
            />
            <rect
              x={Math.max(
                esquerda,
                registroAtual.x -
                  (largura - esquerda - direita) / Math.max(1, pontos.length - 1) / 2,
              )}
              y={superior}
              width={
                Math.min(
                  largura - direita,
                  registroAtual.x +
                    (largura - esquerda - direita) / Math.max(1, pontos.length - 1) / 2,
                ) -
                Math.max(
                  esquerda,
                  registroAtual.x -
                    (largura - esquerda - direita) / Math.max(1, pontos.length - 1) / 2,
                )
              }
              height={base - superior}
              fill="transparent"
              tabIndex={0}
              aria-label={`${registroAtual.label}: ${registroAtual.count} OS`}
              onMouseEnter={() => setAtivo(indice)}
              onFocus={() => setAtivo(indice)}
              onBlur={() => setAtivo(null)}
            />
          </g>
        ))}
        {item && (
          <line
            x1={item.x}
            x2={item.x}
            y1={superior}
            y2={base}
            stroke="#d19aa3"
            strokeDasharray="3 4"
          />
        )}
      </svg>
      {item && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(Math.max(item.x - 90, 0), Math.max(0, largura - 184)),
            top: Math.max(0, item.y - 58),
          }}
        >
          <span className="tooltip-eyebrow">ORDENS ABERTAS</span>
          <span>{item.tooltipLabel ?? item.label}</span>
          <strong>
            {item.count} <small>{item.count === 1 ? 'ordem' : 'ordens'}</small>
          </strong>
        </div>
      )}
    </div>
  );
}
