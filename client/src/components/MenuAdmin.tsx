import { ControlesArea } from './edicaoVisual/ControlesArea';
import { lerOrganizacaoInterface } from '../services/preferenciasGlobais';
import { registrarOrganizacaoVisual } from '../services/edicaoVisual';
import {
  useArrasteInterface,
  moverItem,
  useOrganizacaoInterface,
} from '../services/organizacaoInterface';
import { NavLink } from 'react-router-dom';
import LogoEstacao from './LogoEstacao';
import { moduloPagina, pode, useAcessoConta } from '../services/acessoConta';
import './menu-admin.css';
import { usePendenciasMiniaturas } from '../hooks/usePendenciasMiniaturas';

type Item = { label: string; icon: string; path: string };
const itens: Item[] = [
  { label: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
  { label: 'Clientes', icon: 'users', path: '/clientes' },
  { label: 'Funcionários', icon: 'staff', path: '/funcionarios' },
  { label: 'Motocicletas', icon: 'bike', path: '/motocicletas' },
  { label: 'Ordens de Serviço', icon: 'clipboard', path: '/ordens-de-servico' },
  { label: 'Agendamentos', icon: 'calendar', path: '/agendamentos' },
  { label: 'Serviços', icon: 'wrench', path: '/servicos' },
  { label: 'Miniaturas', icon: 'bike', path: '/miniaturas' },
  { label: 'Configurações', icon: 'settings', path: '/configuracoes' },
];

export function Icone({ name: nome, size: tamanho = 14 }: { name: string; size?: number }) {
  const caminhos: Record<string, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a5 5 0 0 1 10 0v2M16 5a3 3 0 0 1 0 6m1 4a4 4 0 0 1 4 4v1" />
      </>
    ),
    staff: (
      <>
        <circle cx="12" cy="7" r="3" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2H4ZM9 15l3 3 3-3" />
      </>
    ),
    bike: (
      <>
        <path d="m18 14-1-3" />
        <path d="m3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81" />
        <path d="M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5" />
        <circle cx="19" cy="17" r="3" />
        <circle cx="5" cy="17" r="3" />
      </>
    ),
    clipboard: (
      <>
        <rect x="5" y="5" width="14" height="17" rx="2" />
        <rect x="9" y="2" width="6" height="5" rx="1" />
        <path d="M9 12h6m-6 4h6" />
      </>
    ),
    'file-lines': (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8m-8 4h8" />
      </>
    ),
    'list-checks': <path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2M9 6h12M9 12h12M9 18h12" />,
    'circle-x': (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6m0-6-6 6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 2v6m10-6v6M3 10h18m-13 4h3" />
      </>
    ),
    wrench: (
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.95 7.95l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.95-7.95z" />
    ),
    activity: (
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 11v5m0-8h.01" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m10 2-.5 2.4-2 1-2.2-1-2 3.5 1.8 1.5v2.3l-1.8 1.5 2 3.5 2.2-1 2 1L10 20h4l.5-2.3 2-1 2.2 1 2-3.5-1.8-1.5v-2.3l1.8-1.5-2-3.5-2.2 1-2-1L14 2h-4Z" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    moon: <path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z" />,
    undo: <path d="m9 5-5 5 5 5M4 10h9a7 7 0 0 1 7 7v3" />,
    redo: <path d="m15 5 5 5-5 5m5-5h-9a7 7 0 0 0-7 7v3" />,
    pointer: <path d="m5 3 14 9-7 1-3 7-4-17Z" />,
    grip: (
      <>
        <circle cx="9" cy="5" r="1" />
        <circle cx="15" cy="5" r="1" />
        <circle cx="9" cy="12" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="9" cy="19" r="1" />
        <circle cx="15" cy="19" r="1" />
      </>
    ),
    swap: <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />,
    up: <path d="M12 20V4m-6 6 6-6 6 6" />,
    down: <path d="M12 4v16m-6-6 6 6 6-6" />,
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    volume: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5V4Z" />
        <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    music: (
      <>
        <path d="M9 18V5l12-2v13M9 8l12-2" />
        <ellipse cx="6" cy="18" rx="3" ry="3" />
        <ellipse cx="18" cy="16" rx="3" ry="3" />
      </>
    ),
    upload: (
      <>
        <path d="M12 17V3m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7V5Z" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    left: <path d="m15 18-6-6 6-6" />,
    right: <path d="m9 18 6-6-6-6" />,
    download: <path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3" />,
    sliders: (
      <>
        <path d="M3 7h18M3 17h18" />
        <circle cx="9" cy="7" r="2" fill="white" />
        <circle cx="15" cy="17" r="2" fill="white" />
      </>
    ),
    more: (
      <>
        <circle cx="12" cy="5" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="19" r="1" fill="currentColor" />
      </>
    ),
    card: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
    package: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5m-9 5v10m-5-18 10 6" />
      </>
    ),
    'check-simple': <path d="m5 12 4 4L19 6" strokeWidth={3} />,
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    'clipboard-check': (
      <>
        <rect x="5" y="5" width="14" height="17" rx="2" />
        <rect x="9" y="2" width="6" height="5" rx="1" />
        <path d="m8.5 14 2.5 2.5 4.5-5" />
      </>
    ),
    'exit-arrow': (
      <>
        <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M13 12h8m-3-3 3 3-3 3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    pause: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 9v6m4-6v6" />
      </>
    ),
    trending: (
      <>
        <path d="m3 17 7-7 4 4 7-7" />
        <path d="M15 7h6v6" />
      </>
    ),
    pencil: (
      <>
        <path d="m4 20 4.3-.8L20 7.5 16.5 4 4.8 15.7 4 20ZM14 6.5l3.5 3.5" />
      </>
    ),
    phone: (
      <path d="M5 3h4l2 5-2.5 2.1a16 16 0 0 0 5.4 5.4L16 13l5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2Z" />
    ),
    'phone-green': (
      <path d="M5 3h4l2 5-2.5 2.1a16 16 0 0 0 5.4 5.4L16 13l5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2Z" />
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    ),
    landmark: (
      <>
        <path d="m3 10 9-7 9 7M4 10h16M5 10v9m4-9v9m6-9v9m4-9v9M3 21h18M2 19h20" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 7 9-7" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="7" r="3" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
      </>
    ),
    'file-plus': (
      <>
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7M13 2v6h6M13 2l6 6M7.5 13h5M7.5 17h4" />
        <path d="M18 14v7m-3.5-3.5h7" />
      </>
    ),
    'user-plus': (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v7m-3.5-3.5h7" />
      </>
    ),
    camera: (
      <>
        <path d="M3 7h4l1.5-2h7L17 7h4v12H3V7Z" />
        <circle cx="12" cy="13" r="3" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    save: (
      <>
        <path d="M4 3h14l3 3v15H3V3h1Z" />
        <path d="M7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6" />
      </>
    ),
    dollar: (
      <>
        <path d="M12 2v20M17 6c-1-1.3-2.7-2-5-2-3 0-5 1.5-5 4 0 6 10 2 10 8 0 2.5-2 4-5 4-2.3 0-4.1-.7-5.4-2" />
      </>
    ),
    whatsapp: (
      <>
        <path d="M20.3 11.8A8.3 8.3 0 0 1 8.1 19.2L3 20.7l1.5-4.8A8.3 8.3 0 1 1 20.3 11.8Z" />
        <path d="M8.5 8.1c-.4.3-.8.8-.8 1.6 0 2.2 2.8 5.4 5.5 6.2 1.1.3 2.2.1 2.8-.5l.4-.7-2.1-1-1.1 1c-1.8-.7-2.9-1.8-3.8-3.5l.8-1.1-1.1-2.3-.6.3Z" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    close: <path d="M5 5 19 19M19 5 5 19" />,
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" />
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" />
      </>
    ),
    hash: (
      <>
        <path d="M4 9h16M4 15h16M10 3 7 21M17 3l-3 18" />
      </>
    ),
    gauge: (
      <>
        <path d="M4.8 18a9 9 0 1 1 14.4 0H4.8Z" />
        <path d="m12 14 4-5" />
        <circle cx="12" cy="14" r="1" />
      </>
    ),
    filter: (
      <>
        <path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" />
      </>
    ),
  };
  if (nome === 'settings')
    return (
      <span
        className="admin-menu-settings-icon"
        style={{ width: tamanho, height: tamanho }}
        aria-hidden="true"
      />
    );
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {caminhos[nome]}
    </svg>
  );
}

