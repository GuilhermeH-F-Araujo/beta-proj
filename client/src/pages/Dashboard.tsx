import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoAdmin from '../components/CabecalhoAdmin';
import MenuAdmin, { Icon } from '../components/MenuAdmin';
import { logout, request, buscarNotificacoesAdmin, type ItemOrdem, type RespostaOrdens, type StatusOrdem } from '../services/apiAutenticacao';
type OrdemPainel={id:number;status:StatusOrdem;entry:string;exit:string|null;forecast:string|null;mechanicId:number|null};
type TecnicoPainel={id:number;nome:string;cargo:string};
type DadosPainel={orders:OrdemPainel[];counts:RespostaOrdens['counts'];oldest:ItemOrdem[];employees:TecnicoPainel[]};
import { useUsuarioAdmin } from '../components/RotaProtegida';
import SeletorFiltro from '../components/SeletorFiltro';
import SeletorPeriodo, { type DateRange } from '../components/SeletorPeriodo';
import GraficoOrdens from '../components/GraficoOrdens';
import './dashboard.css';

const empty: RespostaOrdens = { items: [], total: 0, page: 1, pageSize: 15, counts: { aguardando: 0, 'em andamento': 0, 'aguardando peça': 0, pronto: 0, entregue: 0, cancelada: 0 } };
const statusInfo: { key: StatusOrdem; label: string; color: string }[] = [
  { key: 'aguardando', label: 'Em aberto', color: '#ef3348' },
  { key: 'em andamento', label: 'Em andamento', color: '#ed7624' },
  { key: 'aguardando peça', label: 'Aguardando peça', color: '#3b82f6' },
  { key: 'pronto', label: 'Prontas para entrega', color: '#06b6d4' },
  { key: 'entregue', label: 'Finalizadas', color: '#10b981' },
  { key: 'cancelada', label: 'Canceladas', color: '#94a3b8' },
];

