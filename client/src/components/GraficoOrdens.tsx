import {useEffect,useRef,useState} from 'react';
type Day={key:string;label:string;count:number;tooltipLabel?:string};
export default function GraficoOrdens({data}:{data:Day[]}){
 const root=useRef<HTMLDivElement>(null);const [width,setWidth]=useState(700);const [active,setActive]=useState<number|null>(null);
 useEffect(()=>{if(!root.current)return;const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));observer.observe(root.current);return()=>observer.disconnect();},[]);
 const height=190,left=38,right=22,top=24,bottom=40,base=height-bottom;
 const max=Math.max(2,...data.map(d=>d.count));const step=Math.max(1,Math.ceil(max/4));const ceiling=Math.ceil(max/step)*step;
 const points=data.map((d,i)=>({...d,x:data.length===1?left+(width-left-right)/2:left+i*(width-left-right)/Math.max(1,data.length-1),y:base-d.count/ceiling*(base-top)}));
 const path=points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
 const item=active===null?null:points[active];
 return <div className="operation-chart" ref={root} onMouseLeave={()=>setActive(null)}>
 <svg width="100%" height={height} role="img" aria-label="Evolução do número de ordens de serviço">
 <defs><linearGradient id="os-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef3348" stopOpacity=".24"/><stop offset="100%" stopColor="#ef3348" stopOpacity=".06"/></linearGradient></defs>
 {Array.from({length:ceiling/step+1},(_,i)=>i*step).map(value=>{const y=base-value/ceiling*(base-top);return <g key={value}><line x1={left} x2={width-right} y1={y} y2={y} stroke="#e7ebf1" strokeDasharray="3 5"/><text x={left-12} y={y+4} textAnchor="end">{value}</text></g>;})}
 <path d={`${path} L${points.at(-1)?.x??left},${base} L${left},${base}Z`} fill="url(#os-area)"/><path d={path} fill="none" stroke="#ec2842" strokeWidth="1.7"/>
 {points.map((p,i)=><g key={p.key}>{((i%Math.max(1,Math.ceil(points.length/8))===0&&points.length-1-i>=Math.ceil(points.length/16))||i===points.length-1)&&<text x={p.x} y={height-13} textAnchor="middle">{p.label}</text>}<circle cx={p.x} cy={p.y} r={active===i?4.5:2.5} stroke="#ec2842" strokeWidth="1.2" fill="#ef3348"/><rect x={Math.max(left,p.x-(width-left-right)/Math.max(1,points.length-1)/2)} y={top} width={Math.min(width-right,p.x+(width-left-right)/Math.max(1,points.length-1)/2)-Math.max(left,p.x-(width-left-right)/Math.max(1,points.length-1)/2)} height={base-top} fill="transparent" tabIndex={0} aria-label={`${p.label}: ${p.count} OS`} onMouseEnter={()=>setActive(i)} onFocus={()=>setActive(i)} onBlur={()=>setActive(null)}/></g>)}
 {item&&<line x1={item.x} x2={item.x} y1={top} y2={base} stroke="#d19aa3" strokeDasharray="3 4"/>}
 </svg>{item&&<div className="chart-tooltip" style={{left:Math.min(Math.max(item.x-90,0),Math.max(0,width-184)),top:Math.max(0,item.y-58)}}><span className="tooltip-eyebrow">ORDENS ABERTAS</span><span>{item.tooltipLabel ?? item.label}</span><strong>{item.count} <small>{item.count===1?'ordem':'ordens'}</small></strong></div>}
 </div>;
}
