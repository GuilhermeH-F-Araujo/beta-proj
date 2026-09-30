import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './MenuAdmin';
import { limparNotificacoesAdmin, buscarNotificacoesAdmin, atualizarNotificacaoAdmin, type NotificacaoAdmin } from '../services/apiAutenticacao';
import './painel-notificacoes.css';

const icons:Record<NotificacaoAdmin['kind'],string>={new_order:'clipboard',waiting_part:'package',ready:'check',cancelled:'close'};
function elapsed(value:string){
  const minutes=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));
  if(minutes<1)return 'Agora';
  if(minutes<60)return `Há ${minutes} min`;
  if(minutes<1440)return `Há ${Math.floor(minutes/60)} h`;
  return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(value));
}
export default function PainelNotificacoes(){
  const navigate=useNavigate();
  const root=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<NotificacaoAdmin[]>([]);
  const [unread,setUnread]=useState(0);
  const [loading,setLoading]=useState(true);
  const [clearing,setClearing]=useState(false);
  const [error,setError]=useState('');
  const version=useRef(0);
  const refresh=useCallback(async()=>{
    const currentVersion=version.current;
    try{
      const response=await buscarNotificacoesAdmin();
      if(currentVersion===version.current){setItems(response.items);setUnread(response.unreadCount);setError('');}
    }catch(err){if(currentVersion===version.current)setError(err instanceof Error?err.message:'Não foi possível carregar as notificações.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},30000);
    const focus=()=>{void refresh();};
    window.addEventListener('focus',focus);
    window.addEventListener('admin-notifications-refresh',focus);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('admin-notifications-refresh',focus);};
  },[refresh]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  async function action(item:NotificacaoAdmin,kind:'read'|'dismiss'){
    setError('');
    try{
      await atualizarNotificacaoAdmin(item.id,kind);
      setItems(previous=>kind==='dismiss'?previous.filter(row=>row.id!==item.id):previous.map(row=>row.id===item.id?{...row,read:true}:row));
      if(!item.read)setUnread(value=>Math.max(0,value-1));
    }catch(err){setError(err instanceof Error?err.message:'Não foi possível atualizar a notificação.');}
  }
  async function clearAll(){
    if(clearing)return;
    version.current++;
    setClearing(true);setError('');
    try{
      await limparNotificacoesAdmin();
      version.current++;
      setItems([]);setUnread(0);
      await refresh();
    }catch(err){
      version.current++;
      await refresh();
      setError(err instanceof Error?err.message:'Não foi possível limpar os avisos.');
    }finally{setClearing(false);}
  }
  return <div className="notice-root" ref={root}>
    <button type="button" className={`plain notification notice-trigger${open?' notice-active':''}`} aria-label={unread?`Notificações: ${unread} não lidas`:'Notificações'} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(value=>!value);if(!open)void refresh();}}>
      <Icon name="bell" size={21}/>{unread>0&&<span className="notice-badge">{unread>99?'99+':unread}</span>}
    </button>
    {open&&<section className="notice-popover" role="dialog" aria-modal="false" aria-label="Notificações importantes">
      <div className="notice-top"><div><span className="notice-eyebrow">CENTRAL DE AVISOS</span><h2>Notificações</h2><p>O que merece sua atenção na oficina.</p></div><button type="button" className="notice-close" aria-label="Fechar notificações" onClick={()=>setOpen(false)}><Icon name="close" size={16}/></button></div>
      <div className="notice-toolbar"><span>{items.length?`${items.length} ${items.length===1?'aviso':'avisos'}`:'Tudo em dia'}</span>{items.length>0&&<button type="button" disabled={clearing} onClick={()=>void clearAll()}>{clearing?'Limpando…':'Vi tudo · limpar avisos'}</button>}</div>
      <div className="notice-list">
        {loading&&!items.length?<p className="notice-empty">Carregando avisos…</p>:!items.length?<div className="notice-empty"><span><Icon name="check" size={25}/></span><strong>Nenhum aviso por enquanto</strong><small>Novas OS e mudanças importantes aparecerão aqui.</small></div>:
          items.map(item=><article className={`notice-item notice-${item.kind}${item.read?' is-read':''}`} key={item.id}>
            <span className="notice-icon"><Icon name={icons[item.kind]} size={16}/></span>
            <button type="button" className="notice-content" onClick={()=>{if(!item.read)void action(item,'read');setOpen(false);if(item.orderId)navigate(`/ordens-de-servico/${item.orderId}`);}}>
              <span><b>{item.title}</b>{!item.read&&<i aria-label="Não lida"/>}</span><small>{item.body}</small><time dateTime={item.createdAt}>{elapsed(item.createdAt)}</time>
            </button>
            <button type="button" className="notice-dismiss" title="Remover aviso" aria-label={`Remover ${item.title}`} onClick={()=>void action(item,'dismiss')}><Icon name="close" size={13}/></button>
          </article>)}
      </div>
      {error&&<div className="notice-error" role="alert">{error} <button type="button" onClick={()=>void refresh()}>Tentar novamente</button></div>}
      <div className="notice-bottom">Apenas eventos importantes aparecem neste espaço.</div>
    </section>}
  </div>;
}
