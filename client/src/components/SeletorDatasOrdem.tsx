import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CalendarioMes from './CalendarioMes';
import './seletor-periodo.css';
import './seletor-datas-ordem.css';

type Campo = 'entrada' | 'previsao';

function formatarData(valor: string) {
  return valor.replace(/\D/g, '').slice(0, 8).replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2}\/\d{2})(\d)/, '$1/$2');
}

function dataIso(valor: string) {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  if (!partes) return '';
  const [, dia, mes, ano] = partes;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia), 12));
  return Number(ano) >= 1900 && Number(ano) <= 9999 && data.getUTCFullYear() === Number(ano) && data.getUTCMonth() + 1 === Number(mes) && data.getUTCDate() === Number(dia)
    ? `${ano}-${mes}-${dia}` : '';
}

function mostrarData(valor: string) {
  return valor ? `${valor.slice(8, 10)}/${valor.slice(5, 7)}/${valor.slice(0, 4)}` : '';
}

function horaValida(valor: string) {
  const partes = /^(\d{2}):(\d{2})$/.exec(valor);
  return !!partes && Number(partes[1]) < 24 && Number(partes[2]) < 60;
}

function formatarHora(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 4);
  return digitos.length > 2 ? `${digitos.slice(0, 2)}:${digitos.slice(2)}` : digitos;
}

