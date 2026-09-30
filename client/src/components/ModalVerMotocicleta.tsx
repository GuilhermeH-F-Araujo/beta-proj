import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './MenuAdmin';
import { useMiniaturaModeloMotocicleta } from '../services/miniaturasMotocicletas';
import type { ItemMotocicleta, StatusMotocicleta } from '../services/apiAutenticacao';
import './modal-ver-motocicleta.css';

const statusLabels: Record<StatusMotocicleta,string> = {
  active:'Ativa',maintenance:'Em manutenção',completed:'Concluída',pickup:'Aguardando retirada',
  inactive:'Inativa',delivered:'Entregue',cancelled:'Cancelada','no-orders':'Sem OS',
};
const statusDescriptions: Partial<Record<StatusMotocicleta,string>> = {
  completed:'Serviço concluído; pagamento ainda não confirmado.',
  pickup:'Serviço concluído e pago; aguardando retirada.',
  delivered:'Motocicleta entregue e retirada da oficina.',
  cancelled:'A última ordem de serviço foi cancelada.',
};
const colorSwatches: Record<string,string> = {
  vermelha:'#e0193d',preta:'#28303a',branca:'#ffffff',prata:'#a7b2bb',cinza:'#8b959e',
  azul:'#3566c9',verde:'#39995d',amarela:'#f5bf34',laranja:'#ef8f35',marrom:'#896247',
  roxa:'#8f65aa',rosa:'#dd7baa',dourada:'#c7a048',bege:'#c5ad87',
};
function dateBR(value:string){const parts=value.slice(0,10).split('-');return parts.length===3?`${parts[2]}/${parts[1]}/${parts[0]}`:'—';}
function clientInitials(value:string){return value.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toLocaleUpperCase('pt-BR')??'').join('')||'C';}
function phoneBR(value:string|null){
  if(!value)return 'Telefone não informado';
  const raw=value.replace(/\D/g,'');const digits=raw.startsWith('55')&&[12,13].includes(raw.length)?raw.slice(2):raw;
  if(digits.length===11)return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if(digits.length===10)return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return value;
}
function BrazilFlag(){return <svg className="moto-view-brazil-flag" viewBox="0 0 28 20" role="img" aria-label="Bandeira do Brasil"><rect width="28" height="20" fill="#159447"/><path d="M14 2 26 10 14 18 2 10Z" fill="#F9D43B"/><circle cx="14" cy="10" r="5.2" fill="#123CA5"/><path d="M9 8.8c3.7-.7 7.2.1 10.1 2.3" fill="none" stroke="#fff" strokeWidth="1.15"/></svg>;}

export default function ModalVerMotocicleta({item,revision,onClose,onEdit,onOwner,onLastOrder,onHistory}:{
  item:ItemMotocicleta;revision:number;onClose:()=>void;onEdit:()=>void;onOwner:()=>void;onLastOrder:()=>void;onHistory:()=>void;
}){
  const thumb=useMiniaturaModeloMotocicleta(item.model,item.color,revision);
  const closeRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';closeRef.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    window.addEventListener('keydown',onKeyDown);
    return()=>{document.body.style.overflow=oldOverflow;window.removeEventListener('keydown',onKeyDown);};
  },[onClose]);
  const colorKey=(item.color??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
  const swatch=colorSwatches[colorKey];
  return createPortal(<div className="moto-view-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="moto-view-dialog" role="dialog" aria-modal="true" aria-labelledby="moto-view-title">
      <header className="moto-view-header">
        <img src="/assets/estacao-motos-logo-sidebar.png" alt="Estação Motos" className="moto-view-logo"/>
        <span className="moto-view-breadcrumb">Motocicletas <span>/</span> Detalhes</span>
        <button ref={closeRef} type="button" className="moto-view-close" aria-label="Fechar detalhes da motocicleta" onClick={onClose}><Icon name="close" size={21}/></button>
      </header>
      <div className="moto-view-scroll">
        <div className="moto-view-content">
          <section className="moto-view-hero" aria-label="Identificação da motocicleta">
            <div className="moto-view-vehicle"><span className="moto-view-vehicle-stripes" aria-hidden="true"/><img src={thumb||'/assets/motocicleta-sem-miniatura.png'} alt={`Miniatura ilustrativa de ${item.model}`}/><small>Miniatura ilustrativa</small></div>
            <div className="moto-view-identity"><span className="moto-view-overline">MOTOCICLETA</span><h2 id="moto-view-title">{item.model}</h2>
              <div className="moto-view-plate" aria-label={`Placa ${item.plate}`}><div><span className="moto-view-plate-seal">✦</span><span>BRASIL</span><BrazilFlag/></div><strong>{item.plate}</strong></div>
              <div className={`moto-view-status ${item.status}`}><span aria-hidden="true"/>{statusLabels[item.status]}</div>
            </div>
          </section>
          <dl className="moto-view-metrics">
            <div><dt>ANO / MODELO</dt><dd>{item.year??'—'} / {item.modelYear??item.year??'—'}</dd></div>
            <div><dt>COR</dt><dd>{swatch&&<i className="moto-view-color" style={{backgroundColor:swatch}} aria-hidden="true"/>}{item.color||'Não informada'}</dd></div>
            <div><dt>QUILOMETRAGEM</dt><dd>{item.mileage===null?'Não informada':`${item.mileage.toLocaleString('pt-BR')} km`}</dd></div>
            <div><dt>OS REGISTRADAS</dt><dd>{item.orderCount}</dd></div>
          </dl>
          {statusDescriptions[item.status]&&<p className="moto-view-context"><Icon name="info" size={15}/>{statusDescriptions[item.status]}</p>}
          <div className="moto-view-links">
            <section className="moto-view-owner"><h3>PROPRIETÁRIO</h3><div className="moto-view-owner-row"><span className="moto-view-avatar" aria-hidden="true">{clientInitials(item.client)}</span><div><strong>{item.client}</strong><span>{phoneBR(item.phone)}</span><button type="button" onClick={onOwner}>Ver perfil <Icon name="right" size={16}/></button></div></div></section>
            <section className="moto-view-order"><h3>ÚLTIMA ORDEM</h3>{item.lastOrder?<div><strong>OS #{item.lastOrder.id}</strong><span>Entrada em {dateBR(item.lastOrder.date)}</span><button type="button" onClick={onHistory}>Ver histórico <Icon name="right" size={16}/></button></div>:<p>Nenhuma ordem registrada até agora.</p>}</section>
          </div>
          <dl className="moto-view-documents"><div><dt>Chassi</dt><dd>{item.chassis||'Não informado'}</dd></div><div><dt>RENAVAM</dt><dd>{item.renavam||'Não informado'}</dd></div></dl>
          {item.notes&&<section className="moto-view-notes"><h3>OBSERVAÇÕES</h3><p>{item.notes}</p></section>}
        </div>
      </div>
      <footer className="moto-view-footer">{item.lastOrder&&<button type="button" className="moto-view-secondary" onClick={onLastOrder}>Ver última OS</button>}<button type="button" className="moto-view-primary" onClick={onEdit}><Icon name="pencil" size={17}/>Editar motocicleta</button></footer>
    </section>
  </div>,document.body);
}
