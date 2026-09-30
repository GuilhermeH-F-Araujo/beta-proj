import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoAdmin from '../components/CabecalhoAdmin';
import SeletorFiltro from '../components/SeletorFiltro';
import MenuAdmin, { Icon } from '../components/MenuAdmin';
import ModalPagamento from '../components/ModalPagamento';
import SeletorPeriodo, { type DateRange } from '../components/SeletorPeriodo';
import MenuAcoesOrdem from '../components/MenuAcoesOrdem';
import ModalAcoesOrdem from '../components/ModalAcoesOrdem';
import { ErroRequisicaoApi, exportarOrdens, buscarUsuarioAtual, buscarOrdens, logout, type ItemOrdem, type StatusOrdem, type FiltrosOrdens, type RespostaOrdens } from '../services/apiAutenticacao';
import { cartoesStatusOrdem as cards, rotulosStatusOrdem as labels } from '../services/statusOrdem';
import './ordens-servico.css';

type Columns = { phone: boolean; plate: boolean; forecast: boolean; mechanic: boolean; total: boolean };
const defaultColumns: Columns = { phone: true, plate: true, forecast: true, mechanic: true, total: false };
const emptyData: RespostaOrdens = { items: [], total: 0, page: 1, pageSize: 15, counts: { aguardando: 0, 'em andamento': 0, 'aguardando peça': 0, pronto: 0, entregue: 0, cancelada: 0 } };

function dateParts(value: string | null) {
  if (!value) return { date: '—', time: '' };
  const [day, clock] = value.replace('T', ' ').split(' ');
  const [year, month, date] = day.split('-');
  return { date: `${date}/${month}/${year}`, time: clock ? clock.slice(0, 5) : '' };
}
function pagesToShow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4, 5].forEach(n => pages.add(n));
  if (current >= total - 2) [total - 4, total - 3, total - 2, total - 1].forEach(n => pages.add(n));
  const ordered = [...pages].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  return ordered.flatMap((n, i) => i && n - ordered[i - 1] > 1 ? ['…' as const, n] : [n]);
}

const statusOptions: {value:FiltrosOrdens['status'];label:string;tone:string}[] = [
  {value:'todos',label:'Todos os status',tone:'neutral'},
  ...cards.map(card=>({value:card.status,label:card.title,tone:card.shade})),
  {value:'pronto',label:'Prontas',tone:'green'},
];

