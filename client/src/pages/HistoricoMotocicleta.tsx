import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CabecalhoAdmin from '../components/CabecalhoAdmin';
import { rotulosStatusOrdem } from '../services/statusOrdem';
import MenuAdmin, { Icon } from '../components/MenuAdmin';
import SeletorPeriodo, { type DateRange } from '../components/SeletorPeriodo';
import { ErroRequisicaoApi, buscarUsuarioAtual, buscarHistoricoMotocicleta, logout, type HistoricoMotocicleta, type StatusOrdem } from '../services/apiAutenticacao';
import { useMiniaturaMotocicleta } from '../services/miniaturasMotocicletas';
import './ordens-servico.css';
import './historico-motocicleta.css';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const km = (value: number | null | undefined) => value == null ? '—' : `${new Intl.NumberFormat('pt-BR').format(value)} km`;
const when = (value: string | null, option: 'date' | 'time' = 'date') => value ? new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', ...(option === 'date' ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { hour: '2-digit', minute: '2-digit' }),
}).format(new Date(value)) : '—';
const totalFor = (order: HistoricoMotocicleta['orders'][number]) => order.total ?? order.services.reduce((n, item) => n + item.price, 0) + order.parts.reduce((n, item) => n + item.quantity * item.unitPrice, 0);
const timelineIcons: Record<StatusOrdem, string> = { aguardando: 'clock', 'aguardando peça': 'package', 'em andamento': 'wrench', pronto: 'check', entregue: 'check', cancelada: 'close' };

