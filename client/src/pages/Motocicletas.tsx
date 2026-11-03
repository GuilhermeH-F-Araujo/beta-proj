import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoAdmin from '../components/CabecalhoAdmin';
import SeletorFiltro from '../components/SeletorFiltro';
import MenuAdmin,{Icon} from '../components/MenuAdmin';
import ModalEditarMotocicleta from '../components/ModalEditarMotocicleta';
import ModalVerMotocicleta from '../components/ModalVerMotocicleta';
import ModalPreviaModelo from '../components/ModalPreviaModelo';
import { ErroRequisicaoApi, buscarUsuarioAtual, buscarMotocicletas, logout, type ItemMotocicleta, type StatusMotocicleta, type RespostaMotocicletas } from '../services/apiAutenticacao';
import { useMiniaturaModeloMotocicleta } from '../services/miniaturasMotocicletas';
import './ordens-servico.css';
import './motocicletas.css';

const empty:RespostaMotocicletas={items:[],counts:{all:0,active:0,maintenance:0,completed:0,pickup:0,inactive:0,delivered:0,cancelled:0,'no-orders':0},clients:[]};
const statuses:{key:StatusMotocicleta|'all';label:string;icon:string;shade:string}[]=[
  {key:'all',label:'Total de motocicletas',icon:'bike',shade:'rose'},
  {key:'active',label:'Ativas',icon:'check',shade:'mint'},
  {key:'pickup',label:'Aguardando retirada',icon:'clock',shade:'green'},
  {key:'maintenance',label:'Em manutenção',icon:'wrench',shade:'amber'},
  {key:'inactive',label:'Inativas',icon:'clock',shade:'gray'},
];
const statusText:Record<StatusMotocicleta,string>={active:'Ativa',maintenance:'Em manutenção',completed:'Concluída',pickup:'Aguardando retirada',inactive:'Inativa',delivered:'Entregue',cancelled:'Cancelada','no-orders':'Sem OS'};
const statusIcon:Record<StatusMotocicleta,string>={active:'check',maintenance:'wrench',completed:'clipboard-check',pickup:'clock',inactive:'clock',delivered:'exit-arrow',cancelled:'close','no-orders':'info'};
function StatusBadge({value}:{value:StatusMotocicleta}){return <span className={`bikes-status ${value}`}><Icon name={statusIcon[value]} size={12}/>{statusText[value]}</span>;}
const filterStatuses:{key:StatusMotocicleta;label:string}[]=[
  {key:'active',label:'Ativas'},
  {key:'maintenance',label:'Em manutenção'},
  {key:'completed',label:'Concluídas'},
  {key:'pickup',label:'Aguardando retirada'},
  {key:'delivered',label:'Entregues'},
  {key:'cancelled',label:'Canceladas'},
  {key:'inactive',label:'Inativas'},
  {key:'no-orders',label:'Sem OS'},
];
const motorcycleStatusOptions: {value:StatusMotocicleta|'all';label:string}[] = [
  {value:'all',label:'Todos'},
  ...filterStatuses.map(option=>({value:option.key,label:option.label})),
];
function BikeThumb({item,revision}:{item:ItemMotocicleta;revision:number}){
  const thumb=useMiniaturaModeloMotocicleta(item.model,item.color,revision);
  return <span className="bikes-thumb">{thumb?<img src={thumb} alt={`Miniatura de ${item.model}`}/>:<Icon name="bike" size={25}/>}</span>;
}
function dateBR(value:string){const day=value.slice(0,10).split('-');return day.length===3?`${day[2]}/${day[1]}/${day[0]}`:'—';}
function normalized(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function pagesToShow(page:number,last:number):(number|'…')[]{if(last<=6)return Array.from({length:last},(_,i)=>i+1);const list=[...new Set([1,last,page-1,page,page+1])].filter(n=>n>=1&&n<=last).sort((a,b)=>a-b);return list.flatMap((n,i)=>i&&n-list[i-1]>1?['…' as const,n]:[n]);}
export default function Motocicletas(){
  const navigate=useNavigate();
  const [name,setName]=useState('Administrador');
  const [authorized,setAuthorized]=useState(false);
  const [authError,setAuthError]=useState('');
  const [collapsed,setCollapsed]=useState(false);
  const [data,setData]=useState<RespostaMotocicletas>(empty);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState<StatusMotocicleta|'all'>('all');
  const [brand,setBrand]=useState('all');
  const [year,setYear]=useState('all');
  const [filtersOpen,setFiltersOpen]=useState(false);
  const filtersRef=useRef<HTMLDivElement>(null);
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(10);
  const [pageSizeOpen,setPageSizeOpen]=useState(false);
  const pageSizeRef=useRef<HTMLDivElement>(null);
  const [editing,setEditing]=useState<ItemMotocicleta|null|undefined>(undefined);
  const [imageEdit,setImageEdit]=useState<ItemMotocicleta|null>(null);
  const [viewing,setViewing]=useState<ItemMotocicleta|null>(null);
  const [deleting,setDeleting]=useState<ItemMotocicleta|null>(null);
  const [imageRevision,setImageRevision]=useState(0);
  useEffect(()=>{let live=true;buscarUsuarioAtual().then(({user})=>{if(live){setName(user.nome);setAuthorized(true);}}).catch(cause=>{
    if(!live)return;if(cause instanceof ErroRequisicaoApi&&[401,403].includes(cause.status))navigate('/login',{replace:true});
    else setAuthError(cause instanceof Error?cause.message:'Não foi possível verificar seu acesso.');
  });return()=>{live=false;};},[navigate]);
  async function reload(){setLoading(true);setError('');try{setData(await buscarMotocicletas());}catch(cause){setError(cause instanceof Error?cause.message:'Falha ao carregar motocicletas.');}finally{setLoading(false);}}
  useEffect(()=>{if(authorized)void reload();},[authorized]);
  useEffect(()=>{setPage(1);},[search,status,brand,year,pageSize]);
  useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(''),4500);return()=>window.clearTimeout(timer);},[toast]);
  useEffect(()=>{if(!pageSizeOpen)return;const close=(event:PointerEvent)=>{if(!pageSizeRef.current?.contains(event.target as Node))setPageSizeOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setPageSizeOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[pageSizeOpen]);
  useEffect(()=>{if(!filtersOpen)return;const close=(event:PointerEvent)=>{if(!filtersRef.current?.contains(event.target as Node))setFiltersOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setFiltersOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[filtersOpen]);
  useEffect(()=>{if(!deleting)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setDeleting(null);};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[deleting]);
  const brands=useMemo(()=>[...new Set(data.items.map(item=>item.model.split(' ')[0]))].sort(),[data.items]);
  const years=useMemo(()=>[...new Set(data.items.map(item=>item.year).filter((value):value is number=>value!==null))].sort((a,b)=>b-a),[data.items]);
  const filtered=useMemo(()=>data.items.filter(item=>{
    const words=normalized(`${item.model} ${item.plate} ${item.client} ${item.phone??''}`);
    return (!search.trim()||words.includes(normalized(search.trim())))&&
      (status==='all'||item.status===status)&&(brand==='all'||item.model.startsWith(`${brand} `))&&
      (year==='all'||item.year===Number(year));
  }),[data.items,search,status,brand,year]);
  const lastPage=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,lastPage);
  const visible=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  async function signOut(){await logout();navigate('/login',{replace:true});}
  if(!authorized)return <div className="orders-auth-loading">{authError||'Validando acesso…'}{authError&&<button onClick={()=>window.location.reload()}>Tentar novamente</button>}</div>;
  return <div className="orders-viewport bikes-viewport"><MenuAdmin collapsed={collapsed} onUnavailable={label=>setToast(`${label} ainda não possui uma página neste projeto.`)}/>
    <div className="orders-main"><CabecalhoAdmin title="Motocicletas" name={name} onLogout={signOut} collapsed={collapsed} onToggle={()=>setCollapsed(value=>!value)} search={{value:search,onChange:setSearch,ariaLabel:'Busca rápida'}}/>
    <main className="bikes-content"><div className="bikes-heading"><div><h1>Motocicletas</h1><p>Cadastre e gerencie as motocicletas dos seus clientes.</p></div><button type="button" className="bikes-new" onClick={()=>setEditing(null)}><Icon name="plus" size={15}/> Nova motocicleta</button></div>
      <div className="bikes-stats">{statuses.map(card=><button type="button" key={card.key} className={`bikes-stat ${card.shade}${status===card.key?' selected':''}`} aria-pressed={status===card.key} onClick={()=>setStatus(card.key)}><span className="bikes-stat-icon"><Icon name={card.icon} size={18}/></span><span><strong>{data.counts[card.key]}</strong><small>{card.label}</small><em>{card.key==='all'?'Todas as cadastradas':`${data.counts.all?Math.round((data.counts[card.key]/data.counts.all)*100):0}% do total`}</em></span></button>)}</div>
      <section className="bikes-panel" aria-label="Lista de motocicletas">
        <div className="bikes-filters">
          <label className="bikes-search"><Icon name="search" size={15}/><input aria-label="Buscar motocicletas" placeholder="Buscar por placa, modelo ou cliente..." value={search} onChange={event=>setSearch(event.target.value)}/></label>
          <SeletorFiltro label="Status da motocicleta" value={status} options={motorcycleStatusOptions} onChange={setStatus}/>
          <SeletorFiltro label="Marca" value={brand} options={[{value:'all',label:'Todas'},...brands.map(value=>({value,label:value}))]} onChange={setBrand}/>
          <SeletorFiltro label="Ano" value={year} options={[{value:'all',label:'Todos'},...years.map(value=>({value:String(value),label:String(value)}))]} onChange={setYear}/>
          <div className="bikes-filter-action" ref={filtersRef}>
            <button type="button" className="bikes-filter-button" aria-expanded={filtersOpen} aria-controls="bikes-filter-options" onClick={()=>setFiltersOpen(open=>!open)}><Icon name="filter" size={14}/> Filtros</button>
            {filtersOpen&&<div id="bikes-filter-options" className="bikes-filter-popover"><strong>Filtrar por situação</strong><p>Mostrando {filtered.length} de {data.items.length} motocicletas</p><div>{filterStatuses.map(option=><button type="button" key={option.key} aria-pressed={status===option.key} onClick={()=>{setStatus(option.key);setFiltersOpen(false);}}>{option.label}</button>)}</div></div>}
          </div>
          <button type="button" className="bikes-clear" onClick={()=>{setSearch('');setStatus('all');setBrand('all');setYear('all');setFiltersOpen(false);}}><Icon name="trash" size={13}/> Limpar filtros</button>
        </div>
        <div className="bikes-table-wrap"><table><thead><tr><th>Motocicleta</th><th>Placa</th><th>Cliente</th><th>Ano/Modelo</th><th>Quilometragem</th><th>Status</th><th>Última OS</th><th>Ações</th></tr></thead><tbody>{loading?<tr><td colSpan={8} className="bikes-empty">Carregando motocicletas…</td></tr>:visible.length===0?<tr><td colSpan={8} className="bikes-empty">{error?'Não foi possível carregar a lista. Tente novamente pelo aviso no canto da tela.':'Nenhuma motocicleta encontrada. Ajuste os filtros ou cadastre uma nova.'}</td></tr>:visible.map(item=><tr key={item.id}><td><div className="bikes-name"><BikeThumb item={item} revision={imageRevision}/><span><strong>{item.model}</strong><small>Cor: {item.color||'Não informada'}</small></span></div></td><td className="bikes-plate">{item.plate}</td><td><div className="bikes-client"><strong>{item.client}</strong>{item.phone&&<a target="_blank" rel="noopener noreferrer" href={`https://wa.me/${item.phone.replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'').replace(/^(?=\d{10,11}$)/,'55')}`}>{item.phone} <Icon name="whatsapp" size={10}/></a>}</div></td><td>{item.year??'—'}/{item.modelYear??item.year??'—'}</td><td>{item.mileage===null?'—':`${item.mileage.toLocaleString('pt-BR')} km`}</td><td><StatusBadge value={item.status}/></td><td>{item.lastOrder?<button type="button" className="bikes-last-os" onClick={()=>navigate(`/ordens-de-servico/${item.lastOrder!.id}`)}><strong>OS #{item.lastOrder.id}</strong><small>{dateBR(item.lastOrder.date)}</small></button>:<span className="bikes-muted">—</span>}</td><td><div className="bikes-actions"><button type="button" title="Ver motocicleta" aria-label={`Ver ${item.model}`} onClick={()=>setViewing(item)}><Icon name="eye" size={14}/></button><button type="button" title="Editar motocicleta" aria-label={`Editar ${item.model}`} onClick={()=>setEditing(item)}><Icon name="pencil" size={14}/></button><button type="button" className="delete" title="Excluir motocicleta" aria-label={`Excluir ${item.model}`} onClick={()=>setDeleting(item)}><Icon name="trash" size={14}/></button></div></td></tr>)}</tbody></table></div>
        <div className="bikes-footer"><span>Mostrando {filtered.length?`${(currentPage-1)*pageSize+1} a ${Math.min(currentPage*pageSize,filtered.length)}`:'0'} de {filtered.length} motocicletas</span><div><div className="bikes-page-size" ref={pageSizeRef}><span>Itens por página:</span><button type="button" className="bikes-page-size-trigger" aria-label={`Itens por página: ${pageSize}`} aria-expanded={pageSizeOpen} aria-haspopup="menu" onClick={()=>setPageSizeOpen(open=>!open)}>{pageSize}<Icon name="chevron" size={12}/></button>{pageSizeOpen&&<div className="bikes-page-size-options" role="menu" aria-label="Itens por página">{[10,15,25].map(size=><button role="menuitemradio" aria-checked={pageSize===size} type="button" key={size} onClick={()=>{setPageSize(size);setPageSizeOpen(false);}}>{size}<span>{pageSize===size?'✓':''}</span></button>)}</div>}</div><button type="button" onClick={()=>setPage(Math.max(1,currentPage-1))} disabled={currentPage===1} aria-label="Página anterior"><Icon name="left" size={13}/></button>{pagesToShow(currentPage,lastPage).map((n,index)=>n==='…'?<span key={`dots${index}`}>…</span>:<button type="button" key={n} className={n===currentPage?'current':''} onClick={()=>setPage(n)}>{n}</button>)}<button type="button" onClick={()=>setPage(Math.min(lastPage,currentPage+1))} disabled={currentPage===lastPage} aria-label="Próxima página"><Icon name="right" size={13}/></button></div></div>
      </section>
    </main></div>
    {(toast||error&&!deleting)&&<div className="bikes-notice" role={error?'alert':'status'}><span className="bikes-notice-mark"><Icon name={error?'close':'check'} size={14}/></span><span>{error||toast}</span>{error&&<button type="button" onClick={()=>void reload()}>Tentar novamente</button>}<button type="button" className="bikes-notice-close" onClick={()=>{setToast('');setError('');}} aria-label="Fechar aviso"><Icon name="close" size={14}/></button></div>}
    {editing!==undefined&&<ModalEditarMotocicleta item={editing} clients={data.clients} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);setToast('Motocicleta salva com sucesso.');void reload();}} onImage={bike=>{setEditing(undefined);setImageEdit(bike);}}/>}
    {imageEdit&&<ModalPreviaModelo motorcycleId={imageEdit.id} currentModel={imageEdit.model} onClose={()=>setImageEdit(null)} onChanged={()=>{setImageRevision(value=>value+1);void reload();}}/>}
    {viewing&&<ModalVerMotocicleta item={viewing} revision={imageRevision} onClose={()=>setViewing(null)} onEdit={()=>{setEditing(viewing);setViewing(null);}} onOwner={()=>{setViewing(null);navigate(`/clientes/${viewing.clientId}`);}} onLastOrder={()=>{if(viewing.lastOrder){setViewing(null);navigate(`/ordens-de-servico/${viewing.lastOrder.id}`);}}} onHistory={()=>{if(viewing.lastOrder){setViewing(null);navigate(`/ordens-de-servico/${viewing.lastOrder.id}/historico`);}}}/>}
    {deleting&&<div className="bikes-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setDeleting(null);}}><section className="bikes-delete" role="alertdialog" aria-modal="true" aria-labelledby="bike-delete-title" aria-describedby="bike-delete-description"><span className="bikes-delete-icon"><Icon name="trash" size={21}/></span><div className="bikes-delete-content"><button type="button" className="bikes-delete-close" aria-label="Fechar" onClick={()=>setDeleting(null)}><Icon name="close" size={19}/></button><h2 id="bike-delete-title">Manter o histórico da motocicleta</h2><p id="bike-delete-description">O cadastro de <strong>{deleting.model}</strong> não pode ser excluído. Ele preserva a identificação da moto e suas ordens de serviço.</p><p>Se ela não deve aparecer como ativa, edite o cadastro e marque como inativo.</p><div className="bikes-delete-actions"><button type="button" onClick={()=>setDeleting(null)}>Cancelar</button><button type="button" className="primary" onClick={()=>{setEditing(deleting);setDeleting(null);}}>Editar motocicleta</button></div></div></section></div>}
  </div>;
}
