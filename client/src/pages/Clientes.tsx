import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import CabecalhoAdmin from '../components/CabecalhoAdmin';
import MenuAdmin, { Icon } from '../components/MenuAdmin';
import ModalEditarCliente from '../components/ModalEditarCliente';
import PerfilCliente from '../components/PerfilCliente';
import {
  ErroRequisicaoApi, excluirCliente, buscarPerfilCliente, buscarClientes, buscarUsuarioAtual, buscarFotoDiretorioCliente, logout,
  type ItemCliente, type DadosPerfilCliente, type SituacaoCliente, type RespostaClientes,
} from '../services/apiAutenticacao';
import './ordens-servico.css';
import './clientes.css';

type Filter = 'all' | 'active' | 'return' | 'new' | SituacaoCliente;
type Sort = 'recent' | 'oldest' | 'none';
const empty: RespostaClientes = { items: [], counts: { all: 0, active: 0, return: 0, new: 0 }, models: [] };
const pageSize = 6;
const statusLabels: Record<SituacaoCliente, string> = {
  'em andamento': 'OS em andamento', 'aguardando peça': 'Aguardando peça', pronto: 'OS pronta',
  aguardando: 'OS aberta', retorno: 'Retorno sugerido', entregue: 'Serviço finalizado',
  cancelada: 'Sem OS ativa', 'sem-os': 'Sem OS ativa',
};
const cardInfo = [
  { key: 'all', label: 'Clientes', icon: 'users', tone: 'rose', tip: 'Todos os clientes cadastrados' },
  { key: 'active', label: 'Com OS ativa', icon: 'wrench', tone: 'sky', tip: 'Clientes com uma OS aberta, em andamento, aguardando peça ou pronta' },
  { key: 'return', label: 'Aguardando retorno', icon: 'clock', tone: 'amber', tip: 'Sem OS ativa e há pelo menos 90 dias do último serviço concluído' },
  { key: 'new', label: 'Novos este mês', icon: 'trending', tone: 'mint', tip: 'Clientes cujo primeiro atendimento registrado foi neste mês' },
] as const;

function dateOnly(value: string | null) {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(); }
function searchable(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`}`;
}
function pagesToShow(current: number, total: number): (number | '…')[] {
  if (total <= 5) return Array.from({ length: total }, (_, n) => n + 1);
  const choices = [...new Set([1, total, current - 1, current, current + 1, ...(current < 3 ? [2, 3] : [])])]
    .filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  return choices.flatMap((n, i) => i && n - choices[i - 1] > 1 ? ['…' as const, n] : [n]);
}

function ClientAvatar({ id, name, hasPhoto, photoUrl, size = 'small' }: { id: number; name: string; hasPhoto: boolean; photoUrl: string | null; size?: 'small' | 'large' }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!hasPhoto || photoUrl) return;
    let live = true;
    let objectUrl = '';
    buscarFotoDiretorioCliente(id).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (live) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
    }).catch(() => { if (live) setUrl(''); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, hasPhoto, photoUrl]);
  const photo = url || (!failed && photoUrl) || '';
  return <span className={`client-avatar ${size === 'large' ? 'large' : ''}`}>
    {photo ? <img src={photo} alt={`Foto de ${name}`} onError={() => { setUrl(''); setFailed(true); }} referrerPolicy="no-referrer" />
      : <span className="client-avatar-initials" role="img" aria-label={`Iniciais de ${name}`}>{initials(name)}</span>}
  </span>;
}

