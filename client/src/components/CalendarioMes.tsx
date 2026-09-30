import type { ReactNode } from 'react';

const diaIso = (data: Date) => data.toISOString().slice(0, 10);

export default function CalendarioMes({ mes, aoMudarMes, aoSelecionar, inicio, fim, campos }: {
  mes: Date;
  aoMudarMes: (mes: Date) => void;
  aoSelecionar: (dia: string) => void;
  inicio?: string;
  fim?: string;
  campos?: ReactNode;
}) {
  const primeiro = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), 1, 12));
  const deslocamento = (primeiro.getUTCDay() + 6) % 7;
  const dias = Array.from({ length: 42 }, (_, indice) => new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth(), indice - deslocamento + 1, 12)));
  const titulo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(primeiro);
  const mudar = (quantidade: number) => aoMudarMes(new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth() + quantidade, 1, 12)));

  return <>
    <div className="range-month"><button type="button" onClick={() => mudar(-1)} aria-label="Mês anterior">‹</button><strong>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</strong><button type="button" onClick={() => mudar(1)} aria-label="Próximo mês">›</button></div>
    {campos}
    <div className="range-weekdays">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(dia => <span key={dia}>{dia}</span>)}</div>
    <div className="range-days">{dias.map(dia => {
      const data = diaIso(dia);
      const selecionado = data === inicio || data === fim;
      return <button type="button" key={data} className={`${dia.getUTCMonth() !== primeiro.getUTCMonth() ? 'outside-month ' : ''}${inicio && fim && data > inicio && data < fim ? 'inside-range ' : ''}${selecionado ? 'range-endpoint' : ''}`} aria-label={new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'full' }).format(dia)} aria-pressed={selecionado} onClick={() => aoSelecionar(data)}>{dia.getUTCDate()}</button>;
    })}</div>
  </>;
}
