import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './MenuAdmin';
import { fotoFuncionario, type SituacaoFuncionario } from '../services/funcionarios';

const recursos={equipe:'491-2-imgSvg',ativos:'491-2-imgSvg3',ferias:'491-2-imgSvg5',abertas:'491-2-imgSvg7',
  concluidas:'491-933-imgSvg7',total:'491-933-imgSvg6',espera:'491-933-imgSvg9',canceladas:'491-933-imgSvg10',
  overview:'491-437-imgSvg11',desempenho:'491-437-imgSvg12',ordens:'491-437-imgSvg13',dados:'491-437-imgSvg14',
  salvar:'491-1320-imgSvg3',editar:'491-1320-imgSvg8',camera:'491-1320-imgSvg9',seguranca:'491-1320-imgSvg10',
  senha:'491-1320-imgSvg11',bloquear:'491-1320-imgSvg12',identificacao:'491-1320-imgSvg4',baixar:'491-437-imgSvg8',remover:'491-437-imgSvg9',
  grafico:'491-437-imgSvg5',perfilConcluidas:'491-437-imgSvg3',perfilAbertas:'491-437-imgSvg4',perfilTaxa:'491-437-imgSvg5',perfilTotal:'491-437-imgFrame',perfilSalvar:'491-437-imgSvg1',perfilChevron:'491-437-imgSvg'} as const;
export function IconeFuncionario({name}:{name:keyof typeof recursos}){const src=`/assets/funcionarios/${recursos[name]}.svg`,tabIcon=['overview','desempenho','ordens','dados'].includes(name);return <span className={`staff-figma-icon${tabIcon?' staff-profile-tab-icon':''}`} style={tabIcon?({'--staff-tab-icon':`url("${src}")`} as CSSProperties):undefined} aria-hidden="true"><img src={src} alt=""/></span>;}
export const situacoes:Record<SituacaoFuncionario,string>={ativo:'Ativo',ferias:'Em férias',afastado:'Afastado',desligado:'Desligado',nao_informado:'Não informado'};
export const dinheiro=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
export const dataCurta=(v:string|null|undefined)=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(`${v.slice(0,10)}T12:00:00Z`)):'—';
export const normalizar=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export function Situacao({value}:{value:SituacaoFuncionario}){return <span className={`staff-status ${value}`}>{situacoes[value]??'Não informado'}</span>;}
export function AvatarFuncionario({id,nome,versao=0,large=false}:{id:number;nome:string;versao?:number;large?:boolean}){
  const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[id,versao]);
  return <span className={`staff-avatar${large?' large':''}`}>
    {failed?<span aria-label={`Iniciais de ${nome}`}>{nome.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase()}</span>:<img src={fotoFuncionario(id,versao)} alt={`Foto de ${nome}`} loading="lazy" onError={()=>setFailed(true)}/>}
  </span>;
}
export function PainelFuncionario({title,subtitle,action,children,className=''}:{title:string;subtitle?:string;action?:ReactNode;children:ReactNode;className?:string}){
  return <section className={`staff-panel ${className}`}><header><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</header>{children}</section>;
}
export function MetricaFuncionario({title,value,description,icon,tone='rose',trend,trendLabel='Evolução no período',onClick,active=false}:{title:string;value:number|string;description:string;icon:keyof typeof recursos;tone?:string;trend?:number[];trendLabel?:string;onClick?:()=>void;active?:boolean}){
  const contents=<><span className="staff-metric-icon"><IconeFuncionario name={icon}/></span><div className="staff-metric-copy"><h2>{title}</h2><strong>{value}</strong><p>{description}</p></div>{trend&&trend.length>1&&<MiniGrafico values={trend} label={trendLabel}/>}</>;
  const className=`staff-metric ${tone}${onClick?' staff-metric-button':''}${active?' card-selected':''}`;
  return onClick?<button type="button" className={className} onClick={onClick} aria-pressed={active} aria-label={`${title}: ${value}. ${description}`}>{contents}</button>:<article className={className}>{contents}</article>;
}
function MiniGrafico({values,label}:{values:number[];label:string}){
  const max=Math.max(...values,1);const points=values.map((v,i)=>({x:4+i*88/(values.length-1),y:48-v/max*36}));return <svg className="staff-sparkline" viewBox="0 0 96 56" role="img" aria-label={label}><polyline points={points.map(({x,y})=>`${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>{points.map(({x,y},i)=><circle key={i} cx={x} cy={y} r="2.5" fill="currentColor"/>)}</svg>;
}
export function PaginacaoFuncionario({page,total,count,size,onChange,label='resultados'}:{page:number;total:number;count:number;size:number;onChange:(page:number)=>void;label?:string}){
  const pages=Math.max(1,Math.ceil(total/size)),choices=[...new Set([1,page-1,page,page+1,pages])].filter(p=>p>0&&p<=pages).sort((a,b)=>a-b);
  return <footer className="staff-pagination"><span>{total?`Mostrando ${(page-1)*size+1} a ${(page-1)*size+count} de ${total} ${label}`:`Nenhum ${label}`}</span><nav aria-label="Paginação"><button disabled={page<=1} onClick={()=>onChange(page-1)} aria-label="Página anterior"><Icon name="left" size={14}/></button>{choices.map((p,i)=><span key={p}>{i>0&&p>choices[i-1]+1&&<i>…</i>}<button className={page===p?'active':''} aria-current={page===p?'page':undefined} onClick={()=>onChange(p)}>{p}</button></span>)}<button disabled={page>=pages} onClick={()=>onChange(page+1)} aria-label="Próxima página"><Icon name="right" size={14}/></button></nav></footer>;
}
export function DialogoFuncionario({title,description,onClose,children,className=''}:{title:string;description?:string;onClose:()=>void;children:ReactNode;className?:string}){
  const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.querySelector<HTMLElement>('button,input,textarea')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close.current();if(e.key==='Tab'){const nodes=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.focus();};},[]);
  return createPortal(<div className="staff-dialog-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title" className={`staff-dialog ${className}`}><header><div><h2 id="staff-dialog-title">{title}</h2>{description&&<p>{description}</p>}</div><button onClick={onClose} aria-label="Fechar"><Icon name="close" size={18}/></button></header>{children}</div></div>,document.body);
}
export function baixarRegistro(nome:string,rows:(string|number|null)[][]){
  const safe=(v:string|number|null)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(safe).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=nome;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
