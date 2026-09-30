import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CabecalhoAdmin from '../components/CabecalhoAdmin';
import { rotulosStatusOrdem } from '../services/statusOrdem';
import MenuAdmin, { Icon } from '../components/MenuAdmin';
import ModalAcoesOrdem from '../components/ModalAcoesOrdem';
import ModalPreviaModelo from '../components/ModalPreviaModelo';
import { ErroRequisicaoApi, buscarFotoCliente, buscarUsuarioAtual, buscarDetalhesOrdem, buscarHistoricoObservacoes, logout, type RegistroHistoricoObservacao, type DetalhesOrdem as Details } from '../services/apiAutenticacao';
import { useMiniaturaMotocicleta } from '../services/miniaturasMotocicletas';
import './ordens-servico.css';
import './detalhes-ordem.css';

const money = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const date = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '—';
const stages = [
  { title: 'Em aberto', icon: 'clipboard' }, { title: 'Aguardando peça', icon: 'package' },
  { title: 'Em andamento', icon: 'wrench' }, { title: 'Pronta', icon: 'check' },
  { title: 'Finalizada', icon: 'check' },
  { title: 'Cancelada', icon: 'close' },
];


export default function DetalhesOrdem() {
  const navigate = useNavigate();
  const { id } = useParams();
  const orderId = Number(id);
  const [collapsed, setCollapsed] = useState(false);
  const [name, setName] = useState('Administrador');
  const [data, setData] = useState<Details | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [observationHistory, setObservationHistory] = useState<RegistroHistoricoObservacao[]>([]);
  const [correctingImage, setCorrectingImage] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);
  const [failedBikeImage, setFailedBikeImage] = useState('');
  const [clientPhotoUrl,setClientPhotoUrl]=useState('');
  const bikeThumbnail = useMiniaturaMotocicleta(orderId, data?.motorcycle.model, data?.motorcycle.color, imageRevision);
  const bikeImage = bikeThumbnail.url !== failedBikeImage ? bikeThumbnail.url : null;
  const clientInitials = (data?.client.name ?? 'Cliente').trim().split(/\s+/).slice(0,2).map(word=>word.charAt(0)).join('').toUpperCase();

  useEffect(()=>{
    if(!data?.client.photo){setClientPhotoUrl('');return;}
    if(/^https:\/\//i.test(data.client.photo)){setClientPhotoUrl(data.client.photo);return;}
    let active=true;let url='';
    void buscarFotoCliente(orderId).then(blob=>{
      url=URL.createObjectURL(blob);
      if(active)setClientPhotoUrl(url);else URL.revokeObjectURL(url);
    }).catch(()=>{if(active)setClientPhotoUrl('');});
    return ()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[data?.client.photo,orderId]);

  useEffect(() => {
    if (!Number.isSafeInteger(orderId) || orderId < 1) { setError('Número da OS inválido.'); return; }
    let active = true;
    Promise.all([buscarUsuarioAtual(), buscarDetalhesOrdem(orderId)]).then(([identity, details]) => {
      if (active) { setName(identity.user.nome); setData(details); setError(''); }
    }).catch(err => {
      if (!active) return;
      if (err instanceof ErroRequisicaoApi && (err.status === 401 || err.status === 403)) navigate('/login', { replace: true });
      else setError(err instanceof Error ? err.message : 'Não foi possível carregar a OS.');
    });
    return () => { active = false; };
  }, [orderId, navigate]);
  async function handleLogout() {
    try { await logout(); navigate('/login', { replace: true }); }
    catch { setToast('Não foi possível sair agora.'); }
  }
  async function openObservationHistory() {
    setHistoryOpen(true); setHistoryLoading(true); setHistoryError('');
    try { setObservationHistory((await buscarHistoricoObservacoes(orderId)).entries); }
    catch(err) { setHistoryError(err instanceof Error ? err.message : 'Falha ao carregar histórico.'); }
    finally { setHistoryLoading(false); }
  }
  function refreshDetails() {
    void buscarDetalhesOrdem(orderId).then(details => { setData(details); setError(''); }).catch(err => setToast(err instanceof Error ? err.message : 'Não foi possível atualizar a OS.'));
  }
  const stageIndex = data?.status === 'aguardando' ? 0 : data?.status === 'aguardando peça' ? 1 : data?.status === 'em andamento' ? 2 : data?.status === 'pronto' ? 3 : data?.status === 'entregue' ? 4 : 5;
  const amount = data ? data.total ?? data.serviceTotal + data.partsTotal : 0;
  const events = data ? [
    ...data.movements.map(item => ({
      title:item.action === 'edit' ? 'Informações corrigidas' : item.after === 'cancelada' ? 'OS cancelada' : `Status alterado para ${rotulosStatusOrdem[item.after!] ?? item.after}`,
      body:item.action === 'edit' ? `Dados corrigidos por ${item.actor}` : `${rotulosStatusOrdem[item.before!] ?? item.before} → ${rotulosStatusOrdem[item.after!] ?? item.after} · ${item.actor}`,
      at:item.at, color:item.after === 'cancelada' ? 'red' : item.action === 'edit' ? 'orange' : 'green',
    })),
    { title:'OS criada', body:'Ordem de serviço registrada', at:data.entry, color:'blue' },
  ].filter(item => item.at) : [];

  return <div className="orders-viewport details-viewport">
    <MenuAdmin collapsed={collapsed} onUnavailable={label => setToast(`${label} ainda não possui uma página neste projeto.`)} />
    <div className="orders-main">
      <CabecalhoAdmin title="Detalhes da OS" collapsed={collapsed} onToggle={()=>setCollapsed(value=>!value)} name={name} onLogout={handleLogout}/>
      <main className="details-scroll">
        {error ? <div className="details-error"><p>{error}</p><button onClick={() => navigate('/ordens-de-servico')}>Voltar à lista</button></div> : !data ? <div className="details-loading">Carregando detalhes da OS...</div> : <div className="details-body">
          <button type="button" className="detail-return" onClick={() => navigate('/ordens-de-servico')}><Icon name="left" size={14}/> Voltar às ordens</button><div className="details-title-row"><div><h1>Detalhes da Ordem de Serviço</h1><span className="details-number">OS #{data.id}</span></div><div className="details-title-actions"><button className="white-btn" onClick={() => navigate(`/ordens-de-servico/${data.id}/historico`)}><Icon name="clock" size={14}/> Histórico</button><button className="red-btn" onClick={() => setEditing(true)}><Icon name="pencil" size={14}/> Editar</button></div></div>
          <section className="details-summary" aria-label="Resumo da ordem">
            <div><span className={`summary-dot status-${data.status.replaceAll(' ', '-')}`}/><span><small>STATUS ATUAL</small><b>{rotulosStatusOrdem[data.status]}</b></span></div>
            <div><Icon name="calendar" size={18}/><span><small>DATA DE ABERTURA</small><b>{date(data.entry)}</b></span></div>
            <div><Icon name="calendar" size={18}/><span><small>PREVISÃO DE ENTREGA</small><b>{date(data.forecast)}</b></span></div>
            <div><Icon name="clock" size={18}/><span><small>ÚLTIMA ATUALIZAÇÃO</small><b>{date(data.lastUpdated)}</b></span></div>
            <div><span className="mechanic-avatar">{data.mechanic.charAt(0)}</span><span><small>RESPONSÁVEL TÉCNICO</small><b>{data.mechanic}</b></span></div>
          </section>
          <section className="details-panel details-progress"><h2><Icon name="activity" size={14}/> Andamento da Ordem</h2><div className={`progress-track progress-${data.status.replaceAll(' ', '-')}`}>
            {stages.map((stage, index) => <div className={`progress-stage${(data.status === 'cancelada' ? index === 0 || index === 5 : index <= stageIndex && index !== 5) ? ' reached' : ''}${index === stageIndex ? ' current' : ''}`} key={stage.title}><div className="progress-circle"><Icon name={stage.icon} size={18}/></div><b>{stage.title}</b><small>{index === 0 ? date(data.entry) : (index === 4 || index === 5) && data.exit ? date(data.exit) : '—'}</small></div>)}
          </div>{data.status==='cancelada'&&<div className="progress-cancellation-reason" role="note"><Icon name="info" size={14}/><span><b>Motivo do cancelamento</b>{data.cancellationReason||'Motivo não registrado nesta OS antiga.'}</span></div>}</section>
          <div className="details-grid-three">
            <section className="details-panel"><h2><span className="details-section-icon icon-user" aria-hidden="true"/> Cliente</h2><div className="details-client"><div className="details-client-avatar">{clientPhotoUrl ? <img src={clientPhotoUrl} alt={`Foto de ${data.client.name}`} onError={() => setClientPhotoUrl('')}/> : <span aria-label="Foto não cadastrada">{clientInitials}</span>}</div><div><strong className="details-main-text">{data.client.name}</strong><p><Icon name="phone" size={14}/>{data.client.phone || 'Telefone não informado'}</p><p><Icon name="mail" size={14}/>{data.client.email || 'E-mail não informado'}</p><p><Icon name="pin" size={14}/>Endereço não informado</p></div></div></section>
            <section className="details-panel"><h2><Icon name="bike" size={14}/> Motocicleta</h2><div className="details-bike"><div className="bike-image">{bikeImage ? <img src={bikeImage} alt={`Miniatura ilustrativa de ${data.motorcycle.model} na cor ${data.motorcycle.color || 'padrão'}`} onError={() => setFailedBikeImage(bikeImage)}/>: <Icon name="bike" size={35}/>}</div><div><strong className="details-main-text">{data.motorcycle.model}</strong><p>Placa: {data.motorcycle.plate || '—'}</p><p>Ano: {data.motorcycle.year || '—'}</p><p>Cor: {data.motorcycle.color || '—'}</p><p>KM de entrada: {data.motorcycle.kmEntry ?? '—'}</p></div></div>{(bikeThumbnail.origin === 'catalog' || bikeThumbnail.origin === 'generated') && <small className="model-credit">Miniatura ilustrativa · cor {data.motorcycle.color || 'padrão'}</small>}{bikeThumbnail.loading && !bikeThumbnail.error && <small className="model-credit">Preparando miniatura…</small>}{bikeThumbnail.error && <small className="model-credit error" role="status">{bikeThumbnail.error}</small>}<button className="model-correction-link" onClick={() => setCorrectingImage(true)}><Icon name="pencil" size={12}/> Corrigir miniatura</button></section>
            <section className="details-panel finance-panel"><h2><span className="details-section-icon icon-dollar" aria-hidden="true"/> Resumo Financeiro</h2><p><span>Total dos Serviços</span><b>{money(data.serviceTotal)}</b></p><p><span>Total das Peças</span><b>{money(data.partsTotal)}</b></p><div className="finance-total"><b>Valor Final</b><strong>{money(amount)}</strong></div><small>Pagamento: {data.paymentStatus === 'pago' ? 'Pago' : 'Pendente'}</small></section>
          </div>
          <div className="details-grid-two">
            <section className="details-panel details-table"><h2><span className="details-section-icon icon-wrench" aria-hidden="true"/> Serviços Registrados</h2><table><thead><tr><th>SERVIÇO</th><th>DESCRIÇÃO</th><th>VALOR</th></tr></thead><tbody>{data.services.map((service, i) => <tr key={i}><td>{service.description}</td><td>{service.description}</td><td>{money(service.price)}</td></tr>)}{!data.services.length && <tr><td colSpan={3}>Nenhum serviço registrado.</td></tr>}</tbody><tfoot><tr><td colSpan={2}>Total dos Serviços</td><td>{money(data.serviceTotal)}</td></tr></tfoot></table></section>
            <section className="details-panel details-table"><h2><Icon name="package" size={14}/> Peças Utilizadas</h2><table><thead><tr><th>PEÇA</th><th>QUANTIDADE</th><th>VALOR</th></tr></thead><tbody>{data.parts.map((part, i) => <tr key={i}><td>{part.name}</td><td>{part.quantity}</td><td>{money(part.quantity * part.unitPrice)}</td></tr>)}{!data.parts.length && <tr><td colSpan={3}>Nenhuma peça registrada.</td></tr>}</tbody><tfoot><tr><td colSpan={2}>Total das Peças</td><td>{money(data.partsTotal)}</td></tr></tfoot></table></section>
          </div>
          <div className="details-grid-two">
            <section className="details-panel"><h2><span className="details-section-icon icon-camera" aria-hidden="true"/> Fotos da Entrada</h2>{data.photos.length ? <div className="entry-photos">{data.photos.map((photo, i) => <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir foto ${i + 1} da OS #${data.id}`}><img src={photo.url} alt={`Foto de entrada ${i + 1} da OS #${data.id}`} loading="lazy"/></a>)}</div> : <p className="details-empty">Nenhuma foto de entrada cadastrada nesta OS.</p>}</section>
            <section className="details-panel"><h2><span className="details-section-icon icon-clock" aria-hidden="true"/> Últimas Movimentações</h2><div className="details-activity">{events.map((item, i) => <div key={i}><i className={item.color}/><span><b>{item.title}</b><small>{item.body}</small></span><time>{date(item.at)}</time></div>)}</div></section>
          </div>
          <section className="details-panel observations"><div className="observations-heading"><h2><span className="details-section-icon icon-file" aria-hidden="true"/> Observação atual</h2><button type="button" onClick={() => void openObservationHistory()}><Icon name="clock" size={13}/> Ver histórico de observações</button></div><p>{data.observations || 'Nenhuma observação atual cadastrada.'}</p></section>
        </div>}
      </main>
    </div>
    {historyOpen && <div className="observation-history-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
      <section className="observation-history-dialog" role="dialog" aria-modal="true" aria-labelledby="observation-history-title">
        <header><div><small>REGISTROS ANTERIORES</small><h2 id="observation-history-title">Histórico de observações</h2></div><button aria-label="Fechar histórico" onClick={() => setHistoryOpen(false)}>✕</button></header>
        <p className="observation-history-warning">Estes registros são históricos e não representam a observação atual da OS.</p>
        {historyLoading ? <p>Carregando histórico…</p> : historyError ? <div className="observation-history-error" role="alert"><p>{historyError}</p><button type="button" className="observation-history-retry" onClick={() => void openObservationHistory()}><Icon name="clock" size={14}/> Tentar novamente</button></div> : observationHistory.length ? <ol>{observationHistory.map(entry => <li key={entry.id}><div><b>{entry.kind === 'status_note' ? 'Nota da mudança de status' : 'Observação anterior'}</b><time>{date(entry.at)}</time></div>{entry.context && <small>{entry.context}</small>}<p>{entry.body}</p><small>Registrado por {entry.actor} · Histórico, não atual</small></li>)}</ol> : <p>Nenhuma observação anterior registrada.</p>}
      </section>
    </div>}
    {toast && <div className="orders-toast" role="status" onClick={() => setToast('')}>{toast}</div>}
    {editing && <ModalAcoesOrdem orderId={orderId} initialTab="edit" onClose={() => setEditing(false)} onChanged={refreshDetails} onDeleted={() => navigate('/ordens-de-servico')}/>}
    {correctingImage && data && <ModalPreviaModelo orderId={orderId} currentModel={data.motorcycle.model} onClose={() => setCorrectingImage(false)} onChanged={() => { refreshDetails(); setFailedBikeImage(''); setImageRevision(value => value + 1); setToast('Miniatura aprovada e salva para este modelo.'); }}/>} 
  </div>;
}