function dateKey(value: string) { return value.slice(0, 10); }
function shortDate(value: string) {
  if (!value) return '—';
  const [date, time = ''] = value.replace('T', ' ').split(' ');
  const [year, month, day] = date.split('-');
  return `${day}/${month}${time ? ` · ${time.slice(0, 5)}` : ''}`;
}
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—'; }

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useUsuarioAdmin();
  const [collapsed, setCollapsed] = useState(false);
  const [summary, setSummary] = useState<RespostaOrdens>(empty);
  const [monthly, setMonthly] = useState<OrdemPainel[]>([]);
  const [chartPeriod, setChartPeriod] = useState('diario');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [pickingRange, setPickingRange] = useState(false);
  const [pickerVersion,setPickerVersion]=useState(0);
  const [weekly, setWeekly] = useState<OrdemPainel[]>([]);
  const [oldest, setOldest] = useState<ItemOrdem[]>([]);
  const [activeOrders, setActiveOrders] = useState<OrdemPainel[]>([]);
  const [team, setTeam] = useState<TecnicoPainel[]>([]);
  const [alerts, setAlerts] = useState<{ title: string; body: string; orderId: number | null; createdAt: string }[]>([]);
  const [unread, setUnread] = useState(0);
  const [alertsState,setAlertsState]=useState<'pending'|'ok'|'error'>('pending');
  const [loading, setLoading] = useState(true);
  const [loaded,setLoaded]=useState(false);
  const [teamPeriod,setTeamPeriod]=useState('mes');
  const [teamRange,setTeamRange]=useState<DateRange|null>(null);
  const [teamPicker,setTeamPicker]=useState(false);
  const [teamPickerVersion,setTeamPickerVersion]=useState(0);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  const refresh = useCallback(() => {
    let active = true;
    const version = ++requestVersion.current;
    const isCurrent = () => active && requestVersion.current === version;
    setLoading(true); setError('');
    const now = new Date();
    const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
    request<DadosPainel>('/api/admin/dashboard',{method:'GET'}).then(data=>{
      if(!isCurrent())return;
      setSummary({...empty,total:data.orders.length,counts:data.counts});setWeekly(data.orders);
      setMonthly(data.orders.filter(o=>o.entry.slice(0,7)===month));
      setActiveOrders(data.orders.filter(o=>!['entregue','cancelada'].includes(o.status)));
      setOldest(data.oldest);setTeam(data.employees);setLoaded(true);
    }).catch(err=>{if(isCurrent())setError(err instanceof Error?err.message:'Não foi possível carregar o painel.');}).finally(()=>{if(isCurrent())setLoading(false);});
    buscarNotificacoesAdmin().then(data=>{if(isCurrent()){setAlerts(data.items.filter(item=>!item.read).slice(0,4));setUnread(data.unreadCount);setAlertsState('ok');}}).catch(()=>{if(isCurrent())setAlertsState('error');});

    return () => { active = false; };
  }, []);

  useEffect(() => {
    const cancel = refresh();
    return () => { cancel(); requestVersion.current += 1; };
  }, [refresh]);
  const weeklySeries = useMemo(() => {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [year, month, day] = today.split('-').map(Number);
    const todayUtc = Date.UTC(year, month - 1, day);
    const count = chartPeriod === 'semanal' ? 8 : chartPeriod === 'mensal' ? 6 : chartPeriod === 'personalizado' && customRange ? Math.ceil((Math.round((Date.parse(customRange.to)-Date.parse(customRange.from))/86400000)+1)/Math.max(1,Math.ceil((Math.round((Date.parse(customRange.to)-Date.parse(customRange.from))/86400000)+1)/31))) : 30;
    const rangeStart = customRange ? Date.parse(customRange.from + 'T00:00:00Z') : todayUtc;
    const rangeEnd = customRange ? Date.parse(customRange.to + 'T00:00:00Z') + 86400000 : todayUtc + 86400000;
    const days = Array.from({length:count}, (_,index) => {
      let from:number, to:number;
      if(chartPeriod === 'mensal') {from=Date.UTC(year,month-1-(count-1-index),1);to=Date.UTC(year,month-(count-1-index),1);}
      else if(chartPeriod === 'semanal') {from=todayUtc-(count-1-index)*7*86400000-6*86400000;to=from+7*86400000;}
      else if(chartPeriod === 'personalizado' && customRange) {const step=Math.max(1,Math.ceil((rangeEnd-rangeStart)/86400000/31))*86400000;from=rangeStart+index*step;to=Math.min(rangeEnd,from+step);}
      else {from=todayUtc-(count-1-index)*86400000;to=from+86400000;}
      const date=new Date(from);
      const label=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',...(chartPeriod==='mensal'?{month:'short',year:'2-digit'}:{day:'2-digit',month:'2-digit'})}).format(date);
      const dateFormatter=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'});
      const tooltipLabel=to-from>86400000?`${dateFormatter.format(new Date(from))} – ${dateFormatter.format(new Date(to-1))}`:dateFormatter.format(date);
      return {key:String(from),label,tooltipLabel,count:weekly.filter(order=>{const time=Date.parse(dateKey(order.entry)+'T00:00:00Z');return time>=from&&time<to;}).length};
    });
    return days;
  }, [weekly,chartPeriod,customRange]);
  const chartTotal = weeklySeries.reduce((sum, day) => sum + day.count, 0);
  const peakDay = weeklySeries.reduce((best, day) => day.count > best.count ? day : best, weeklySeries[0]);
  const donutTotal = statusInfo.reduce((sum, item) => sum + summary.counts[item.key], 0);
  const donutGradient = useMemo(() => {
    let position = 0;
    const stops = statusInfo.map(item => {
      const start = position;
      position += donutTotal ? (summary.counts[item.key] / donutTotal) * 100 : 0;
      return summary.counts[item.key] ? `${item.color} ${start}% ${Math.max(start, position - .45)}%, #fff ${Math.max(start, position - .45)}% ${position}%` : `${item.color} ${start}% ${position}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [summary, donutTotal]);
  const rankedTeam = useMemo(()=>{
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-6);
    const from=teamPeriod==='dia'?today:teamPeriod==='semana'?date.toISOString().slice(0,10):teamPeriod==='personalizado'&&teamRange?teamRange.from:today.slice(0,7)+'-01';
    const to=teamPeriod==='personalizado'&&teamRange?teamRange.to:today;
    return team.map(person=>{const orders=weekly.filter(o=>o.mechanicId===person.id&&o.status!=='cancelada'&&o.entry.slice(0,10)>=from&&o.entry.slice(0,10)<=to);return {...person,worked:orders.length,completed:orders.filter(o=>['pronto','entregue'].includes(o.status)).length};}).filter(p=>p.worked>0).sort((a,b)=>b.worked-a.worked||b.completed-a.completed||a.nome.localeCompare(b.nome,'pt-BR')).slice(0,5);
  },[team,weekly,teamPeriod,teamRange]);
  const teamMonth=monthly.filter(o=>o.mechanicId!==null&&o.status!=='cancelada');
  const productivity=teamMonth.length?Math.round(teamMonth.filter(o=>['pronto','entregue'].includes(o.status)).length/teamMonth.length*100):0;
  const hasProductivityData=teamMonth.length>0;
  const openOrders = summary.counts.aguardando + summary.counts['em andamento'] + summary.counts['aguardando peça'] + summary.counts.pronto;
  const overdue = activeOrders.filter(order => order.forecast && new Date(order.forecast).getTime() < Date.now()).length;

  async function handleLogout() { try { await logout(); navigate('/login', { replace: true }); } catch { navigate('/login', { replace: true }); } }
  function goOrder(orderId: number | null) { if (orderId) navigate(`/ordens-de-servico/${orderId}`); else navigate('/ordens-de-servico'); }

  return <div className="orders-viewport dashboard-viewport">
    <MenuAdmin collapsed={collapsed} onUnavailable={() => {}} />
    <div className="orders-main dashboard-main">
      <CabecalhoAdmin title="Dashboard" subtitle="Visão geral da oficina" name={user?.nome ?? 'Administrador'} onLogout={handleLogout} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} />
      <main className="dashboard-content">
        <div className="dashboard-title-row"><div><h2>Visão geral da oficina</h2><p>Acompanhe sua operação. Priorize o que precisa de atenção.</p></div><button className="dashboard-refresh" onClick={() => refresh()} disabled={loading}><img src="/assets/services/reload-double.svg" width="16" height="16" alt=""/>{loading ? 'Atualizando' : 'Atualizar painel'}</button></div>
        {error && <div className="dashboard-error" role="alert"><span>{error}</span><button onClick={() => refresh()}>Tentar novamente</button></div>}

        {!loaded ? error ? <div className="dashboard-empty">O resumo não foi carregado. Use “Tentar novamente” acima.</div> : <div className="dashboard-skeleton" role="status" aria-label="Carregando dados da oficina"><div className="skeleton-kpis">{[1,2,3,4,5].map(n=><i key={n}/>)}</div><div className="skeleton-panels"><i/><i/></div><span>Carregando os dados da oficina…</span></div> : <>
        <section className="dashboard-kpis" aria-label="Resumo da oficina">
          <button className="dashboard-kpi" onClick={() => navigate('/ordens-de-servico?status=aguardando')}><span className="kpi-icon rose"><Icon name="clipboard" size={16}/></span><span className="kpi-label">Em aberto</span><strong>{summary.counts.aguardando}</strong><small>Precisam de atendimento</small></button>
          <button className="dashboard-kpi" onClick={() => navigate('/ordens-de-servico?status=em%20andamento')}><span className="kpi-icon amber"><Icon name="wrench" size={16}/></span><span className="kpi-label">Em andamento</span><strong>{summary.counts['em andamento']}</strong><small>Serviços em execução</small></button>
          <button className="dashboard-kpi" onClick={() => navigate('/ordens-de-servico?status=aguardando%20peça')}><span className="kpi-icon blue"><Icon name="package" size={16}/></span><span className="kpi-label">Aguardando peça</span><strong>{summary.counts['aguardando peça']}</strong><small>Dependem de reposição</small></button>
          <button className="dashboard-kpi" onClick={() => navigate('/ordens-de-servico?status=entregue')}><span className="kpi-icon green"><Icon name="check" size={16}/></span><span className="kpi-label">Concluídas</span><strong>{summary.counts.entregue}</strong><small>Total histórico de entregas</small></button>
          <button className="dashboard-kpi" onClick={() => navigate('/funcionarios')}><span className="kpi-icon violet"><Icon name="users" size={16}/></span><span className="kpi-label">Produtividade da equipe</span><strong>{hasProductivityData ? `${productivity}%` : '—'}</strong><small>{hasProductivityData ? 'Conclusão das OS atribuídas no mês' : 'Ainda sem atividade no mês'}</small></button>
        </section>

        <section className="dashboard-visuals">
          <article className="dashboard-panel volume-panel">
            <div className="panel-heading"><div className="panel-title-icon rose"><Icon name="activity" size={18}/></div><div><h3>Movimento da oficina</h3><p>{weeklySeries[0]?.tooltipLabel?.split(' – ')[0]} a {weeklySeries.at(-1)?.tooltipLabel?.split(' – ').at(-1)}</p></div><div className="dashboard-period"><SeletorFiltro label="Agrupamento do gráfico" value={chartPeriod} variant="toolbar" options={[{value:'diario',label:'Diário'},{value:'semanal',label:'Semanal'},{value:'mensal',label:'Mensal'},{value:'personalizado',label:'Personalizado'}]} onChange={value=>{if(value==='personalizado'){setPickerVersion(v=>v+1);setPickingRange(true);}else {setChartPeriod(value);setPickingRange(false);}}}/>{pickingRange && <SeletorPeriodo key={pickerVersion} autoOpen value={customRange} onApply={range=>{if(range){setCustomRange(range);setChartPeriod('personalizado');}setPickingRange(false);}}/>}</div></div>
            <div className="volume-summary"><strong>{chartTotal}</strong><span>ordens abertas no período</span><span className="volume-peak">{peakDay.count ? `Pico: ${peakDay.label} · ${peakDay.count} OS` : 'Sem novas ordens neste período'}</span></div>
            <GraficoOrdens data={weeklySeries}/>
          </article>
          <article className="dashboard-panel status-panel">
            <div className="panel-heading"><div className="panel-title-icon rose"><Icon name="gauge" size={15}/></div><div><h3>Status das OS</h3><p>Distribuição atual</p></div><button className="panel-link" onClick={() => navigate('/ordens-de-servico')}>Ver lista <Icon name="right" size={12}/></button></div>
            <div className="status-overview"><div className="status-donut" style={{ background: donutTotal ? donutGradient : 'conic-gradient(#e6ebf1 0 100%)' }}><div><strong>{donutTotal}</strong><small>ordens</small></div></div><div className="status-legend">{statusInfo.map(item => <div className="legend-row" key={item.key}><i style={{ background: item.color }}/><span>{item.label}</span><b>{summary.counts[item.key]}</b><small>{donutTotal ? Math.round(summary.counts[item.key] / donutTotal * 100) : 0}%</small></div>)}</div></div>
          </article>
        </section>

        <section className="dashboard-details">
          <article className="dashboard-panel oldest-panel">
            <div className="panel-heading"><div className="panel-title-icon blue"><Icon name="clock" size={15}/></div><div><h3>Ordens mais antigas</h3><p>Solicitações que estão há mais tempo na fila</p></div><button className="panel-link" onClick={() => navigate('/ordens-de-servico')}>Todas as OS <Icon name="right" size={12}/></button></div>
            <div className="oldest-table"><div className="oldest-head"><span>OS / CLIENTE</span><span>MOTOCICLETA</span><span>ABERTA EM</span><span>STATUS</span></div>
              {oldest.map(order => <button className="oldest-row" key={order.id} onClick={() => goOrder(order.id)}><span><b>#{order.id}</b><small>{order.client}</small></span><span><b>{order.motorcycle}</b><small>{order.plate || 'Placa não informada'}</small></span><span>{shortDate(order.entry)}</span><span><i className={`status-pill status-${order.status.replaceAll(' ', '-')}`}>{order.status === 'aguardando' ? 'Aberta' : order.status === 'em andamento' ? 'Em andamento' : order.status === 'aguardando peça' ? 'Aguard. peça' : order.status === 'entregue' ? 'Finalizada' : order.status === 'cancelada' ? 'Cancelada' : 'Pronta'}</i></span></button>)}
              {!oldest.length && <div className="dashboard-empty">{loading ? 'Carregando ordens…' : 'Ainda não há ordens para exibir.'}</div>}
            </div>
          </article>
          <article className="dashboard-panel alerts-panel">
            <div className="panel-heading"><div className="panel-title-icon amber"><Icon name="bell" size={15}/></div><div><h3>Alertas e pendências</h3><p>{unread ? `${unread} atualização${unread === 1 ? '' : 'ões'} não lida${unread === 1 ? '' : 's'}` : 'Acompanhe os pontos de atenção'}</p></div><button className="panel-link" onClick={() => navigate('/ordens-de-servico')}>Ver OS <Icon name="right" size={12}/></button></div>
            <div className="alert-list">
              {overdue > 0 && <button className="alert-item" onClick={() => navigate('/ordens-de-servico')}><span className="alert-icon amber"><Icon name="clock" size={14}/></span><span><b>Previsão ultrapassada</b><small>{overdue} OS ativa{overdue === 1 ? '' : 's'} com entrega vencida</small></span><strong>{overdue}</strong></button>}
              {alerts.map((alert, index) => <button className="alert-item" key={`${alert.orderId}-${alert.createdAt}-${index}`} onClick={() => goOrder(alert.orderId)}><span className="alert-icon rose"><Icon name="info" size={14}/></span><span><b>{alert.title}</b><small>{alert.body || shortDate(alert.createdAt)}</small></span><Icon name="right" size={13}/></button>)}
              {alertsState==='pending'&&<p className="dashboard-empty">Carregando avisos…</p>}{alertsState==='error'&&<p className="dashboard-empty">Não foi possível atualizar os avisos.</p>}{alertsState==='ok' && !overdue && !alerts.length && <div className="clear-alerts"><span className="clear-check"><Icon name="check" size={14}/></span><span><b>Tudo em dia</b><small>Nenhuma pendência importante no momento.</small></span></div>}
            </div>
          </article>

        </section>

        <section className="dashboard-panel team-panel">
          <div className="panel-heading"><div className="panel-title-icon rose"><Icon name="staff" size={17}/></div><div><h3>Técnicos mais ativos</h3><p>OS atribuídas com entrada no período · canceladas não contam{teamPeriod==='personalizado'&&teamRange?` · ${teamRange.from.split('-').reverse().join('/')} a ${teamRange.to.split('-').reverse().join('/')}`:''}</p></div><div className="dashboard-period"><SeletorFiltro label="Período dos técnicos" value={teamPeriod} variant="toolbar" options={[{value:'dia',label:'Hoje'},{value:'semana',label:'Últimos 7 dias'},{value:'mes',label:'Este mês'},{value:'personalizado',label:'Personalizado'}]} onChange={value=>{if(value==='personalizado'){setTeamPickerVersion(v=>v+1);setTeamPicker(true);}else{setTeamPeriod(value);setTeamPicker(false);}}}/>{teamPicker&&<SeletorPeriodo key={teamPickerVersion} autoOpen value={teamRange} onApply={range=>{if(range){setTeamRange(range);setTeamPeriod('personalizado');}setTeamPicker(false);}}/>}</div><button className="panel-link" onClick={() => navigate('/funcionarios')}>Ver equipe <Icon name="right" size={14}/></button></div>
          <div className="team-grid">{rankedTeam.map((person,index) => <button className="team-member" key={person.id} onClick={() => navigate(`/funcionarios/${person.id}`)}><span className="team-avatar">{String(index+1).padStart(2,'0')}</span><b>{person.nome}</b><small>{person.cargo}</small><span className="team-stats"><span><strong>{person.worked}</strong><small>OS no período</small></span><span><strong>{person.completed}</strong><small>Já finalizadas</small></span></span></button>)}{!rankedTeam.length && <div className="dashboard-empty">{loading ? 'Carregando equipe…' : 'Nenhum técnico com OS atribuída neste período.'}</div>}</div>
        </section>
        </>}
        <footer className="dashboard-footer"><span><i/> {loaded ? 'Dados carregados' : 'Aguardando dados'}</span><span>{loading ? 'Sincronizando…' : 'Operação da oficina'}</span><button onClick={() => refresh()} disabled={loading}><img src="/assets/services/reload-single.svg" width="14" height="14" alt=""/> Atualizar</button></footer>
      </main>
    </div>
  </div>;
}