export default function Clientes() {
  const navigate = useNavigate();
  const { id } = useParams();
  const profileId = id ? Number(id) : null;
  const [name, setName] = useState('Administrador');
  const [authorized, setAuthorized] = useState(false);
  const [authError, setAuthError] = useState('');
  const [retry, setRetry] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useState('');
  const [data, setData] = useState<RespostaClientes>(empty);
  const [profile, setProfile] = useState<DadosPerfilCliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [model, setModel] = useState('all');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<number | null>(null);
  const [actionPosition, setActionPosition] = useState<{ left: number; top: number; arrowLeft: number; above: boolean } | null>(null);
  const [editingClient, setEditingClient] = useState<DadosPerfilCliente | null>(null);
  const [deletingClient, setDeletingClient] = useState<ItemCliente | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deletingError, setDeletingError] = useState('');
  const [deletingReason, setDeletingReason] = useState('');

  useEffect(() => {
    let live = true;
    buscarUsuarioAtual().then(result => { if (live) { setName(result.user.nome); setAuthorized(true); setAuthError(''); } })
      .catch(err => {
        if (!live) return;
        if (err instanceof ErroRequisicaoApi && [401, 403].includes(err.status)) navigate('/login', { replace: true });
        else setAuthError(err instanceof Error ? err.message : 'Não foi possível verificar o acesso.');
      });
    return () => { live = false; };
  }, [navigate, retry]);

  useEffect(() => {
    if (!authorized) return;
    let live = true;
    setLoading(true); setError('');
    const task = profileId ? buscarPerfilCliente(profileId).then(result => { if (live) setProfile(result); })
      : buscarClientes().then(result => { if (live) setData(result); });
    task.catch(err => {
      if (!live) return;
      if (err instanceof ErroRequisicaoApi && [401, 403].includes(err.status)) navigate('/login', { replace: true });
      else setError(err instanceof Error ? err.message : 'Não foi possível carregar os clientes.');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [authorized, profileId, navigate]);
  useEffect(() => { setPage(1); setAction(null); }, [search, filter, sort, model]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (action === null) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.clients-action-menu,.clients-more')) setAction(null);
    };
    const close = () => setAction(null);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [action]);

  const filtered = useMemo(() => {
    const needle = searchable(search.trim());
    const result = data.items.filter(client => {
      const matches = filter === 'all' || (filter === 'active' && client.active) ||
        (filter === 'return' && client.awaitingReturn) || (filter === 'new' && client.newThisMonth) ||
        client.situation === filter;
      return matches && (model === 'all' || client.motorcycles.some(bike => bike.model === model)) &&
        (!needle || searchable(`${client.name} ${client.phone ?? ''} ${client.motorcycles.map(bike => `${bike.model} ${bike.plate ?? ''}`).join(' ')}`).includes(needle));
    });
    if (sort === 'none') return result.filter(client => !client.lastAttendance);
    return result.sort((a, b) => sort === 'recent'
      ? (b.lastAttendance ?? '').localeCompare(a.lastAttendance ?? '') || a.name.localeCompare(b.name, 'pt-BR')
      : (a.lastAttendance ?? '9999').localeCompare(b.lastAttendance ?? '9999') || a.name.localeCompare(b.name, 'pt-BR'));
  }, [data, search, filter, sort, model]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const start = filtered.length ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, filtered.length);
  const reset = () => { setSearch(''); setFilter('all'); setSort('recent'); setModel('all'); };
  const visit = (client: ItemCliente) => { setAction(null); navigate(`/clientes/${client.id}`); };
  function toggleActions(client: ItemCliente, button: HTMLButtonElement) {
    if (action === client.id) { setAction(null); return; }
    const rect = button.getBoundingClientRect();
    const menuWidth = 184, menuHeight = 130;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const above = rect.bottom + menuHeight + 10 >= window.innerHeight;
    setActionPosition({
      left,
      top: above ? Math.max(8, rect.top - menuHeight - 10) : rect.bottom + 10,
      arrowLeft: Math.max(15, Math.min(menuWidth - 15, rect.left + rect.width / 2 - left)),
      above,
    });
    setAction(client.id);
  }
  async function editFromList(client: ItemCliente) {
    setAction(null);
    try { setEditingClient(await buscarPerfilCliente(client.id)); }
    catch (err) { setToast(err instanceof Error ? err.message : 'Não foi possível abrir o cliente.'); }
  }
  function viewClientOrders(client: ItemCliente) {
    setAction(null);
    const params = new URLSearchParams({ clientId: String(client.id), clientName: client.name });
    navigate(`/ordens-de-servico?${params}`);
  }
  async function confirmDelete() {
    if (!deletingClient || deletingBusy) return;
    if (deletingReason.trim().length < 5) { setDeletingError('Descreva o motivo da exclusão com pelo menos 5 caracteres.'); return; }
    setDeletingBusy(true); setDeletingError('');
    try {
      await excluirCliente(deletingClient.id, deletingReason.trim());
      setData(await buscarClientes());
      setPage(1); setDeletingClient(null); setDeletingReason('');
      setToast('Cliente removido da lista. Motos e histórico de OS foram preservados.');
    } catch (err) { setDeletingError(err instanceof Error ? err.message : 'Não foi possível excluir o cliente.'); }
    finally { setDeletingBusy(false); }
  }
  async function signOut() {
    try { await logout(); navigate('/login', { replace: true }); }
    catch (err) { setToast(err instanceof Error ? err.message : 'Não foi possível sair agora.'); }
  }
  if (!authorized) return <div className="orders-auth-loading">{authError
    ? <div><p>{authError}</p><button onClick={() => setRetry(n => n + 1)}>Tentar novamente</button></div>
    : 'Validando acesso…'}</div>;

  return <div className="orders-viewport clients-viewport">
    <MenuAdmin collapsed={collapsed} onUnavailable={label => setToast(`${label} ainda não possui uma página neste projeto.`)} />
    <div className="orders-main">
      <CabecalhoAdmin title="Clientes" name={name} onLogout={signOut} collapsed={collapsed} onToggle={()=>setCollapsed(!collapsed)} search={{value:search,onChange:value=>{if(profileId)navigate('/clientes');setSearch(value);},ariaLabel:'Busca rápida'}}/>
      {profileId ? <main className="clients-content clients-profile-content">
        <div className="client-crumb"><button onClick={() => navigate('/dashboard')}>Dashboard</button><span>/</span><button onClick={() => navigate('/clientes')}>Clientes</button><span>/</span><strong>{profile?.name || 'Perfil'}</strong></div>
        {loading ? <p className="clients-inline-state">Carregando cliente…</p> : error ? <p role="alert" className="clients-inline-state">{error} <button onClick={() => navigate('/clientes')}>Voltar aos clientes</button></p> : profile && <>
          <PerfilCliente profile={profile} onToast={setToast} onUpdated={async () => { setProfile(await buscarPerfilCliente(profile.id)); }}/>
        </>}
      </main> : <main className="clients-content">
        <div className="client-crumb"><span>Dashboard</span><span>/</span><strong>Clientes</strong></div>
        <div className="clients-heading"><h1>Clientes</h1><p>Gerencie relacionamentos, motocicletas e históricos de atendimento.</p></div>
        <div className="clients-stats">{cardInfo.map(card => <button key={card.key} type="button" className={`clients-stat ${card.tone}${filter === card.key && filter !== 'all' ? ' is-selected' : ''}`} title={card.tip} aria-label={`${card.label}: ${data.counts[card.key]}. ${card.tip}`} aria-pressed={filter === card.key} onClick={() => setFilter(filter === card.key && card.key !== 'all' ? 'all' : card.key)}><span className="clients-stat-icon"><Icon name={card.icon} size={18}/></span><span><strong>{data.counts[card.key]}</strong><small>{card.label}</small></span></button>)}</div>
        <section className="clients-panel" aria-label="Lista de clientes">
          <div className="clients-filters"><label className="clients-query"><Icon name="search" size={14}/><input aria-label="Buscar clientes" placeholder="Buscar por nome, telefone ou placa" value={search} onChange={event => setSearch(event.target.value)}/></label>
            <select aria-label="Situação" value={['all', 'active', 'return', 'new'].includes(filter) ? filter : filter} onChange={event => setFilter(event.target.value as Filter)}><option value="all">Situação</option><option value="active">Com OS ativa</option><option value="return">Aguardando retorno</option><option value="new">Novos este mês</option><option value="em andamento">OS em andamento</option><option value="aguardando">OS aberta</option><option value="aguardando peça">Aguardando peça</option><option value="pronto">OS pronta</option><option value="entregue">Serviço finalizado</option><option value="sem-os">Sem OS ativa</option></select>
            <select aria-label="Ordenar por último atendimento" value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="recent">Último atendimento</option><option value="oldest">Mais antigo primeiro</option><option value="none">Sem atendimento</option></select>
            <select aria-label="Motocicleta" value={model} onChange={event => setModel(event.target.value)}><option value="all">Motocicleta</option>{data.models.map(item => <option key={item} value={item}>{item}</option>)}</select>
            <button className="clients-clear" onClick={reset}>Limpar filtros</button>
          </div>
          <div className="clients-table-scroll"><table><thead><tr><th>CLIENTE</th><th>CONTATO</th><th>MOTOCICLETA</th><th>ÚLTIMO ATENDIMENTO</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>
            {visible.map(client => <tr key={client.id}><td><div className="client-name-cell"><ClientAvatar id={client.id} name={client.name} hasPhoto={client.hasPhoto} photoUrl={client.photoUrl}/><span><b>{client.name}</b><small>{client.firstAttendance ? `Primeira OS em ${dateOnly(client.firstAttendance)}` : 'Sem atendimento registrado'}</small></span></div></td>
              <td>{client.phone ? <a className="clients-phone" href={whatsappLink(client.phone)} target="_blank" rel="noreferrer" title="Conversar pelo WhatsApp"><Icon name="phone" size={12}/>{client.phone}</a> : <span className="clients-muted">Não informado</span>}</td>
              <td><div className="client-bike-cell"><Icon name="bike" size={15}/><span>{client.motorcycle ? <><b>{client.motorcycle}</b><small>{client.plate || 'Sem placa'}{client.motorcycleCount > 1 ? ` · +${client.motorcycleCount - 1} ${client.motorcycleCount === 2 ? 'moto' : 'motos'}` : ''}</small></> : <span className="clients-muted">Não cadastrada</span>}</span></div></td>
              <td>{dateOnly(client.lastAttendance)}</td>
              <td><span className={`clients-badge situation-${client.situation.replaceAll(' ', '-')}`}>{statusLabels[client.situation]}</span></td>
              <td><div className="clients-row-actions"><button className="clients-view" onClick={() => visit(client)}>Ver perfil</button><button className="clients-more" aria-label={`Mais ações de ${client.name}`} aria-expanded={action === client.id} aria-haspopup="menu" onClick={event => toggleActions(client, event.currentTarget)}><Icon name="more" size={16}/></button></div></td></tr>)}
            {(loading || error || !visible.length) && <tr><td colSpan={6} className="clients-empty" role={error ? 'alert' : undefined}>{loading ? 'Carregando clientes…' : error || 'Nenhum cliente encontrado para esses filtros.'}</td></tr>}
          </tbody></table></div>
          <div className="clients-panel-footer"><span>Mostrando {start} a {end} de {filtered.length} clientes</span><nav className="clients-pagination" aria-label="Páginas de clientes"><button aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><Icon name="left" size={13}/></button>{pagesToShow(page, pageCount).map((item, n) => item === '…' ? <span key={`gap-${n}`}>…</span> : <button key={item} className={page === item ? 'current' : ''} aria-current={page === item ? 'page' : undefined} onClick={() => setPage(item)}>{item}</button>)}<button aria-label="Próxima página" disabled={page >= pageCount || loading} onClick={() => setPage(page + 1)}><Icon name="right" size={13}/></button></nav></div>
        </section>
      </main>}
    </div>
    {action !== null && actionPosition && data.items.find(client => client.id === action) && createPortal(<div className={`clients-action-menu${actionPosition.above ? ' menu-above' : ''}`} role="menu" aria-label={`Ações de ${data.items.find(client => client.id === action)?.name}`} style={{ left: actionPosition.left, top: actionPosition.top, '--arrow-left': `${actionPosition.arrowLeft}px` } as CSSProperties}>
      <button type="button" role="menuitem" onClick={() => void editFromList(data.items.find(client => client.id === action)!)}><span className="clients-menu-icon edit"><Icon name="pencil" size={16}/></span>Editar cliente</button>
      <button type="button" role="menuitem" onClick={() => viewClientOrders(data.items.find(client => client.id === action)!)}><span className="clients-menu-icon orders"><Icon name="clipboard" size={16}/></span>Ver ordens</button>
      <button type="button" role="menuitem" className="clients-menu-delete" onClick={() => { setDeletingError(''); setDeletingReason(''); setDeletingClient(data.items.find(client => client.id === action)!); setAction(null); }}><span className="clients-menu-icon delete"><Icon name="trash" size={16}/></span>Excluir cliente</button>
    </div>, document.body)}
    {editingClient && <ModalEditarCliente client={editingClient} onClose={() => setEditingClient(null)} onSaved={async () => { setData(await buscarClientes()); setToast('Cliente atualizado.'); }}/>}
    {deletingClient && <div className="clients-delete-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !deletingBusy) setDeletingClient(null); }}><section className="clients-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="clients-delete-title"><span className="clients-delete-icon"><Icon name="trash" size={22}/></span><h2 id="clients-delete-title">Excluir cliente?</h2><p><strong>{deletingClient.name}</strong> deixará de aparecer na lista de clientes. As motos e o histórico de ordens de serviço serão preservados.</p><label className="clients-delete-reason">Motivo da exclusão <span>(obrigatório)</span><textarea autoFocus maxLength={500} value={deletingReason} onChange={event => { setDeletingReason(event.target.value); setDeletingError(''); }} placeholder="Explique por que este cliente deve ser removido da lista..."/><small>{deletingReason.length}/500</small></label>{deletingError && <p className="clients-delete-error" role="alert">{deletingError}</p>}<div><button type="button" onClick={() => setDeletingClient(null)} disabled={deletingBusy}>Cancelar</button><button type="button" className="clients-delete-confirm" onClick={() => void confirmDelete()} disabled={deletingBusy || deletingReason.trim().length < 5}>{deletingBusy ? 'Excluindo…' : 'Excluir cliente'}</button></div></section></div>}
    {toast && <div className="orders-toast" role="status">{toast}</div>}
  </div>;
}
