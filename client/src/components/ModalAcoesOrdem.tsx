import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './MenuAdmin';
import { excluirOrdem, buscarDetalhesAcaoOrdem, salvarDetalhesAcaoOrdem, definirStatusOrdem, type DetalhesAcaoOrdem, type StatusOrdem } from '../services/apiAutenticacao';
import './modal-acoes-ordem.css';

type Tab = 'status' | 'edit' | 'cancel';
type Confirmation = 'status' | 'edit' | 'cancel' | 'delete' | null;
const statuses: { value: StatusOrdem; label: string; caption: string }[] = [
  { value: 'aguardando', label: 'Aberta', caption: 'Ordem registrada e aguardando início' },
  { value: 'em andamento', label: 'Em andamento', caption: 'Serviço em execução' },
  { value: 'aguardando peça', label: 'Aguardando peça', caption: 'Aguardando chegada de peça necessária' },
  { value: 'pronto', label: 'Pronta', caption: 'Serviço pronto para entrega' },
  { value: 'entregue', label: 'Finalizada', caption: 'Serviço concluído' },
  { value: 'cancelada', label: 'Cancelada', caption: 'Ordem encerrada sem execução' },
];
const statusLabel = (status: StatusOrdem) => statuses.find(item => item.value === status)?.label ?? status;
function formatCpf(value:string) {
  const digits=value.replace(/\D/g,'').slice(0,11);
  return digits.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/,'$1.$2.$3-$4');
}

