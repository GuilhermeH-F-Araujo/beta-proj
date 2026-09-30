import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './MenuAdmin';
import { buscarFotoDiretorioCliente, type DadosPerfilCliente, type StatusOrdem } from '../services/apiAutenticacao';
import ModalEditarCliente from './ModalEditarCliente';
import { useMiniaturaMotocicleta } from '../services/miniaturasMotocicletas';
import './perfil-cliente.css';

const statusNames: Record<StatusOrdem, string> = {
  aguardando: 'Aberta', 'em andamento': 'Em andamento', 'aguardando peça': 'Aguardando peça',
  pronto: 'Pronta', entregue: 'Finalizada', cancelada: 'Cancelada',
};
const currency = (number: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number);
function shortDate(value: string | null) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '—';
}
function cpfMasked(value: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 11 ? `***.***.${digits.slice(6, 9)}-${digits.slice(9)}` : 'Não informado';
}
function whatsapp(phone: string, name: string) {
  const digits = phone.replace(/\D/g, '');
  const first = name.trim().split(/\s+/)[0] || 'cliente';
  const greeting = `Olá, ${first}! Tudo bem? Aqui é da Estação Motos. Entramos em contato sobre o seu atendimento.`;
  return `https://wa.me/${digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`}?text=${encodeURIComponent(greeting)}`;
}
function emailLink(email: string, name: string) {
  const first = name.trim().split(/\s+/)[0] || 'cliente';
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Contato da Estação Motos')}&body=${encodeURIComponent(`Olá, ${first}! Tudo bem?\n\nAqui é da Estação Motos. Entramos em contato sobre o seu atendimento.\n\nAtenciosamente,\nEquipe Estação Motos`)}`;
}
function BikePreview({ model, color, orderId }: { model: string; color: string | null; orderId?: number }) {
  const thumb = useMiniaturaMotocicleta(orderId ?? Number.NaN, model, color);
  const [failed, setFailed] = useState('');
  return <span className="cp-bike-preview">{thumb.url && thumb.url !== failed ? <img src={thumb.url} alt={`Miniatura de ${model}`} onError={() => setFailed(thumb.url!)}/> : <Icon name="bike" size={26}/>}</span>;
}

