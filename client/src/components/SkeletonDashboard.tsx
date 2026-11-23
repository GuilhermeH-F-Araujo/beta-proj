import { SkeletonRow } from './Skeleton';
import './skeleton.css';

export default function SkeletonDashboard() {
  return (
    <section className="app-skeleton dashboard-skeleton" role="status" aria-label="Carregando painel" aria-busy="true">
      <span className="app-sr-only">Carregando painel…</span>
      <div className="dashboard-skeleton-header" aria-hidden="true">
        <div>
          <SkeletonRow width="260px" height={29} />
          <SkeletonRow width="390px" height={14} />
        </div>
        <SkeletonRow width="142px" height={40} />
      </div>
      <div className="dashboard-skeleton-kpis" aria-hidden="true">
        {Array.from({ length: 5 }, (_, indice) => (
          <article key={indice}>
            <SkeletonRow width="48%" height={13} />
            <SkeletonRow width="33%" height={29} />
            <SkeletonRow width="72%" height={12} />
          </article>
        ))}
      </div>
      <div className="dashboard-skeleton-panels" aria-hidden="true">
        <article className="dashboard-skeleton-panel">
          <SkeletonRow width="38%" height={21} />
          {Array.from({ length: 5 }, (_, indice) => (
            <div key={indice}>
              <SkeletonRow width="34px" height={34} />
              <div>
                <SkeletonRow width="68%" height={14} />
                <SkeletonRow width="46%" height={12} />
              </div>
              <SkeletonRow width="64px" height={24} />
            </div>
          ))}
        </article>
        <article className="dashboard-skeleton-panel">
          <SkeletonRow width="52%" height={21} />
          {Array.from({ length: 4 }, (_, indice) => (
            <div key={indice}>
              <SkeletonRow width="34px" height={34} />
              <div>
                <SkeletonRow width="74%" height={14} />
                <SkeletonRow width="50%" height={12} />
              </div>
              <SkeletonRow width="28px" height={20} />
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