export default function ModalAcoesOrdem({ orderId, initialTab, onClose, onChanged, onDeleted }: {
  orderId: number; initialTab: Tab | 'delete'; onClose: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab === 'delete' ? 'cancel' : initialTab);
  const [record, setRecord] = useState<DetalhesAcaoOrdem | null>(null);
  const [edit, setEdit] = useState({ client: { name:'', phone:'', email:'', cpf:'' }, motorcycle: { model:'', plate:'', year:null as number | null, color:'' }, problem:'', observations:'' });
  const [nextStatus, setNextStatus] = useState<StatusOrdem | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation>(initialTab === 'delete' ? 'delete' : null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    buscarDetalhesAcaoOrdem(orderId).then(details => {
      if (!active) return;
      setRecord(details); setNextStatus(details.status);
      setEdit({ client: { name:details.client.name, phone:details.client.phone ?? '', email:details.client.email ?? '', cpf:formatCpf(details.client.cpf ?? '') },
        motorcycle: { model:details.motorcycle.model, plate:details.motorcycle.plate, year:details.motorcycle.year, color:details.motorcycle.color ?? '' },
        problem:details.problem ?? '', observations:details.observations ?? '' });
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar a OS.'); });
    return () => { active = false; };
  }, [orderId]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      if (success) onClose(); else if (confirmation) setConfirmation(null); else onClose();
    };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, [busy, confirmation, success, onClose]);

  function ask() {
    setError('');
    if (tab === 'status') {
      if (!nextStatus || nextStatus === record?.status) return setError('Escolha um novo status antes de salvar.');
      if (nextStatus === 'cancelada' && !statusNote.trim()) return setError('Informe o motivo do cancelamento.');
      setConfirmation('status');
    } else if (tab === 'edit') {
      if (edit.client.name.trim().length < 2 || edit.motorcycle.model.trim().length < 2 || !/^[A-Za-z0-9-]{5,10}$/.test(edit.motorcycle.plate.trim())) {
        return setError('Preencha o nome, modelo e uma placa válida antes de salvar.');
      }
      if (edit.client.cpf.trim() && edit.client.cpf.replace(/\D/g, '').length !== 11) return setError('O CPF precisa ter 11 dígitos.');
      setConfirmation('edit');
    } else if (record?.status === 'cancelada') setError('Esta OS já está cancelada.');
    else if (!cancelReason.trim()) setError('Informe o motivo do cancelamento.');
    else setConfirmation('cancel');
  }
  async function perform() {
    if (!confirmation || busy) return;
    setBusy(true); setError('');
    try {
      if (confirmation === 'delete') {
        await excluirOrdem(orderId, cancelReason); onDeleted(); setSuccess('Ordem excluída com sucesso.');
      } else if (confirmation === 'edit') {
        await salvarDetalhesAcaoOrdem(orderId, edit); onChanged(); setSuccess('Informações salvas com sucesso.');
      } else {
        const target = confirmation === 'cancel' ? 'cancelada' : nextStatus!;
        await definirStatusOrdem(orderId, target, confirmation === 'cancel' ? cancelReason.trim() : statusNote.trim()); onChanged(); setSuccess(target === 'cancelada' ? 'OS cancelada com sucesso.' : 'Status alterado com sucesso.');
      }
      setConfirmation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
    } finally { setBusy(false); }
  }
  const showMain = initialTab !== 'delete' && !success;
  const selectedStatus = nextStatus ?? record?.status ?? 'aguardando';
  return createPortal(<>
    {showMain && <div className="oa-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="oa-shell" role="dialog" aria-modal="true" aria-label={`Ações da OS #${orderId}`}>
        <header className="oa-header"><div className="oa-brand"><img src="/assets/estacao-motos-logo.png" alt="Estação Motos"/><strong>Estação Motos</strong></div><div><span>Painel administrativo</span><button className="oa-icon-button" aria-label="Fechar" onClick={onClose}><Icon name="close" size={15}/></button></div></header>
        <div className="oa-headline"><h2>Ações da OS</h2><p>Gerencie esta ordem de serviço com segurança, agilidade e rastreabilidade.</p></div>
        {record ? <><div className="oa-summary"><div><span className="oa-summary-icon red"><Icon name="clipboard" size={17}/></span><span><b>OS #{record.id}</b><small>Número da ordem</small></span></div><div><span className="oa-summary-icon"><Icon name="users" size={17}/></span><span><b>{record.client.name}</b><small>Cliente</small></span></div><div><span className="oa-summary-icon"><Icon name="bike" size={18}/></span><span><b>{record.motorcycle.model}</b><small>Motocicleta</small></span></div></div>
          <nav className="oa-tabs" aria-label="Ações da OS"><button className={tab === 'status' ? 'active' : ''} onClick={() => { setTab('status'); setError(''); }}><Icon name="clock" size={14}/> Alterar status</button><button className={tab === 'edit' ? 'active' : ''} onClick={() => { setTab('edit'); setError(''); }}><Icon name="pencil" size={14}/> Corrigir informações</button><button className={tab === 'cancel' ? 'active' : ''} onClick={() => { setTab('cancel'); setError(''); }}><Icon name="clipboard" size={14}/> Cancelar OS</button></nav>
          <div className="oa-content">{tab === 'status' ? <><div className="oa-status-current"><div><label>Status atual</label><div className={`oa-state state-${record.status.replaceAll(' ', '-')}`}><i/>{statusLabel(record.status)}</div></div><span className="oa-arrow"><Icon name="right" size={14}/></span><div><label>Novo status</label><div className={`oa-state state-${selectedStatus.replaceAll(' ', '-')}`}><i/>{statusLabel(selectedStatus)}</div></div></div><label className="oa-field-title">Novo status da OS</label><div className="oa-status-grid">{statuses.map(option => <button type="button" className={`oa-choice choice-${option.value.replaceAll(' ', '-')}${selectedStatus === option.value ? ' selected' : ''}`} key={option.value} onClick={() => setNextStatus(option.value)}><span><i/><b>{option.label}<small>{option.caption}</small></b></span><span className="oa-radio">{selectedStatus === option.value && <Icon name="check" size={13}/>}</span></button>)}</div><div className="oa-status-bottom"><label className="oa-field">{selectedStatus === 'cancelada' ? 'Motivo do cancelamento' : 'Nota da mudança de status'} <small>{selectedStatus === 'cancelada' ? '(obrigatório)' : '(histórico, opcional)'}</small><textarea maxLength={500} placeholder={selectedStatus === 'cancelada' ? 'Descreva o motivo do cancelamento...' : 'Esta nota aparecerá apenas no histórico de observações...'} value={statusNote} onChange={e => setStatusNote(e.target.value)}/><em>{statusNote.length}/500</em></label><div className="oa-audit"><Icon name="check" size={16}/><span><b>Segurança e auditoria</b><small>Todas as ações realizadas pelo administrador são registradas no log administrativo com data e usuário.</small><small>Apenas administradores podem realizar esta ação.</small></span></div></div></> : tab === 'edit' ? <div className="oa-edit"><h3><Icon name="users" size={14}/> Dados do cliente</h3><div className="oa-form-grid"><label>Nome do cliente<input maxLength={100} value={edit.client.name} onChange={e => setEdit(old => ({ ...old, client:{...old.client,name:e.target.value} }))}/></label><label>Telefone<input maxLength={20} value={edit.client.phone} onChange={e => setEdit(old => ({ ...old, client:{...old.client,phone:e.target.value} }))}/></label><label>E-mail<input type="email" maxLength={150} value={edit.client.email} onChange={e => setEdit(old => ({ ...old, client:{...old.client,email:e.target.value} }))}/></label><label>CPF<input inputMode="numeric" maxLength={20} placeholder="Não cadastrado" value={edit.client.cpf} onChange={e => setEdit(old => ({ ...old, client:{...old.client,cpf:formatCpf(e.target.value)} }))}/></label></div><h3><Icon name="bike" size={14}/> Dados da motocicleta</h3><div className="oa-form-grid"><label>Marca / Modelo<input maxLength={100} value={edit.motorcycle.model} onChange={e => setEdit(old => ({ ...old, motorcycle:{...old.motorcycle,model:e.target.value} }))}/></label><label>Placa<input maxLength={10} value={edit.motorcycle.plate} onChange={e => setEdit(old => ({ ...old, motorcycle:{...old.motorcycle,plate:e.target.value.toUpperCase()} }))}/></label><label>Ano<input type="number" min="1900" max="2100" value={edit.motorcycle.year ?? ''} onChange={e => setEdit(old => ({ ...old, motorcycle:{...old.motorcycle,year:e.target.value ? Number(e.target.value) : null} }))}/></label><label>Cor<input maxLength={50} value={edit.motorcycle.color} onChange={e => setEdit(old => ({ ...old, motorcycle:{...old.motorcycle,color:e.target.value} }))}/></label></div><label className="oa-wide-label">Problema<input maxLength={2000} value={edit.problem} onChange={e => setEdit(old => ({ ...old, problem:e.target.value }))}/></label><label className="oa-wide-label">Observações<textarea maxLength={2000} placeholder="Adicione observações (opcional)" value={edit.observations} onChange={e => setEdit(old => ({ ...old, observations:e.target.value }))}/></label><small className="oa-shared-note">Dados do cliente e da moto serão atualizados também nas outras OS vinculadas a eles.</small></div> : <div className="oa-cancel-content"><span className="oa-cancel-icon"><Icon name="close" size={24}/></span><h3>Cancelar esta ordem de serviço?</h3><p>A OS ficará com status <b>Cancelada</b> e permanecerá no histórico para consulta. Esta ação pode ser corrigida posteriormente por um administrador.</p><label>Motivo do cancelamento <small>(Obrigatório)</small><textarea maxLength={500} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Descreva o motivo..."/></label><button className="oa-delete-link" onClick={() => setConfirmation('delete')}><Icon name="close" size={13}/> Excluir esta ordem permanentemente</button></div>}</div>
          {error && <div className="oa-error" role="alert">{error}</div>}
          <footer className="oa-footer"><div className="oa-footer-note"><Icon name="clock" size={14}/> Suas alterações serão registradas internamente com seu usuário no Log do Sistema.</div><div><button className="oa-secondary" onClick={onClose}><Icon name="close" size={12}/> Cancelar</button><button className="oa-primary" onClick={ask}><Icon name="check" size={13}/>{tab === 'cancel' ? 'Cancelar OS' : 'Salvar alteração'}</button></div></footer>
        </> : <div className="oa-loading">{error || 'Carregando informações da OS...'}</div>}
      </section>
    </div>}
    {confirmation && <div className="oa-confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) initialTab === 'delete' ? onClose() : setConfirmation(null); }}><section className="oa-confirm" role="alertdialog" aria-modal="true" aria-labelledby="oa-confirm-title"><span className={`oa-confirm-icon ${confirmation === 'delete' ? 'destructive' : ''}`}><Icon name={confirmation === 'delete' ? 'close' : 'check'} size={19}/></span><div><button className="oa-confirm-close" aria-label="Fechar" onClick={() => initialTab === 'delete' ? onClose() : setConfirmation(null)}><Icon name="close" size={15}/></button><h3 id="oa-confirm-title">Confirmar Ação</h3><p>{confirmation === 'delete' ? `Tem certeza que deseja excluir esta ordem de serviço (OS #${orderId})?` : confirmation === 'edit' ? 'Tem certeza que deseja salvar as informações corrigidas?' : confirmation === 'cancel' ? `Tem certeza que deseja cancelar a OS #${orderId}?` : `Tem certeza que deseja alterar o status da OS #${orderId}?`}</p>{confirmation === 'delete' && <><p>Esta ação é permanente e não poderá ser desfeita.</p><label className="oa-delete-reason">Motivo da exclusão <small>(opcional)</small><textarea maxLength={500} placeholder="Descreva o motivo..." value={cancelReason} onChange={event => setCancelReason(event.target.value)}/></label></>}{error && <small className="oa-confirm-error" role="alert">{error}</small>}<div className="oa-confirm-actions"><button onClick={() => initialTab === 'delete' ? onClose() : setConfirmation(null)} disabled={busy}>Cancelar</button><button className={confirmation === 'delete' ? 'danger' : 'positive'} onClick={() => void perform()} disabled={busy}>{busy ? 'Aguarde...' : 'Confirmar'}</button></div></div></section></div>}
    {success && <div className="oa-confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="oa-success" role="dialog" aria-modal="true"><span><Icon name="check" size={23}/></span><div><button aria-label="Fechar" onClick={onClose}><Icon name="close" size={14}/></button><h3>{success}</h3><p>A ação foi registrada. Você pode continuar trabalhando normalmente.</p><button className="oa-success-done" onClick={onClose}>Concluir</button></div></section></div>}
  </>, document.body);
}