export default function OrdensServico() {
  const navigate = useNavigate();
  const [name, setName] = useState('Administrador');
  const [access, setAccess] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [authRetry, setAuthRetry] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [clientFilter, setClientFilter] = useState(() => {
    const id = Number(new URLSearchParams(window.location.search).get('clientId'));
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  const clientFilterName = new URLSearchParams(window.location.search).get('clientName');
  const [status, setStatus] = useState<FiltrosOrdens['status']>('todos');
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RespostaOrdens>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [personalize, setPersonalize] = useState(false);
  const [columns, setColumns] = useState<Columns>(() => {
    try { return { ...defaultColumns, ...JSON.parse(localStorage.getItem('orders-columns') || '{}') }; }
    catch { return defaultColumns; }
  });
  const [toast, setToast] = useState('');
  const [openAction, setOpenAction] = useState<number | null>(null);
  const [actionModal, setActionModal] = useState<{ id: number; tab: 'status' | 'edit' | 'delete' } | null>(null);
  const [actionAnchor, setActionAnchor] = useState<{ x: number; bottom: number } | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<number | null>(null);
  const filters: FiltrosOrdens = useMemo(() => ({ page, search: debouncedSearch, status, period: 'todos', dateFrom: dateRange?.from, dateTo: dateRange?.to, clientId: clientFilter ?? undefined }), [page, debouncedSearch, status, dateRange, clientFilter]);

  useEffect(() => {
    let active = true;
    setAccessError('');
    buscarUsuarioAtual().then(({ user }) => { if (active) { setName(user.nome); setAccess(true); } })
      .catch(err => {
        if (!active) return;
        if (err instanceof ErroRequisicaoApi && (err.status === 401 || err.status === 403)) {
          navigate('/login', { replace: true });
        } else {
          setAccessError(err instanceof Error ? err.message : 'Não foi possível verificar seu acesso.');
        }
      });
    return () => { active = false; };
  }, [navigate, authRetry]);
  useEffect(() => { const id = setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => clearTimeout(id); }, [search]);
  useEffect(() => { setPage(1); setOpenAction(null); }, [debouncedSearch, status, dateRange]);
  useEffect(() => {
    if (!access) return;
    let active = true;
    setLoading(true); setError('');
    buscarOrdens(filters).then(result => { if (active) setData(result); })
      .catch(err => {
        if (!active) return;
        if (err instanceof ErroRequisicaoApi && (err.status === 401 || err.status === 403)) {
          navigate('/login', { replace: true });
        } else {
          setData(emptyData);
          setError(err instanceof Error ? err.message : 'Não foi possível carregar as OS.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [access, filters, navigate]);
  useEffect(() => { localStorage.setItem('orders-columns', JSON.stringify(columns)); }, [columns]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 3500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => {
    if (!personalize) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPersonalize(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [personalize]);

  async function handleExport() {
    try { await exportarOrdens(filters); }
    catch (err) { setToast(err instanceof Error ? err.message : 'Não foi possível exportar.'); }
  }
  async function handleLogout() {
    try { await logout(); navigate('/login', { replace: true }); }
    catch (err) { setToast(err instanceof Error ? err.message : 'Não foi possível sair agora.'); }
  }
  function refreshOrders(deleted = false) {
    const nextPage = deleted && page > 1 && data.items.length <= 1 ? page - 1 : page;
    if (nextPage !== page) setPage(nextPage);
    else void buscarOrdens(filters).then(setData).catch(err => setToast(err instanceof Error ? err.message : 'Não foi possível atualizar as OS.'));
  }
  const pages = Math.max(1, Math.ceil(data.total / 15));
  const first = data.total ? (page - 1) * 15 + 1 : 0;
  const last = Math.min(page * 15, data.total);
  const visibleColumnCount = 6 + Number(columns.forecast) + Number(columns.mechanic) + Number(columns.total);

  if (!access) return <div className="orders-auth-loading">{accessError
    ? <div><p>{accessError}</p><button type="button" onClick={() => setAuthRetry(value => value + 1)}>Tentar novamente</button></div>
    : 'Validando acesso…'}</div>;
  return <div className="orders-viewport">
    <MenuAdmin collapsed={collapsed} onUnavailable={label => setToast(`${label} ainda não possui uma página neste projeto.`)} />
    <div className="orders-main">
      <CabecalhoAdmin title="Ordens De Serviço" name={name} onLogout={handleLogout} collapsed={collapsed} onToggle={()=>setCollapsed(!collapsed)} search={{value:search,onChange:setSearch,ariaLabel:'Busca rápida'}}/>
      <main className="orders-content">
        {clientFilter && <div className="orders-client-filter">Exibindo ordens de <strong>{clientFilterName || `cliente #${clientFilter}`}</strong><button type="button" onClick={() => { setClientFilter(null); navigate('/ordens-de-servico', { replace: true }); }}>Remover filtro <Icon name="close" size={12}/></button></div>}
        <div className="orders-toolbar">
          <label className="orders-search"><Icon name="search" size={16}/><input aria-label="Buscar ordens" placeholder="Buscar por cliente, OS ou placa..." value={search} onChange={e => setSearch(e.target.value)}/></label>
          <div className="toolbar-right"><SeletorFiltro variant="toolbar" label="Status da ordem de serviço" value={status} options={statusOptions} onChange={setStatus}/><SeletorPeriodo value={dateRange} onApply={setDateRange}/></div>
        </div>
        <div className="status-cards">{cards.map(card => <button key={card.status} className={`status-card${status === card.status ? ' card-selected' : ''}`} onClick={() => setStatus(status === card.status ? 'todos' : card.status)}><span className={`card-icon ${card.shade}`}><Icon name={card.icon} size={22}/></span><span className="card-copy"><small>{card.title}</small><strong>{data.counts[card.status]}</strong><em>{card.subtitle}</em></span><Icon name="chevron" size={16}/></button>)}</div>
        <section className="order-list" aria-label="Lista de Ordens">
          <div className="list-title"><h2>Lista de Ordens</h2><div><button className="white-btn" onClick={handleExport}><Icon name="download" size={15}/> Exportar</button><button className="white-btn" onClick={() => setPersonalize(true)}><Icon name="sliders" size={15}/> Personalizar</button></div></div>
          <div className="table-scroll"><table><thead><tr><th>N° OS</th><th>CLIENTE</th><th>MOTOCICLETA</th><th>STATUS</th><th>ENTRADA</th>{columns.forecast && <th>PREVISÃO</th>}{columns.mechanic && <th>RESPONSÁVEL</th>}{columns.total && <th>TOTAL</th>}<th className="actions-heading">AÇÕES</th></tr></thead><tbody>
            {data.items.map((row: ItemOrdem) => { const entry = dateParts(row.entry); const forecast = dateParts(row.forecast); return <tr key={row.id}><td className="order-number">OS #{row.id}</td><td><b>{row.client}</b>{columns.phone && <small>{row.phone || '—'}</small>}</td><td><b>{row.motorcycle}</b>{columns.plate && <small>{row.plate || '—'}</small>}</td><td><span className={`order-badge badge-${row.status.replaceAll(' ', '-')}`}>{labels[row.status]}</span></td><td>{entry.date}<small>{entry.time}</small></td>{columns.forecast && <td>{forecast.date}<small>{forecast.time}</small></td>}{columns.mechanic && <td><span className="mechanic"><span className="mechanic-avatar">{row.mechanic.charAt(0)}</span>{row.mechanic}</span></td>}{columns.total && <td>{row.total == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.total)}</td>}<td className="order-actions"><div className="action-controls"><button className="action-view" type="button" onClick={() => navigate(`/ordens-de-servico/${row.id}`)}>Ver</button><div className="action-menu-wrap"><button className="action-more" type="button" aria-label={`Mais ações da OS #${row.id}`} aria-expanded={openAction === row.id} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setActionAnchor({ x:rect.left + rect.width / 2, bottom:rect.bottom }); setOpenAction(openAction === row.id ? null : row.id); }}><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><circle cx="7" cy="3" r="1"/><circle cx="7" cy="7" r="1"/><circle cx="7" cy="11" r="1"/></svg></button></div>{row.paymentStatus === 'pago' ? <span className="payment-paid"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="m5.3 8 1.8 1.8 3.7-3.7"/></svg>Pago</span> : <button className="payment-button" type="button" onClick={() => { setPaymentOrder(row.id); setOpenAction(null); }}><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="2.1" y="3.4" width="11.8" height="9.2" rx="1.8"/><path d="M2.4 6.7h11.2M4.5 10h3"/></svg>Pagamento</button>}</div></td></tr>; })}
            {(loading || error || !data.items.length) && <tr><td colSpan={visibleColumnCount} className="empty-state">{loading ? 'Carregando ordens...' : error || 'Nenhuma ordem encontrada para esses filtros.'}</td></tr>}
          </tbody></table></div>
          <div className="list-footer"><span>Mostrando {first} a {last} de {data.total} ordens</span><nav className="pagination" aria-label="Páginas de ordens"><button aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><Icon name="left" size={14}/></button>{pagesToShow(page, pages).map((item, index) => item === '…' ? <span key={`gap-${index}`}>…</span> : <button key={item} className={page === item ? 'active' : ''} aria-current={page === item ? 'page' : undefined} onClick={() => setPage(item)}>{item}</button>)}<button aria-label="Próxima página" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><Icon name="right" size={14}/></button></nav></div>
        </section>
      </main>
    </div>
    {openAction !== null && actionAnchor && <MenuAcoesOrdem anchor={actionAnchor} onClose={() => setOpenAction(null)} onSelect={action => { setActionModal({ id: openAction, tab: action }); setOpenAction(null); }} />}
    {actionModal && <ModalAcoesOrdem key={`${actionModal.id}-${actionModal.tab}`} orderId={actionModal.id} initialTab={actionModal.tab} onClose={() => setActionModal(null)} onChanged={() => refreshOrders()} onDeleted={() => refreshOrders(true)}/>}
    {toast && <div className="orders-toast" role="status">{toast}</div>}
    {paymentOrder !== null && <ModalPagamento orderId={paymentOrder} onClose={() => setPaymentOrder(null)} onPaid={id => { setData(previous => ({ ...previous, items: previous.items.map(item => item.id === id ? { ...item, paymentStatus: 'pago' } : item) })); }} />}
    {personalize && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPersonalize(false); }}><section className="orders-modal" role="dialog" aria-modal="true" aria-labelledby="columns-title"><div className="modal-heading"><div><span className="modal-eyebrow">EXIBIÇÃO DA TABELA</span><h2 id="columns-title">Personalizar colunas</h2><p>Escolha os dados que deseja ver na lista de ordens.</p></div><button className="modal-close plain" aria-label="Fechar" onClick={() => setPersonalize(false)}><Icon name="close" size={18}/></button></div><div className="column-list">{([['phone','Telefone do cliente'],['plate','Placa da moto'],['forecast','Previsão de entrega'],['mechanic','Responsável'],['total','Valor total']] as const).map(([key, label]) => <label className="column-option" key={key}><span>{label}</span><input type="checkbox" checked={columns[key]} onChange={event => setColumns(previous => ({...previous, [key]: event.target.checked}))}/><span className="toggle" aria-hidden="true"/></label>)}</div><div className="modal-footer"><button className="white-btn" onClick={() => setColumns(defaultColumns)}>Restaurar padrão</button><button className="red-btn" onClick={() => setPersonalize(false)}>Concluir</button></div></section></div>}
  </div>;
}
