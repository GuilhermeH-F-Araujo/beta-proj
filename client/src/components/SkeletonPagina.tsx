import { SkeletonRow } from './Skeleton';
import './skeleton.css';
import SkeletonDashboard from './SkeletonDashboard';

type ModeloPagina = {
  cartoes: number;
  colunas: number;
  tipo: 'lista' | 'catalogo' | 'agenda' | 'configuracoes' | 'perfil' | 'detalhe' | 'historico' | 'acesso';
};

const modelos: Record<string, ModeloPagina> = {
  clientes: { cartoes: 4, colunas: 6, tipo: 'lista' },
  motocicletas: { cartoes: 5, colunas: 8, tipo: 'lista' },
  'ordens-de-servico': { cartoes: 5, colunas: 9, tipo: 'lista' },
  funcionarios: { cartoes: 4, colunas: 6, tipo: 'lista' },
  agendamentos: { cartoes: 4, colunas: 6, tipo: 'agenda' },
  servicos: { cartoes: 4, colunas: 6, tipo: 'catalogo' },
  configuracoes: { cartoes: 0, colunas: 2, tipo: 'configuracoes' },
  'meu-perfil': { cartoes: 0, colunas: 2, tipo: 'perfil' },
  miniaturas: { cartoes: 4, colunas: 5, tipo: 'lista' },
  'enviar-referencia': { cartoes: 0, colunas: 2, tipo: 'acesso' },
  login: { cartoes: 0, colunas: 2, tipo: 'acesso' },
  'esqueci-a-senha': { cartoes: 0, colunas: 2, tipo: 'acesso' },
  'redefinir-senha': { cartoes: 0, colunas: 2, tipo: 'acesso' },
};

export default function SkeletonPagina({ caminho }: { caminho: string }) {
  const partes = caminho.split('/').filter(Boolean);
  if (partes[0] === 'dashboard') return <SkeletonDashboard />;

  const modelo = modelos[partes[0]] ?? { cartoes: 0, colunas: 2, tipo: 'detalhe' as const };
  const detalhe = partes.length > 1 && partes[0] !== 'configuracoes';
  const historico = detalhe && caminho.endsWith('/historico');
  const classe = historico ? 'historico' : detalhe ? 'detalhe' : modelo.tipo;

  return (
    <section
      className={`app-skeleton page-skeleton ${classe}`}
      role="status"
      aria-busy="true"
      aria-label="Carregando página"
    >
      <span className="app-sr-only">Carregando página…</span>
      <header>
        <div>
          <SkeletonRow width="min(34%, 260px)" height={30} />
          <SkeletonRow width="min(48%, 390px)" height={14} />
        </div>
        <SkeletonRow width="132px" height={42} />
      </header>

      {detalhe ? (
        historico ? (
          <EsqueletoHistorico />
        ) : (
          <EsqueletoDetalhe />
        )
      ) : modelo.tipo === 'perfil' ? (
        <EsqueletoPerfil />
      ) : modelo.tipo === 'configuracoes' ? (
        <EsqueletoConfiguracoes />
      ) : modelo.tipo === 'catalogo' ? (
        <EsqueletoCatalogo />
      ) : modelo.tipo === 'agenda' ? (
        <EsqueletoAgenda cartoes={modelo.cartoes} />
      ) : modelo.tipo === 'acesso' ? (
        <EsqueletoAcesso />
      ) : (
        <>
          <EsqueletoCartoes quantidade={modelo.cartoes} />
          <div className="page-skeleton-toolbar">
            <SkeletonRow width="32%" height={42} />
            <SkeletonRow width="22%" height={42} />
            <SkeletonRow width="18%" height={42} />
          </div>
          <SkeletonTabela colunas={modelo.colunas} />
        </>
      )}
    </section>
  );
}

function EsqueletoCartoes({ quantidade }: { quantidade: number }) {
  return (
    <div className="page-skeleton-metrics" style={{ gridTemplateColumns: `repeat(${quantidade},minmax(0,1fr))` }}>
      {Array.from({ length: quantidade }, (_, indice) => (
        <article key={indice}>
          <SkeletonRow width="42%" height={13} />
          <SkeletonRow width="30%" height={30} />
          <SkeletonRow width="68%" height={12} />
        </article>
      ))}
    </div>
  );
}

