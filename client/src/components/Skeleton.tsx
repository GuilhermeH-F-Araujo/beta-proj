import "./skeleton.css";
export function SkeletonLinha({
  width = "100%",
  height = 16,
}: {
  width?: string;
  height?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="app-skeleton-line"
      style={{ width, height }}
    />
  );
}
export default function Skeleton({
  tipo = "pagina",
  linhas = 6,
}: {
  tipo?: "pagina" | "tabela" | "formulario";
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
      {tipo === "pagina" && (
        <>
          <SkeletonLinha width="32%" height={28} />
          <div className="app-skeleton-cards">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <SkeletonLinha width="55%" />
                <SkeletonLinha width="28%" height={28} />
              </div>
            ))}
          </div>
        </>
      )}
      <div className="app-skeleton-rows">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i}>
            <SkeletonLinha width={tipo === "formulario" ? "28%" : "15%"} />
            <SkeletonLinha width="40%" />
            <SkeletonLinha width="20%" />
          </div>
        ))}
      </div>
    </section>
  );
}