export default function SeletorDatasOrdem({ entrada, previsao, aoMudarEntrada, aoMudarPrevisao, aoValidarPrevisao }: {
  entrada: string;
  previsao: string;
  aoMudarEntrada: (valor: string) => void;
  aoMudarPrevisao: (valor: string) => void;
  aoValidarPrevisao: (incompleta: boolean) => void;
}) {
  const [dataEntrada, setDataEntrada] = useState(() => mostrarData(entrada));
  const [horaEntrada, setHoraEntrada] = useState(() => entrada.slice(11));
  const [dataPrevisao, setDataPrevisao] = useState(() => mostrarData(previsao));
  const [horaPrevisao, setHoraPrevisao] = useState(() => previsao.slice(11) || '17:00');
  const [tocado, setTocado] = useState<Record<Campo, boolean>>({ entrada: false, previsao: false });
  const [aberto, setAberto] = useState(false);
  const [selecionando, setSelecionando] = useState<Campo>('entrada');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [mes, setMes] = useState(() => new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1, 12)));
  const [posicao, setPosicao] = useState({ top: 0, left: 0 });
  const campos = useRef<HTMLDivElement>(null);
  const calendario = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const posicionar = () => {
      const area = campos.current?.getBoundingClientRect();
      if (!area) return;
      const altura = calendario.current?.offsetHeight || 410;
      setPosicao({ left: Math.max(8, Math.min(area.left, window.innerWidth - 338)), top: Math.max(8, Math.min(area.bottom + 6, window.innerHeight - altura - 8)) });
    };
    const fechar = (evento: PointerEvent) => {
      if (!campos.current?.contains(evento.target as Node) && !calendario.current?.contains(evento.target as Node)) setAberto(false);
    };
    const teclado = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setAberto(false); };
    posicionar();
    document.addEventListener('pointerdown', fechar);
    window.addEventListener('keydown', teclado);
    window.addEventListener('resize', posicionar);
    document.addEventListener('scroll', posicionar, true);
    return () => { document.removeEventListener('pointerdown', fechar); window.removeEventListener('keydown', teclado); window.removeEventListener('resize', posicionar); document.removeEventListener('scroll', posicionar, true); };
  }, [aberto]);

  function atualizar(campo: Campo, data: string, hora: string) {
    const dia = dataIso(data);
    const valor = dia && horaValida(hora) ? `${dia}T${hora}` : '';
    if (campo === 'entrada') {
      setDataEntrada(data);
      setHoraEntrada(hora);
      aoMudarEntrada(valor);
    } else {
      setDataPrevisao(data);
      setHoraPrevisao(hora);
      aoMudarPrevisao(valor);
      aoValidarPrevisao(!!data && !valor);
    }
  }

  function abrir(campo: Campo) {
    if (aberto) { setSelecionando(campo); return; }
    const entradaAtual = dataIso(dataEntrada);
    const previsaoAtual = dataIso(dataPrevisao);
    const dataAlvo = campo === 'previsao' ? previsaoAtual || entradaAtual : entradaAtual;
    const data = dataAlvo ? new Date(`${dataAlvo}T12:00:00Z`) : new Date();
    setMes(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1, 12)));
    setInicio(entradaAtual);
    setFim(previsaoAtual);
    setSelecionando(campo);
    setAberto(true);
  }

  function selecionar(dia: string) {
    if (selecionando === 'entrada' || !inicio) {
      setInicio(dia);
      setFim('');
      setSelecionando('previsao');
    } else if (dia < inicio) {
      setInicio(dia);
      setFim('');
    } else {
      setFim(dia);
      setSelecionando('entrada');
    }
  }

  function aplicar() {
    atualizar('entrada', mostrarData(inicio), horaEntrada);
    atualizar('previsao', mostrarData(fim), horaPrevisao);
    setTocado({ entrada: true, previsao: !!fim });
    setAberto(false);
  }

  function erro(campo: Campo, data: string, hora: string) {
    if (!tocado[campo] || !data) return '';
    if (!dataIso(data)) return 'Use uma data válida: dd/mm/aaaa.';
    return horaValida(hora) ? '' : 'Use um horário válido: hh:mm.';
  }

  const erroEntrada = erro('entrada', dataEntrada, horaEntrada);
  const erroPrevisao = erro('previsao', dataPrevisao, horaPrevisao);
  return <div className="os-create-row os-create-dates" ref={campos}>
    {([['entrada', 'Entrada', dataEntrada, horaEntrada], ['previsao', 'Previsão de entrega', dataPrevisao, horaPrevisao]] as const).map(([campo, rotulo, data, hora]) => <div className="os-datas-campo os-create-field" key={campo}>
      <span>{rotulo}{campo === 'entrada' && <b> *</b>}</span>
      <div className="os-datas-campos"><div className="os-datas-data"><input aria-label={`${rotulo}: data`} inputMode="numeric" maxLength={10} placeholder="dd/mm/aaaa" value={data} onChange={evento => atualizar(campo, formatarData(evento.target.value), hora)} onBlur={() => setTocado(atual => ({ ...atual, [campo]: true }))}/><button type="button" aria-label={`Abrir calendário de ${rotulo.toLowerCase()}`} aria-expanded={aberto} onClick={() => abrir(campo)}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2.5" y="4" width="15" height="13.5" rx="2"/><path d="M6 2v4M14 2v4M2.5 8h15"/></svg></button></div>
        <input className="os-datas-hora" aria-label={`${rotulo}: horário`} inputMode="numeric" maxLength={5} placeholder="hh:mm" value={hora} onChange={evento => atualizar(campo, data, formatarHora(evento.target.value))} onBlur={() => setTocado(atual => ({ ...atual, [campo]: true }))}/>
      </div>
      {(campo === 'entrada' ? erroEntrada : erroPrevisao) && <small className="os-datas-erro" role="alert">{campo === 'entrada' ? erroEntrada : erroPrevisao}</small>}
    </div>)}
    {aberto && createPortal(<div ref={calendario} className="date-range-popover os-datas-calendario" style={posicao} role="dialog" aria-label="Selecionar entrada e previsão de entrega">
      <CalendarioMes mes={mes} aoMudarMes={setMes} aoSelecionar={selecionar} inicio={inicio} fim={fim} campos={<div className="range-fields"><button type="button" className={selecionando === 'entrada' ? 'field-selecting' : ''} onClick={() => setSelecionando('entrada')}>{inicio ? mostrarData(inicio) : 'Entrada'}</button><span>–</span><button type="button" className={selecionando === 'previsao' ? 'field-selecting' : ''} onClick={() => setSelecionando('previsao')}>{fim ? mostrarData(fim) : 'Previsão'}</button></div>}/>
      <div className="range-footer"><button type="button" onClick={() => setAberto(false)}>Cancelar</button><button type="button" className="range-clear" onClick={() => { atualizar('previsao', '', horaPrevisao); setAberto(false); }}>Limpar previsão</button><button type="button" className="range-save" disabled={!inicio} onClick={aplicar}>Salvar</button></div>
    </div>, document.body)}
  </div>;
}
