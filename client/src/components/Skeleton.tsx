import './skeleton.css';
export function SkeletonRow({
  width: largura = '100%',
  height: altura = 16,
}: {
  width?: string;
  height?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="app-skeleton-line"
      style={{ width: largura, height: altura }}
    />
  );
}
export default function Skeleton({
  tipo = 'pagina',
  linhas = 6,
}: {
  tipo?: 'pagina' | 'tabela' | 'formulario';
  linhas?: number;
}) {
  return (
    <section
      className={`app-skeleton app-skeleton-${tipo}`}
      role="status"
      aria-label="Carregando informações"
      aria-busy="true"
    >
      <span className="app-sr-only">Carregando informações…</span>
      {tipo === 'pagina' && (
        <>
          <SkeletonRow width="32%" height={28} />
          <div className="app-skeleton-cards">
            {[1, 2, 3, 4].map((indice) => (
              <div key={indice}>
                <SkeletonRow width="55%" />
                <SkeletonRow width="28%" height={28} />
              </div>
            ))}
          </div>
        </>
      )}
      <div className="app-skeleton-rows">
        {Array.from({ length: linhas }, (_, indice) => (
          <div key={indice}>
            <SkeletonRow width={tipo === 'formulario' ? '28%' : '15%'} />
            <SkeletonRow width="40%" />
            <SkeletonRow width="20%" />
          </div>
        ))}
      </div>
    </section>
  );
}
