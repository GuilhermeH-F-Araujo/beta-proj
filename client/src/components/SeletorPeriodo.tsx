import { useEffect, useRef, useState } from 'react';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import { temRascunho } from '../services/rascunhos';
import './seletor-periodo.css';

export type DadosIntervalo = { from: string; to: string };
const iso = (dados: Date) => dados.toISOString().slice(0, 10);
const asDados = (valor: string) => new Date(`${valor}T12:00:00Z`);
const shiftMes = (dados: Date, por: number) =>
  new Date(Date.UTC(dados.getUTCFullYear(), dados.getUTCMonth() + por, 1, 12));
const dadosCurta = (valor: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(asDados(valor));
const campoDados = (valor: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(asDados(valor));

function SeletorIntervalo({
  value: valor,
  onApply: aoAplicar,
  variant: variante = 'default',
  label: rotulo = 'Período de entrada',
  placeholder: textoAjuda = 'Período de entrada',
  autoOpen: autoAberto = false,
}: {
  value: DadosIntervalo | null;
  onApply: (valor: DadosIntervalo | null) => void;
  variant?: 'default' | 'fields';
  label?: string;
  placeholder?: string;
  autoOpen?: boolean;
}) {
  const [aberto, setAberto] = useState(autoAberto);
  const [mes, setMes] = useState(() => shiftMes(new Date(), 0));
  const [inicio, setInicio] = useEstadoRascunho(
    `periodo-${window.location.pathname}-${rotulo}`,
    'start',
    valor?.from ??
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
  );
  const [fim, setFim] = useEstadoRascunho(
    `periodo-${window.location.pathname}-${rotulo}`,
    'end',
    valor?.to ??
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
  );
  const [selecionando, setSelecionando] = useState<'start' | 'end'>('start');
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    };
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        evento.stopPropagation();
        setAberto(false);
      }
    };
    document.addEventListener('pointerdown', fora);
    window.addEventListener('keydown', escapar);
    return () => {
      document.removeEventListener('pointerdown', fora);
      window.removeEventListener('keydown', escapar);
    };
  }, [aberto]);

  function alternar(destino: 'start' | 'end' = 'start') {
    if (aberto) {
      setAberto(false);
      return;
    }
    const pecas = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const parte = (tipo: string) => Number(pecas.find((item) => item.type === tipo)?.value);
    const hoje = new Date(Date.UTC(parte('year'), parte('month') - 1, parte('day'), 12));
    const recente = new Date(hoje);
    recente.setUTCDate(hoje.getUTCDate() - 7);
    if (!temRascunho(`periodo-${window.location.pathname}-${rotulo}`, 'start'))
      setInicio(valor?.from ?? iso(recente));
    if (!temRascunho(`periodo-${window.location.pathname}-${rotulo}`, 'end'))
      setFim(valor?.to ?? iso(hoje));
    setMes(shiftMes(valor ? asDados(valor.to) : hoje, 0));
    setSelecionando(destino);
    setAberto(true);
  }
  function escolher(dia: string) {
    if (selecionando === 'start' || !inicio) {
      setInicio(dia);
      setFim('');
      setSelecionando('end');
    } else if (dia < inicio) {
      setInicio(dia);
      setFim('');
    } else {
      setFim(dia);
      setSelecionando('start');
    }
  }
  const primeiro = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), 1, 12));
  const deslocamento = (primeiro.getUTCDay() + 6) % 7;
  const dias = Array.from(
    { length: 42 },
    (_, indice) =>
      new Date(
        Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth(), indice - deslocamento + 1, 12),
      ),
  );
  const titulo = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(primeiro);
  return (
    <div className={`period-picker${variante === 'fields' ? ' period-fields' : ''}`} ref={raiz}>
      {variante === 'fields' ? (
        <>
          <div className="period-field">
            <span>Data inicial</span>
            <button
              type="button"
              onClick={() => alternar('start')}
              aria-haspopup="dialog"
              aria-expanded={aberto}
              aria-label="Selecionar data inicial"
            >
              {valor ? campoDados(valor.from) : 'dd/mm/aaaa'}
              <svg
                width="13"
                height="13"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="2.5" y="4" width="15" height="13.5" rx="2" />
                <path d="M6 2v4M14 2v4M2.5 8h15" />
              </svg>
            </button>
          </div>
          <div className="period-field">
            <span>Data final</span>
            <button
              type="button"
              onClick={() => alternar('end')}
              aria-haspopup="dialog"
              aria-expanded={aberto}
              aria-label="Selecionar data final"
            >
              {valor ? campoDados(valor.to) : 'dd/mm/aaaa'}
              <svg
                width="13"
                height="13"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="2.5" y="4" width="15" height="13.5" rx="2" />
                <path d="M6 2v4M14 2v4M2.5 8h15" />
              </svg>
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className={`period-trigger${valor ? ' period-active' : ''}`}
          onClick={() => alternar()}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-label={rotulo}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="2.5" y="4" width="15" height="13.5" rx="2" />
            <path d="M6 2v4M14 2v4M2.5 8h15" />
          </svg>
          <span>{valor ? `${dadosCurta(valor.from)} – ${dadosCurta(valor.to)}` : textoAjuda}</span>
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      )}
      {aberto && (
        <div className="date-range-popover" role="dialog" aria-label={rotulo}>
          <div className="range-month">
            <button
              type="button"
              onClick={() => setMes(shiftMes(mes, -1))}
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <strong>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</strong>
            <button type="button" onClick={() => setMes(shiftMes(mes, 1))} aria-label="Próximo mês">
              ›
            </button>
          </div>
          <div className="range-fields">
            <button
              type="button"
              className={selecionando === 'start' ? 'field-selecting' : ''}
              onClick={() => setSelecionando('start')}
            >
              {inicio ? dadosCurta(inicio) : 'Início'}
            </button>
            <span>–</span>
            <button
              type="button"
              className={selecionando === 'end' ? 'field-selecting' : ''}
              onClick={() => setSelecionando('end')}
            >
              {fim ? dadosCurta(fim) : 'Fim'}
            </button>
          </div>
          <div className="range-weekdays">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((dia) => (
              <span key={dia}>{dia}</span>
            ))}
          </div>
          <div className="range-days">
            {dias.map((dia) => {
              const dados = iso(dia);
              const rota = dados === inicio || dados === fim;
              return (
                <button
                  type="button"
                  key={dados}
                  className={`${dia.getUTCMonth() !== primeiro.getUTCMonth() ? 'outside-month ' : ''}${dados > inicio && dados < fim ? 'inside-range ' : ''}${rota ? 'range-endpoint' : ''}`}
                  aria-label={new Intl.DateTimeFormat('pt-BR', {
                    timeZone: 'UTC',
                    dateStyle: 'full',
                  }).format(dia)}
                  aria-pressed={rota}
                  onClick={() => escolher(dados)}
                >
                  {dia.getUTCDate()}
                </button>
              );
            })}
          </div>
          <div className="range-footer">
            <button type="button" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            {valor && (
              <button
                type="button"
                className="range-clear"
                onClick={() => {
                  aoAplicar(null);
                  setAberto(false);
                }}
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              className="range-save"
              disabled={!inicio || !fim}
              onClick={() => {
                aoAplicar({ from: inicio, to: fim });
                setAberto(false);
              }}
            >
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type IntervaloPropriedades = {
  mode?: 'range';
  value: DadosIntervalo | null;
  onApply: (valor: DadosIntervalo | null) => void;
  variant?: 'default' | 'fields';
  label?: string;
  placeholder?: string;
  autoOpen?: boolean;
};
type MesPropriedades = {
  mode: 'month';
  value: string;
  onApply: (valor: string) => void;
  label?: string;
};

/** Usa o mesmo seletor de periodo existente e mantem o mes como filtro de dados. */
export default function SeletorPeriodo(props: IntervaloPropriedades | MesPropriedades) {
  return props.mode === 'month' ? <SeletorMes {...props} /> : <SeletorIntervalo {...props} />;
}

function periodoDoMes(valor: string): DadosIntervalo {
  const [ano, mes] = valor.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { from: `${valor}-01`, to: `${valor}-${String(ultimoDia).padStart(2, '0')}` };
}

function SeletorMes({
  value: valor,
  onApply: aoAplicar,
  label: rotulo = 'Período dos indicadores',
}: MesPropriedades) {
  const [periodo, setPeriodo] = useState(() => periodoDoMes(valor));
  const atualValor = useRef(valor);
  useEffect(() => {
    if (atualValor.current !== valor) {
      atualValor.current = valor;
      setPeriodo(periodoDoMes(valor));
    }
  }, [valor]);
  return (
    <SeletorIntervalo
      label={rotulo}
      value={periodo}
      onApply={(continuar) => {
        if (!continuar) return;
        setPeriodo(continuar);
        const primeiroMes = continuar.from.slice(0, 7);
        atualValor.current = primeiroMes;
        aoAplicar(primeiroMes);
      }}
    />
  );
}