export default function PerfilCliente({ profile, onUpdated, onToast }: { profile: DadosPerfilCliente; onUpdated: () => Promise<void>; onToast: (message: string) => void }) {
  const navigate = useNavigate();
  const [showAllBikes, setShowAllBikes] = useState(false);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const completed = profile.orders.find(order => order.status === 'entregue');
  const nextService = completed ? new Date(`${(completed.data_saida ?? completed.data_entrada).slice(0, 10)}T12:00:00Z`) : null;
  if (nextService) nextService.setUTCDate(nextService.getUTCDate() + 90);
  const daysUntil = nextService ? Math.ceil((nextService.getTime() - Date.now()) / 86400000) : null;
  function createReminder() {
    if (!nextService) return;
    const when = new Date(Math.max(nextService.getTime(), Date.now() + 86400000));
    const finish = new Date(when); finish.setUTCDate(finish.getUTCDate() + 1);
    const day = (date: Date) => date.toISOString().slice(0, 10).replaceAll('-', '');
    const safe = (value: string) => value.replaceAll('\\', '\\\\').replaceAll(',', '\\,').replaceAll(';', '\\;').replaceAll('\n', ' ');
    const content = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Estacao Motos//Lembrete//PT',
      'BEGIN:VEVENT',`UID:retorno-cliente-${profile.id}-${day(when)}@estacao-motos`,
      `DTSTAMP:${new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z')}`,
      `DTSTART;VALUE=DATE:${day(when)}`,`DTEND;VALUE=DATE:${day(finish)}`,
      `SUMMARY:${safe(`Retorno sugerido — ${profile.name}`)}`,`DESCRIPTION:${safe(`Verificar novo atendimento para ${profile.name}.`)}`,
      'END:VEVENT','END:VCALENDAR',''].join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `retorno-cliente-${profile.id}.ics`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast('Lembrete de calendário baixado. Abra o arquivo para adicioná-lo à sua agenda.');
  }

  return <div className="cp-layout">
    <section className="cp-hero">
      <div className="cp-avatar">{profile.hasPhoto ? <ProfilePhoto key={profile.photoRevision} profile={profile}/> : <span>{profile.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span>}</div>
      <div className="cp-identity"><div className="cp-title"><h1>{profile.name}</h1>{profile.summary.firstAttendance && <span>Atendido desde {profile.summary.firstAttendance.slice(0, 4)}</span>}</div>
        {profile.phone && <a className="cp-whatsapp-preference" href={whatsapp(profile.phone, profile.name)} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={12}/>Contato pelo WhatsApp</a>}
        <div className="cp-contact">{profile.phone ? <a href={whatsapp(profile.phone, profile.name)} target="_blank" rel="noreferrer" title="Abrir conversa no WhatsApp"><Icon name="phone" size={12}/>{profile.phone}</a> : <span><Icon name="phone" size={12}/>Telefone não informado</span>}{profile.email ? <a href={emailLink(profile.email, profile.name)} title="Escrever email para o cliente"><Icon name="mail" size={12}/>{profile.email}</a> : <span><Icon name="mail" size={12}/>E-mail não informado</span>}</div>
      </div>
      <div className="cp-hero-actions">{profile.phone && <a href={whatsapp(profile.phone, profile.name)} target="_blank" rel="noreferrer" className="cp-outline cp-whatsapp"><Icon name="whatsapp" size={13}/>WhatsApp</a>}
        <button className="cp-outline" onClick={() => setEditOpen(true)}><Icon name="pencil" size={13}/>Editar cliente</button>
        <button className="cp-new-order" disabled title="O cadastro de novas OS ainda não está disponível no painel"><Icon name="plus" size={13}/>Nova OS</button>
      </div>
    </section>
    <div className="cp-columns">
      <div className="cp-column cp-left">
        <section className="cp-panel cp-bikes"><header><h2>Motocicletas</h2>{profile.motorcycles.length > 2 && <button onClick={() => setShowAllBikes(value => !value)}>{showAllBikes ? 'Ver menos' : 'Ver todas'}</button>}</header>
          {profile.motorcycles.length ? (showAllBikes ? profile.motorcycles : profile.motorcycles.slice(0, 2)).map(bike => {
            const order = profile.orders.find(item => item.id_moto === bike.id_moto);
            return <div className="cp-bike-row" key={bike.id_moto}><BikePreview model={bike.modelo} color={bike.cor} orderId={order?.id_os}/><div className="cp-bike-name"><strong>{bike.modelo}</strong><small>{bike.placa || 'Placa não informada'}</small></div><span className="cp-bike-km">{bike.quilometragem == null ? 'KM não informado' : `${new Intl.NumberFormat('pt-BR').format(bike.quilometragem)} km`}</span></div>;
          }) : <p className="cp-empty">Nenhuma motocicleta cadastrada.</p>}
        </section>
        <section className="cp-panel cp-history"><header><h2>Histórico de serviços</h2>{profile.orders.length > 3 && <button onClick={() => setShowAllOrders(value => !value)}>{showAllOrders ? 'Ver menos' : 'Ver histórico completo'}</button>}</header>
          {profile.orders.length ? (showAllOrders ? profile.orders : profile.orders.slice(0, 3)).map(order => {
            const bike = profile.motorcycles.find(item => item.id_moto === order.id_moto);
            return <button className="cp-history-row" key={order.id_os} onClick={() => navigate(`/ordens-de-servico/${order.id_os}`)}>
              <span className={`cp-history-dot ${order.status === 'entregue' ? 'done' : order.status === 'cancelada' ? 'cancelled' : 'open'}`}><Icon name={order.status === 'entregue' ? 'check' : order.status === 'cancelada' ? 'close' : 'wrench'} size={14}/></span>
              <span className="cp-history-info"><span><strong>OS #{order.id_os}</strong><em className={`cp-status cp-status-${order.status.replaceAll(' ', '-')}`}>{statusNames[order.status]}</em></span><small>{order.problema_relatado || 'Atendimento registrado'}</small></span>
              <span className="cp-history-date"><Icon name="calendar" size={12}/>{shortDate(order.data_entrada)}</span>
              <span className="cp-history-bike"><Icon name="bike" size={13}/><span>{bike?.modelo || 'Motocicleta'}<small>{bike?.placa || 'Sem placa'}</small></span></span>
              <span className="cp-history-amount">{order.total == null ? '—' : currency(order.total)}</span>
            </button>;
          }) : <p className="cp-empty">Nenhum atendimento registrado.</p>}
        </section>
      </div>
      <div className="cp-column cp-right">
        <section className="cp-panel cp-summary"><h2>Resumo do relacionamento</h2><div className="cp-summary-stats"><div><span className="cp-summary-icon blue"><Icon name="bike" size={19}/></span><b>{profile.summary.motorcycleCount}</b><small>motocicletas</small></div><div><span className="cp-summary-icon amber"><Icon name="wrench" size={18}/></span><b>{profile.summary.orderCount}</b><small>atendimentos</small></div><div><span className="cp-summary-icon green"><Icon name="dollar" size={18}/></span><b>{currency(profile.summary.recordedTotal)}</b><small>em serviços</small></div></div></section>
        <section className="cp-panel cp-data"><h2>Dados do cliente</h2><dl><div><dt><Icon name="card" size={13}/>CPF</dt><dd>{cpfMasked(profile.cpf)}</dd></div><div><dt><Icon name="pin" size={13}/>Endereço</dt><dd title={[profile.address,profile.addressNumber,profile.district,profile.city,profile.state].filter(Boolean).join(', ')}>{[profile.address,profile.addressNumber].filter(Boolean).join(', ')}{profile.city ? ` — ${profile.city}${profile.state ? `/${profile.state}` : ''}` : !profile.address ? 'Não informado' : ''}</dd></div><div><dt><Icon name="whatsapp" size={13}/>Canal de contato</dt><dd>{profile.phone ? 'WhatsApp' : profile.email ? 'E-mail' : 'Não informado'}</dd></div><div><dt><Icon name="calendar" size={13}/>Último atendimento</dt><dd>{shortDate(profile.summary.lastAttendance)}</dd></div></dl></section>
        <section className="cp-panel cp-next"><h2>Próxima ação</h2><div className="cp-next-body"><span className="cp-next-icon"><Icon name="clock" size={18}/></span><p><strong>{daysUntil === null ? 'Sem retorno sugerido' : daysUntil > 0 ? `Retorno sugerido em ${daysUntil} dias` : 'Retorno sugerido'}</strong><small>{nextService ? `Após o serviço de ${shortDate(completed?.data_saida ?? completed?.data_entrada ?? null)}. Agende conforme a necessidade do cliente.` : 'O primeiro serviço concluído permitirá sugerir um retorno.'}</small></p><button onClick={createReminder} disabled={!nextService}><Icon name="calendar" size={13}/>Criar lembrete</button></div></section>
      </div>
    </div>
    {editOpen && <ModalEditarCliente client={profile} onClose={() => setEditOpen(false)} onSaved={async () => { await onUpdated(); onToast('Dados do cliente atualizados.'); }}/>}
  </div>;
}

function ProfilePhoto({ profile }: { profile: DadosPerfilCliente }) {
  const [url, setUrl] = useState(profile.photoUrl ?? '');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (profile.photoUrl) { setUrl(profile.photoUrl); return; }
    let active = true; let objectUrl = '';
    buscarFotoDiretorioCliente(profile.id).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [profile.id, profile.photoUrl]);
  return !failed && url ? <img src={url} alt={`Foto de ${profile.name}`} onError={() => { setFailed(true); setUrl(''); }}/>
    : <span>{profile.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span>;
}
