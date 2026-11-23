import { SkeletonRow } from './Skeleton';

export default function SkeletonLinhasTabela({ colunas = 1, linhas = 5 }: { colunas?: number; linhas?: number }) {
  return (
    <div className="skeleton-table-lines" role="status" aria-label="Carregando registros" aria-busy="true">
      <span className="app-sr-only">Carregando registros…</span>
      {Array.from({ length: linhas }, (_, linha) => (
        <div className="skeleton-table-row" key={linha} aria-hidden="true" style={{ gridTemplateColumns: `repeat(${colunas},minmax(0,1fr))` }}>
          {Array.from({ length: colunas }, (_, coluna) => (
            <SkeletonRow key={coluna} width={`${48 + ((linha + coluna) * 17) % 43}%`} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
}
