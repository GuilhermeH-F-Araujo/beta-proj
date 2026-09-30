import { useEffect, useRef, useState } from 'react';
import './seletor-periodo.css';

export type DateRange = { from: string; to: string };
const iso = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T12:00:00Z`);
const shiftMonth = (date: Date, by: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + by, 1, 12));
const shortDate = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(asDate(value));
const fieldDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC', day:'2-digit', month:'2-digit', year:'numeric' }).format(asDate(value));

export default function SeletorPeriodo({ value, onApply, variant = 'default' }: { value: DateRange | null; onApply: (value: DateRange | null) => void; variant?: 'default' | 'fields' }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => shiftMonth(new Date(), 0));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
  }, [open]);

  function toggle(target: 'start' | 'end' = 'start') {
    if (open) { setOpen(false); return; }
    const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
    const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
    const today = new Date(Date.UTC(part('year'), part('month') - 1, part('day'), 12));
    const recent = new Date(today); recent.setUTCDate(today.getUTCDate() - 7);
    setStart(value?.from ?? iso(recent));
    setEnd(value?.to ?? iso(today));
    setMonth(shiftMonth(value ? asDate(value.to) : today, 0));
    setSelecting(target); setOpen(true);
  }
  function pick(day: string) {
    if (selecting === 'start' || !start) {
      setStart(day); setEnd(''); setSelecting('end');
    } else if (day < start) {
      setStart(day); setEnd('');
    } else {
      setEnd(day); setSelecting('start');
    }
  }
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), index - offset + 1, 12)));
  const title = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(first);
  return <div className={`period-picker${variant === 'fields' ? ' period-fields' : ''}`} ref={root}>
    {variant === 'fields' ? <><div className="period-field"><span>Data inicial</span><button type="button" onClick={() => toggle('start')} aria-haspopup="dialog" aria-expanded={open} aria-label="Selecionar data inicial">{value ? fieldDate(value.from) : 'dd/mm/aaaa'}<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2.5" y="4" width="15" height="13.5" rx="2"/><path d="M6 2v4M14 2v4M2.5 8h15"/></svg></button></div><div className="period-field"><span>Data final</span><button type="button" onClick={() => toggle('end')} aria-haspopup="dialog" aria-expanded={open} aria-label="Selecionar data final">{value ? fieldDate(value.to) : 'dd/mm/aaaa'}<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2.5" y="4" width="15" height="13.5" rx="2"/><path d="M6 2v4M14 2v4M2.5 8h15"/></svg></button></div></> : <button type="button" className={`period-trigger${value ? ' period-active' : ''}`} onClick={() => toggle()} aria-haspopup="dialog" aria-expanded={open} aria-label="Período de entrada"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2.5" y="4" width="15" height="13.5" rx="2"/><path d="M6 2v4M14 2v4M2.5 8h15"/></svg><span>{value ? `${shortDate(value.from)} – ${shortDate(value.to)}` : 'Período de entrada'}</span><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>}
    {open && <div className="date-range-popover" role="dialog" aria-label="Selecionar período de entrada">
      <div className="range-month"><button type="button" onClick={() => setMonth(shiftMonth(month,-1))} aria-label="Mês anterior">‹</button><strong>{title.charAt(0).toUpperCase() + title.slice(1)}</strong><button type="button" onClick={() => setMonth(shiftMonth(month,1))} aria-label="Próximo mês">›</button></div>
      <div className="range-fields"><button type="button" className={selecting === 'start' ? 'field-selecting' : ''} onClick={() => setSelecting('start')}>{start ? shortDate(start) : 'Início'}</button><span>–</span><button type="button" className={selecting === 'end' ? 'field-selecting' : ''} onClick={() => setSelecting('end')}>{end ? shortDate(end) : 'Fim'}</button></div>
      <div className="range-weekdays">{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="range-days">{days.map(day => { const date = iso(day); const endpoint = date === start || date === end; return <button type="button" key={date} className={`${day.getUTCMonth() !== first.getUTCMonth() ? 'outside-month ' : ''}${date > start && date < end ? 'inside-range ' : ''}${endpoint ? 'range-endpoint' : ''}`} aria-label={new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',dateStyle:'full'}).format(day)} aria-pressed={endpoint} onClick={() => pick(date)}>{day.getUTCDate()}</button>; })}</div>
      <div className="range-footer"><button type="button" onClick={() => setOpen(false)}>Cancelar</button>{value && <button type="button" className="range-clear" onClick={() => { onApply(null); setOpen(false); }}>Limpar</button>}<button type="button" className="range-save" disabled={!start || !end} onClick={() => { onApply({ from:start,to:end }); setOpen(false); }}>Salvar</button></div>
    </div>}
  </div>;
}
