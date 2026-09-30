import { NavLink } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type PosicaoMenu = 'esquerda' | 'direita' | 'superior' | 'inferior';
const posicoes: { valor: PosicaoMenu; rotulo: string }[] = [
  { valor: 'esquerda', rotulo: 'Esquerda' }, { valor: 'direita', rotulo: 'Direita' },
  { valor: 'superior', rotulo: 'Em cima' }, { valor: 'inferior', rotulo: 'Embaixo' },
];
function posicaoSalva(): PosicaoMenu {
  try {
    const salva = localStorage.getItem('posicao-menu-admin');
    return posicoes.find(item => item.valor === salva)?.valor ?? 'esquerda';
  } catch { return 'esquerda'; }
}

type Item = { label: string; icon: string; path: string };
const items: Item[] = [
  { label: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
  { label: 'Clientes', icon: 'users', path: '/clientes' },
  { label: 'Funcionários', icon: 'staff', path: '/funcionarios' },
  { label: 'Motocicletas', icon: 'bike', path: '/motocicletas' },
  { label: 'Ordens de Serviço', icon: 'clipboard', path: '/ordens-de-servico' },
  { label: 'Agendamentos', icon: 'calendar', path: '/agendamentos' },
  { label: 'Serviços', icon: 'wrench', path: '/servicos' },
  { label: 'Configurações', icon: 'settings', path: '/configuracoes' },
];

export function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 10 0v2M16 5a3 3 0 0 1 0 6m1 4a4 4 0 0 1 4 4v1"/></>,
    staff: <><circle cx="12" cy="7" r="3"/><path d="M4 21v-2a8 8 0 0 1 16 0v2H4ZM9 15l3 3 3-3"/></>,
    bike: <><path d="m18 14-1-3"/><path d="m3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81"/><path d="M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5"/><circle cx="19" cy="17" r="3"/><circle cx="5" cy="17" r="3"/></>,
    clipboard: <><rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="M9 12h6m-6 4h6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 10h18m-13 4h3"/></>,
    wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.95 7.95l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.95-7.95z"/>,
    activity: <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>,
    info: <><circle cx="12" cy="12" r="10"/><path d="M12 11v5m0-8h.01"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m10 2-.5 2.4-2 1-2.2-1-2 3.5 1.8 1.5v2.3l-1.8 1.5 2 3.5 2.2-1 2 1L10 20h4l.5-2.3 2-1 2.2 1 2-3.5-1.8-1.5v-2.3l1.8-1.5-2-3.5-2.2 1-2-1L14 2h-4Z"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    left: <path d="m15 18-6-6 6-6"/>,
    right: <path d="m9 18 6-6-6-6"/>,
    download: <path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>,
    sliders: <><path d="M3 7h18M3 17h18"/><circle cx="9" cy="7" r="2" fill="white"/><circle cx="15" cy="17" r="2" fill="white"/></>,
    more: <><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>,
    package: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5m-9 5v10m-5-18 10 6"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
    'clipboard-check': <><rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="m8.5 14 2.5 2.5 4.5-5"/></>,
    'exit-arrow': <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M13 12h8m-3-3 3 3-3 3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    trending: <><path d="m3 17 7-7 4 4 7-7"/><path d="M15 7h6v6"/></>,
    pencil: <><path d="m4 20 4.3-.8L20 7.5 16.5 4 4.8 15.7 4 20ZM14 6.5l3.5 3.5"/></>,
    phone: <path d="M5 3h4l2 5-2.5 2.1a16 16 0 0 0 5.4 5.4L16 13l5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2Z"/>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></>,
    user: <><circle cx="12" cy="7" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
    camera: <><path d="M3 7h4l1.5-2h7L17 7h4v12H3V7Z"/><circle cx="12" cy="13" r="3"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    save: <><path d="M4 3h14l3 3v15H3V3h1Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></>,
    dollar: <><path d="M12 2v20M17 6c-1-1.3-2.7-2-5-2-3 0-5 1.5-5 4 0 6 10 2 10 8 0 2.5-2 4-5 4-2.3 0-4.1-.7-5.4-2"/></>,
    whatsapp: <><path d="M20.3 11.8A8.3 8.3 0 0 1 8.1 19.2L3 20.7l1.5-4.8A8.3 8.3 0 1 1 20.3 11.8Z"/><path d="M8.5 8.1c-.4.3-.8.8-.8 1.6 0 2.2 2.8 5.4 5.5 6.2 1.1.3 2.2.1 2.8-.5l.4-.7-2.1-1-1.1 1c-1.8-.7-2.9-1.8-3.8-3.5l.8-1.1-1.1-2.3-.6.3Z"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    hash: <><path d="M4 9h16M4 15h16M10 3 7 21M17 3l-3 18"/></>,
    gauge: <><path d="M4.8 18a9 9 0 1 1 14.4 0H4.8Z"/><path d="m12 14 4-5"/><circle cx="12" cy="14" r="1"/></>,
    filter: <><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function MenuAdmin({ collapsed = false, onUnavailable }: { collapsed?: boolean; onUnavailable?: (label: string) => void }) {
  const [posicao, setPosicao] = useState<PosicaoMenu>(posicaoSalva);
  const [aberto, setAberto] = useState(false);
  const controle = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const pagina = menu.current?.closest('.orders-viewport');
    if (pagina instanceof HTMLElement) pagina.dataset.menuPosition = posicao;
    return () => { if (pagina instanceof HTMLElement) delete pagina.dataset.menuPosition; };
  }, [posicao]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (evento: PointerEvent) => { if (!controle.current?.contains(evento.target as Node)) setAberto(false); };
    const teclado = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', teclado);
    return () => { document.removeEventListener('pointerdown', fechar); document.removeEventListener('keydown', teclado); };
  }, [aberto]);

  function mudarPosicao(nova: PosicaoMenu) {
    setPosicao(nova);
    setAberto(false);
    try { localStorage.setItem('posicao-menu-admin', nova); } catch {}
  }

  return <aside ref={menu} className={`admin-menu${collapsed ? ' collapsed' : ''}`}>
    <div className="admin-menu-brand"><img src="/assets/estacao-motos-logo-sidebar.png" alt="Estação Motos" /></div>
    <nav aria-label="Menu principal">{items.map(item => ['/ordens-de-servico', '/clientes','/motocicletas'].includes(item.path) ? <NavLink key={item.path} to={item.path} title={item.label} className={({isActive}) => `admin-menu-link${isActive ? ' selected' : ''}`}><Icon name={item.icon} size={11}/><span>{item.label}</span></NavLink> : <button key={item.path} className="admin-menu-link" title={item.label} onClick={() => onUnavailable?.(item.label)}><Icon name={item.icon} size={11}/><span>{item.label}</span></button>)}</nav>
    <div className="admin-menu-position" ref={controle}>
      <button type="button" className="admin-menu-position-trigger" title="Posição do menu" aria-label="Escolher posição do menu" aria-expanded={aberto} aria-haspopup="dialog" onClick={() => setAberto(valor => !valor)}><Icon name="sliders" size={16}/><span>Posição do menu</span></button>
      {aberto && <div className="admin-menu-position-options" role="dialog" aria-label="Posição do menu"><strong>Posição do menu</strong><p>Escolha onde prefere navegar.</p><div>{posicoes.map(item => <button key={item.valor} type="button" aria-pressed={posicao === item.valor} onClick={() => mudarPosicao(item.valor)}><span className={`admin-menu-position-drawing posicao-${item.valor}`}/>{item.rotulo}</button>)}</div></div>}
    </div>
  </aside>;
}