export default function MenuAdministrador({
  collapsed: recolhido = false,
  onUnavailable: aoIndisponivel,
  onLogout: aoSair,
  aguardandoAcesso = false,
}: {
  aguardandoAcesso?: boolean;
  collapsed?: boolean;
  onUnavailable?: (rotulo: string) => void;
  onLogout: () => void | Promise<void>;
}) {
  const acesso = useAcessoConta();
  const pendencias = usePendenciasMiniaturas(
    !aguardandoAcesso && acesso.administrador && pode('motocicletas'),
  );
  const organizacao = useOrganizacaoInterface(lerOrganizacaoInterface);
  const arraste = useArrasteInterface();
  return (
    <aside
      className={`admin-menu${recolhido ? ' collapsed' : ''}`}
      data-menu-orientation={
        ['superior-antes', 'superior-depois', 'inferior'].includes(organizacao.posicaoMenu)
          ? 'horizontal'
          : 'vertical'
      }
      data-editor-area="menu"
      data-editor-nome="Menu principal"
    >
      <ControlesArea area="menu" nome="Menu principal" />
      <NavLink
        to="/dashboard"
        className="admin-menu-brand"
        data-personalizar-id="logo-dashboard"
        aria-label="Estação Motos — Dashboard"
        onClick={(evento) => {
          if (aguardandoAcesso) evento.preventDefault();
        }}
      >
        <LogoEstacao />
      </NavLink>
      <nav aria-label="Menu principal">
        {[...itens]
          .sort(
            (a, b) =>
              (organizacao.ordemMenu.includes(a.path)
                ? organizacao.ordemMenu.indexOf(a.path)
                : itens.findIndex((item) => item.path === a.path)) -
              (organizacao.ordemMenu.includes(b.path)
                ? organizacao.ordemMenu.indexOf(b.path)
                : itens.findIndex((item) => item.path === b.path)),
          )
          .filter((item) => {
            if (item.path === '/miniaturas' && !pendencias.visivel) return false;
            const modulo = moduloPagina(item.path);
            return aguardandoAcesso || !modulo || pode(modulo);
          })
          .map((item) =>
            [
              '/dashboard',
              '/ordens-de-servico',
              '/clientes',
              '/motocicletas',
              '/funcionarios',
              '/agendamentos',
              '/servicos',
              '/configuracoes',
              '/miniaturas',
            ].includes(item.path) ? (
              <NavLink
                key={item.path}
                data-personalizar-id={`menu-${item.path}`}
                data-editor-menu-item={item.path}
                to={item.path}
                draggable={arraste && item.path !== '/miniaturas'}
                onDragStart={(evento) => {
                  evento.stopPropagation();
                  evento.dataTransfer.setData('application/x-estacao-menu-item', item.path);
                }}
                onDragOver={(evento) => {
                  if (
                    arraste &&
                    item.path !== '/miniaturas' &&
                    evento.dataTransfer.types.includes('application/x-estacao-menu-item')
                  )
                    evento.preventDefault();
                }}
                onDrop={(evento) => {
                  evento.preventDefault();
                  if (item.path === '/miniaturas') return;
                  const de = organizacao.ordemMenu.indexOf(
                    evento.dataTransfer.getData('application/x-estacao-menu-item'),
                  );
                  registrarOrganizacaoVisual({
                    ...organizacao,
                    ordemMenu: moverItem(
                      organizacao.ordemMenu,
                      de,
                      organizacao.ordemMenu.indexOf(item.path),
                    ),
                  });
                }}
                aria-disabled={aguardandoAcesso || undefined}
                onClick={(evento) => {
                  if (aguardandoAcesso) evento.preventDefault();
                }}
                title={item.label}
                className={({ isActive: ehAtivo }) =>
                  `admin-menu-link${ehAtivo ? ' selected' : ''}`
                }
              >
                <Icone name={item.icon} size={17} />
                <span>{item.label}</span>
                {item.path === '/miniaturas' && pendencias.quantidade > 0 && (
                  <small
                    className="admin-menu-count"
                    aria-label={`${pendencias.quantidade} miniaturas pendentes`}
                  >
                    {pendencias.quantidade}
                  </small>
                )}
              </NavLink>
            ) : (
              <button
                key={item.path}
                className="admin-menu-link"
                title={item.label}
                onClick={() => aoIndisponivel?.(item.label)}
              >
                <Icone name={item.icon} size={17} />
                <span>{item.label}</span>
              </button>
            ),
          )}
      </nav>
      <button
        type="button"
        className="workspace-organize-launcher workspace-logout-launcher"
        data-editor-protegido
        aria-label="Sair da conta"
        onClick={() => void aoSair()}
        disabled={aguardandoAcesso}
        title="Sair da conta"
      >
        <Icone name="exit-arrow" size={18} />
        <span>Sair</span>
      </button>
    </aside>
  );
}
