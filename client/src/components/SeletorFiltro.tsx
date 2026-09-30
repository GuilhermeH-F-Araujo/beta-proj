import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './MenuAdmin';
import './seletor-filtro.css';

export type FilterOption<T extends string> = {value:T;label:string;tone?:string};

type Props<T extends string> = {
  label: string;
  value: T;
  options: readonly FilterOption<T>[];
  onChange: (value:T) => void;
  variant?: 'toolbar'|'compact';
};

export default function SeletorFiltro<T extends string>({label,value,options,onChange,variant='compact'}:Props<T>){
  const [open,setOpen]=useState(false);
  const [position,setPosition]=useState({top:0,left:0,width:0,maxHeight:320});
  const trigger=useRef<HTMLButtonElement>(null);
  const menu=useRef<HTMLDivElement>(null);
  const id=useId();
  const current=options.find(option=>option.value===value)??options[0];

  useEffect(()=>{
    if(!open)return;
    const place=()=>{
      const rect=trigger.current?.getBoundingClientRect();
      if(!rect)return;
      const height=Math.min(options.length*36+12,320);
      const below=window.innerHeight-rect.bottom-12;
      const above=rect.top-12;
      const goesUp=below<Math.min(height,160)&&above>below;
      const maxHeight=Math.min(height,goesUp?above:below);
      setPosition({top:goesUp?rect.top-Math.max(maxHeight,0)-6:rect.bottom+6,left:Math.max(8,Math.min(rect.left,window.innerWidth-Math.max(rect.width,variant==='toolbar'?218:rect.width)-8)),width:Math.max(rect.width,variant==='toolbar'?218:rect.width),maxHeight:Math.max(80,maxHeight)});
    };
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!trigger.current?.contains(event.target)&&!menu.current?.contains(event.target))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    place();
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    window.addEventListener('resize',place);
    window.addEventListener('scroll',place,true);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open,options.length,variant]);

  function choose(option:T){onChange(option);setOpen(false);trigger.current?.focus();}
  function moveFocus(event:ReactKeyboardEvent<HTMLButtonElement>){
    const buttons=[...menu.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]')??[]];
    const index=buttons.indexOf(event.currentTarget);
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
    }else if(event.key==='Home'||event.key==='End'){
      event.preventDefault();buttons[event.key==='Home'?0:buttons.length-1]?.focus();
    }
  }

  return <div className={`filter-select filter-select--${variant}`}>
    {variant==='compact'&&<span className="filter-select-label">{label}</span>}
    <button ref={trigger} type="button" className="filter-select-trigger" aria-label={`${label}: ${current?.label??''}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(previous=>!previous)} onKeyDown={event=>{if(!open&&(event.key==='ArrowDown'||event.key==='Enter')){event.preventDefault();setOpen(true);requestAnimationFrame(()=>menu.current?.querySelector<HTMLButtonElement>('button[role="option"]')?.focus());}}}>
      {variant==='toolbar'&&<span className={`filter-select-dot ${current?.tone??''}`} aria-hidden="true"/>}
      <span className="filter-select-value">{current?.label??'—'}</span>
      <Icon name="chevron" size={variant==='toolbar'?15:12}/>
    </button>
    {open&&createPortal(<div ref={menu} id={id} className={`filter-select-menu filter-select-menu--${variant}`} role="listbox" aria-label={label} style={{top:position.top,left:position.left,width:position.width,maxHeight:position.maxHeight}}>
      {options.map(option=><button key={option.value} type="button" role="option" aria-selected={option.value===value} onClick={()=>choose(option.value)} onKeyDown={moveFocus}>
        {variant==='toolbar'&&<span className={`filter-select-dot ${option.tone??''}`} aria-hidden="true"/>}
        <span>{option.label}</span>{option.value===value&&<Icon name="check" size={14}/>}
      </button>)}
    </div>,document.body)}
  </div>;
}