export default function PaginaHistoricoMotocicleta() {
  const { id } = useParams();
  const orderId = Number(id);
  const navigate = useNavigate();
  const [data, setData] = useState<HistoricoMotocicleta | null>(null);
  const [name, setName] = useState('Administrador');
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusOrdem | 'todos'>('todos');
  const [year, setYear] = useState('todos');
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [visible, setVisible] = useState(6);
  const [showAllParts, setShowAllParts] = useState(false);
  const [badImage, setBadImage] = useState('');
  const thumbnail = useMiniaturaMotocicleta(orderId, data?.motorcycle.model, data?.motorcycle.color);
  const bikeImage = thumbnail.url && thumbnail.url !== badImage ? thumbnail.url : null;

  useEffect(() => {
    if (!Number.isSafeInteger(orderId) || orderId < 1) { setError('Número da OS inválido.'); return; }
    let mounted = true;
    Promise.all([buscarUsuarioAtual(), buscarHistoricoMotocicleta(orderId)]).then(([identity, history]) => {
      if (mounted) { setName(identity.user.nome); setData(history); setError(''); }
    }).catch(err => {
      if (!mounted) return;
      if (err instanceof ErroRequisicaoApi && (err.status === 401 || err.status === 403)) navigate('/login', { replace: true });
      else setError(err instanceof Error ? err.message : 'Não foi possível carregar o histórico.');
    });
    return () => { mounted = false; };
  }, [orderId, navigate]);

  const years = useMemo(() => [...new Set((data?.orders ?? []).map(order => order.entry.slice(0, 4)))].sort().reverse(), [data]);
  const filtered = useMemo(() => (data?.orders ?? []).filter(order => {
    const needle = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const content = `OS ${order.id} ${order.problem ?? ''} ${order.observations ?? ''} ${order.cancellationReason ?? ''} ${order.mechanic} ${order.services.map(item => item.description).join(' ')} ${order.parts.map(item => item.name).join(' ')}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const day = order.entry.slice(0, 10);
    return (!needle || content.includes(needle)) && (status === 'todos' || order.status === status) && (year === 'todos' || day.startsWith(year)) && (!dateRange || (day >= dateRange.from && day <= dateRange.to));
  }), [data, query, status, year, dateRange]);
  const lastCompleted = data?.orders.find(order => order.status === 'entregue');
  const maintenanceDate = lastCompleted ? new Date(lastCompleted.exit || lastCompleted.entry) : null;
  if (maintenanceDate && !Number.isNaN(maintenanceDate.getTime())) maintenanceDate.setMonth(maintenanceDate.getMonth() + 6);
  const nextKm = lastCompleted ? (lastCompleted.kmExit ?? lastCompleted.kmEntry ?? data?.motorcycle.km ?? 0) + 5000 : null;

  async function handleLogout() {
    try { await logout(); navigate('/login', { replace: true }); }
    catch { setToast('Não foi possível sair agora.'); }
  }
  function resetFilters() { setQuery(''); setStatus('todos'); setYear('todos'); setDateRange(null); setVisible(6); }

  return <div className="orders-viewport history-viewport">
    <MenuAdmin collapsed={collapsed} onUnavailable={label => setToast(`${label} ainda não possui uma página neste projeto.`)} />
    <div className="orders-main">
      <CabecalhoAdmin title="Histórico da Motocicleta" collapsed={collapsed} onToggle={()=>setCollapsed(value=>!value)} name={name} onLogout={handleLogout}/>
      <main className="history-scroll">
        {error ? <div className="details-error"><p>{error}</p><button onClick={() => navigate(`/ordens-de-servico/${orderId}`)}>Voltar aos detalhes</button></div> : !data ? <div className="details-loading">Carregando histórico da motocicleta...</div> : <div className="history-body">
          <h1>Histórico da Motocicleta</h1><div className="history-breadcrumb"><button onClick={() => navigate(`/ordens-de-servico/${orderId}`)}>Voltar aos detalhes da OS</button><Icon name="right" size={10}/><span>Histórico</span></div>
          <div className="history-columns">
            <div className="history-left">
              <section className="history-bike-card">
                <div className="history-bike-art">{bikeImage ? <img src={bikeImage} alt={`Miniatura de ${data.motorcycle.model}`} onError={() => setBadImage(bikeImage)}/> : <Icon name="bike" size={65} />}{thumbnail.error && <small className="history-image-error" role="status">{thumbnail.error}</small>}</div>
                <div className="history-bike-info"><div className="history-bike-title"><h2>{data.motorcycle.model}</h2>{data.motorcycle.year && <span className="history-year">◎ {data.motorcycle.year}/{data.motorcycle.year + 1}</span>}</div>
                  <div className="history-bike-meta"><div><Icon name="card"/><span>Placa<b>{data.motorcycle.plate || '—'}</b></span></div><div><Icon name="users"/><span>Cliente<b>{data.motorcycle.client}</b></span></div><div><Icon name="hash"/><span>Chassi<b>Não cadastrado</b></span></div><div><Icon name="calendar"/><span>Data de Cadastro<b>Não cadastrada</b></span></div><div><Icon name="clock"/><span>Cor<b>{data.motorcycle.color || '—'}</b></span></div><div><Icon name="gauge"/><span>KM Atual<b>{km(data.motorcycle.km)}</b></span></div></div>
                </div>
                <div className="history-bike-stats"><div><span>Total de OS</span><b>{data.summary.total}</b></div><div><span>Última Entrada</span><b>{when(data.orders[0]?.entry || null)}</b></div><div><span>Média por OS</span><b>{money(data.summary.total ? data.summary.spent / data.summary.total : 0)}</b></div></div>
              </section>
              <section className="history-filters" aria-label="Filtros do histórico">
                <label className="history-query"><Icon name="search" size={14}/><input aria-label="Buscar no histórico" placeholder="Buscar no histórico..." value={query} onChange={e => { setQuery(e.target.value); setVisible(6); }}/></label>
                <label>Status<select value={status} onChange={e => { setStatus(e.target.value as typeof status); setVisible(6); }}><option value="todos">Todos</option><option value="aguardando">Aberta</option><option value="em andamento">Em andamento</option><option value="aguardando peça">Aguardando peça</option><option value="pronto">Pronta</option><option value="entregue">Finalizada</option><option value="cancelada">Cancelada</option></select></label>
                <label>Ano<select value={year} onChange={e => { setYear(e.target.value); setVisible(6); }}><option value="todos">Todos</option>{years.map(item => <option key={item}>{item}</option>)}</select></label>
                <SeletorPeriodo variant="fields" value={dateRange} onApply={value => { setDateRange(value); setVisible(6); }}/>
                <button className="history-clear" onClick={resetFilters}><Icon name="filter" size={12}/> Limpar</button>
              </section>
              <section className="history-timeline"><h2>Histórico de Ordens de Serviço</h2><div className="timeline-items">
                {filtered.slice(0, visible).map(order => <div className="timeline-row" key={order.id}><div className="timeline-date"><b>{when(order.entry)}</b><small>{when(order.entry, 'time')}</small></div><div className={`timeline-icon timeline-${order.status.replace(' ', '-')}`}><Icon name={timelineIcons[order.status]} size={15}/></div><article className="timeline-card"><div className="timeline-card-top"><b>OS #{order.id}</b><span className={`history-status hs-${order.status.replace(' ', '-')}`}>{rotulosStatusOrdem[order.status]}</span><span className="timeline-more">···</span></div><div className="timeline-details"><div className="timeline-problem"><small>Problema relatado</small><b>{order.problem || 'Não informado'}</b><small>Serviços realizados</small><b>{order.services.length ? order.services.map(item => item.description).join(' · ') : 'Nenhum serviço registrado'}</b></div><div><small><Icon name="wrench" size={11}/> Mecânico</small><b>{order.mechanic}</b></div><div><small><Icon name="gauge" size={11}/> KM na entrada</small><b>{km(order.kmEntry)}</b></div><div><small><Icon name="hash" size={11}/> Status Pagamento</small><span className={`history-payment ${order.paymentStatus}`}>{order.paymentStatus === 'pago' ? '✓ Pago' : 'Pendente'}</span></div></div>{order.status === 'cancelada' && <div className="history-cancellation-reason"><Icon name="info" size={13}/><span><b>Motivo do cancelamento</b>{order.cancellationReason || 'Motivo não registrado nesta OS antiga.'}</span></div>}<div className="timeline-card-footer"><span>{money(totalFor(order))}</span><button onClick={() => navigate(`/ordens-de-servico/${order.id}`)}>Ver detalhes <Icon name="right" size={12}/></button></div></article></div>)}
                {!filtered.length && <div className="history-no-results">Nenhuma OS encontrada com esses filtros.</div>}
              </div>{filtered.length > visible && <button className="history-more" onClick={() => setVisible(n => n + 6)}>Carregar mais histórico <Icon name="chevron" size={12}/></button>}</section>
            </div>
            <aside className="history-right">
              <section className="history-side-card"><h2>Resumo Geral</h2><div className="history-summary-list"><div>Total de OS <b>{data.summary.total}</b></div><div>OS Concluídas <b className="green">{data.summary.completed}</b></div><div>OS em Andamento <b className="orange">{data.summary.inProgress}</b></div><div>OS Canceladas <b className="red">{data.summary.cancelled}</b></div><hr/><div>Total de Serviços <b>{data.summary.services}</b></div><div>Total de Peças Utilizadas <b>{data.summary.parts}</b></div><div>Total Gasto <b>{money(data.summary.spent)}</b></div></div></section>
              <section className="history-side-card history-parts"><div className="history-side-heading"><h2>Peças Mais Utilizadas</h2>{data.mostUsedParts.length > 5 && <button onClick={() => setShowAllParts(!showAllParts)}>{showAllParts ? 'Ver menos' : 'Ver todas'}</button>}</div><table><thead><tr><th>Peça</th><th>Quantidade</th><th>Total Gasto</th></tr></thead><tbody>{(showAllParts ? data.mostUsedParts : data.mostUsedParts.slice(0, 5)).map(part => <tr key={part.name}><td>{part.name}</td><td>{part.quantity}</td><td>{money(part.total)}</td></tr>)}{!data.mostUsedParts.length && <tr><td colSpan={3}>Nenhuma peça registrada.</td></tr>}</tbody></table></section>
              <section className="history-side-card history-maintenance"><span className="maintenance-icon"><Icon name="calendar" size={21}/></span><div><h2>Próxima Manutenção sugerida</h2><p>Estimativa: 6 meses ou 5.000 km após a última OS concluída.</p>{lastCompleted && maintenanceDate ? <><div className="maintenance-target"><b>{when(maintenanceDate.toISOString())}</b><span>+ 5.000 km</span></div><div className="maintenance-km"><span>KM na última OS<strong>{km(lastCompleted.kmExit ?? lastCompleted.kmEntry)}</strong></span><span>Próximo serviço<strong>{km(nextKm)}</strong></span></div></> : <p>Conclua uma OS para calcular a estimativa.</p>}</div></section>
            </aside>
          </div>
        </div>}
      </main>
    </div>
    {toast && <div className="orders-toast" role="status" onClick={() => setToast('')}>{toast}</div>}
  </div>;
}