function EsqueletoDetalhe() {
  return (
    <>
      <div className="page-skeleton-identity">
        <SkeletonRow width="76px" height={76} />
        <div>
          <SkeletonRow width="42%" height={26} />
          <SkeletonRow width="68%" height={14} />
          <SkeletonRow width="32%" height={12} />
        </div>
      </div>
      <div className="page-skeleton-panels">
        <EsqueletoPainel linhas={4} />
        <EsqueletoPainel linhas={4} />
        <EsqueletoPainel linhas={3} />
        <EsqueletoPainel linhas={3} />
      </div>
    </>
  );
}

function EsqueletoHistorico() {
  return (
    <div className="page-skeleton-history">
      <EsqueletoPainel linhas={2} />
      <EsqueletoPainel linhas={2} />
      <EsqueletoPainel linhas={2} />
      <EsqueletoPainel linhas={2} />
    </div>
  );
}

function EsqueletoPerfil() {
  return (
    <>
      <div className="page-skeleton-identity">
        <SkeletonRow width="92px" height={92} />
        <div>
          <SkeletonRow width="40%" height={26} />
          <SkeletonRow width="55%" height={14} />
        </div>
      </div>
      <div className="page-skeleton-panels">
        <EsqueletoPainel linhas={4} />
        <EsqueletoPainel linhas={4} />
      </div>
    </>
  );
}

function EsqueletoConfiguracoes() {
  return (
    <div className="page-skeleton-settings">
      <aside>
        {[0, 1, 2, 3, 4, 5].map((item) => <SkeletonRow key={item} height={38} />)}
      </aside>
      <div className="page-skeleton-settings-content">
        <EsqueletoPainel linhas={4} />
        <EsqueletoPainel linhas={3} />
      </div>
    </div>
  );
}

function EsqueletoCatalogo() {
  return (
    <>
      <EsqueletoCartoes quantidade={4} />
      <div className="page-skeleton-catalog">
        <div>
          <div className="page-skeleton-toolbar">
            <SkeletonRow width="60%" height={42} />
            <SkeletonRow width="120px" height={42} />
          </div>
          <SkeletonTabela colunas={6} />
        </div>
        <EsqueletoPainel linhas={5} />
      </div>
    </>
  );
}

function EsqueletoAgenda({ cartoes }: { cartoes: number }) {
  return (
    <>
      <EsqueletoCartoes quantidade={cartoes} />
      <div className="page-skeleton-toolbar">
        <SkeletonRow width="180px" height={42} />
        <SkeletonRow width="220px" height={42} />
        <SkeletonRow width="120px" height={42} />
      </div>
      <div className="page-skeleton-calendar">
        {Array.from({ length: 35 }, (_, indice) => (
          <div key={indice}>
            <SkeletonRow width="24px" height={12} />
            {indice % 5 === 0 && <SkeletonRow width="76%" height={22} />}
          </div>
        ))}
      </div>
    </>
  );
}

function EsqueletoAcesso() {
  return (
    <div className="page-skeleton-access">
      <SkeletonRow width="140px" height={86} />
      <div>
        <SkeletonRow width="54%" height={26} />
        <SkeletonRow width="76%" height={44} />
        <SkeletonRow width="76%" height={44} />
        <SkeletonRow width="40%" height={42} />
      </div>
    </div>
  );
}

function EsqueletoPainel({ linhas }: { linhas: number }) {
  return (
    <article className="page-skeleton-panel">
      <SkeletonRow width="48%" height={22} />
      {Array.from({ length: linhas }, (_, indice) => (
        <div key={indice}>
          <SkeletonRow width={indice % 2 ? '32%' : '43%'} height={13} />
          <SkeletonRow height={42} />
        </div>
      ))}
    </article>
  );
}

export function SkeletonTabela({ colunas, linhas = 6 }: { colunas: number; linhas?: number }) {
  return (
    <div className="page-skeleton-table" aria-hidden="true">
      {Array.from({ length: linhas + 1 }, (_, indice) => (
        <div key={indice} style={{ gridTemplateColumns: `repeat(${colunas},minmax(0,1fr))` }}>
          {Array.from({ length: colunas }, (_, coluna) => (
            <SkeletonRow
              key={coluna}
              width={coluna === 1 ? '85%' : '65%'}
              height={indice ? 16 : 12}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
