import { useFocoModal } from '../hooks/useFocoModal';
import IconeCadastro from '../components/IconeCadastro';
import CartaoIndicador from '../components/CartaoIndicador';
import { usePesquisaPagina } from '../hooks/usePesquisaPagina';
import { useCartaoVisivel } from '../hooks/useCartoesPagina';
import { useAtalhoPagina } from '../hooks/useAtalhoPagina';
import { useDadosVivos } from '../hooks/useDadosVivos';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import ConteudoCarregando from '../components/ConteudoCarregando';
import { Icone } from '../components/MenuAdmin';
import SeletorFiltro from '../components/SeletorFiltro';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import { pode } from '../services/acessoConta';
import {
  atualizarCatalogoCompartilhado,
  lerCatalogoServicos,
  observarCatalogoServicos,
  salvarCatalogoServicos,
  type CategoriaServico,
  type ItemCatalogoServico,
} from '../services/catalogoServicos';
import { limparRascunho } from '../services/rascunhos';
import { correspondeBusca } from '../utils/buscaAproximada';
import './ordens-servico.css';
import './servicos.css';

type SituacaoFiltro = 'todos' | 'ativos' | 'inativos';
const iconeOpcoes: [string, string, string][] = [
  ['wrench', 'Ferramenta', 'Ferramentas'],
  ['bike', 'Motocicleta', 'Veículos'],
  ['gauge', 'Freio e medição', 'Veículos'],
  ['settings', 'Engrenagem', 'Ferramentas'],
  ['activity', 'Diagnóstico', 'Elétrica'],
  ['refresh', 'Transmissão', 'Ferramentas'],
  ['check', 'Conferência', 'Todos'],
  ['clipboard-check', 'Revisão', 'Todos'],
  ['clock', 'Tempo', 'Todos'],
  ['package', 'Peças', 'Todos'],
  ['card', 'Bateria', 'Elétrica'],
  ['filter', 'Injeção', 'Elétrica'],
  ['trending', 'Ajuste', 'Ferramentas'],
  ['camera', 'Inspeção', 'Todos'],
  ['briefcase', 'Serviço', 'Todos'],
  ['star', 'Destaque', 'Todos'],
  ['pin', 'Localização', 'Todos'],
  ['phone', 'Contato', 'Todos'],
];
const paleta = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#EAB308',
  '#22C55E',
  '#10B981',
  '#06B6D4',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#172033',
];
const hsvParaHexadecimal = (alturaAtual: number, textoAtual: number, valorAtual: number) => {
  textoAtual /= 100;
  valorAtual /= 100;
  const elementoAtual = valorAtual * textoAtual;
  const itemAtual = elementoAtual * (1 - Math.abs(((alturaAtual / 60) % 2) - 1));
  const mesAtual = valorAtual - elementoAtual;
  const [resultadoAtual, grupoAtual, segundoElemento] =
    alturaAtual < 60
      ? [elementoAtual, itemAtual, 0]
      : alturaAtual < 120
        ? [itemAtual, elementoAtual, 0]
        : alturaAtual < 180
          ? [0, elementoAtual, itemAtual]
          : alturaAtual < 240
            ? [0, itemAtual, elementoAtual]
            : alturaAtual < 300
              ? [itemAtual, 0, elementoAtual]
              : [elementoAtual, 0, itemAtual];
  const hex = (numero: number) =>
    Math.round((numero + mesAtual) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(resultadoAtual)}${hex(grupoAtual)}${hex(segundoElemento)}`.toUpperCase();
};
const hexadecimalParaHsv = (hex: string): [number, number, number] => {
  const bruto = hex.replace('#', '');
  const resultadoAtual = parseInt(bruto.slice(0, 2), 16) / 255;
  const grupoAtual = parseInt(bruto.slice(2, 4), 16) / 255;
  const segundoElemento = parseInt(bruto.slice(4, 6), 16) / 255;
  const maximo = Math.max(resultadoAtual, grupoAtual, segundoElemento);
  const minimo = Math.min(resultadoAtual, grupoAtual, segundoElemento);
  const diferenca = maximo - minimo;
  let alturaAtual = 0;
  if (diferenca)
    alturaAtual =
      maximo === resultadoAtual
        ? 60 * (((grupoAtual - segundoElemento) / diferenca) % 6)
        : maximo === grupoAtual
          ? 60 * ((segundoElemento - resultadoAtual) / diferenca + 2)
          : 60 * ((resultadoAtual - grupoAtual) / diferenca + 4);
  return [(alturaAtual + 360) % 360, maximo ? (diferenca / maximo) * 100 : 0, maximo * 100];
};
const moeda = (valor: number) =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const classeSituacao = (valor: boolean) => (valor ? 'active' : 'inactive');
type SeletorOpcao = { value: string; label: string; icon?: string; color?: string };
function SeletorEstilizado({
  value: valor,
  onChange: aoAlterar,
  options: opcoes,
  placeholder: textoAjuda,
  leadingIcon: leadingIcone = 'chevron',
  className: nomeClasse = '',
  emptyMessage: mensagemVazia,
}: {
  value: string;
  onChange: (valor: string) => void;
  options: SeletorOpcao[];
  placeholder: string;
  leadingIcon?: string;
  className?: string;
  emptyMessage?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const selecionado = opcoes.find((opcao) => opcao.value === valor);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (evento: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAberto(false);
    };
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', escapar);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', escapar);
    };
  }, [aberto]);
  return (
    <div className={`styled-dropdown ${nomeClasse}`} ref={raiz}>
      <button
        type="button"
        className="styled-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onKeyDown={(evento) => {
          if (evento.key === 'ArrowDown') {
            evento.preventDefault();
            setAberto(true);
            requestAnimationFrame(() =>
              raiz.current?.querySelector<HTMLButtonElement>('[role=option]')?.focus(),
            );
          }
        }}
        onClick={() => setAberto((valor) => !valor)}
      >
        {selecionado?.icon ? (
          <span
            className="styled-dropdown-option-icon"
            style={{
              color: selecionado.color ?? '#65758a',
              backgroundColor: `${selecionado.color ?? '#65758a'}18`,
            }}
          >
            <CategoriaIcone name={selecionado.icon} size={16} />
          </span>
        ) : (
          <Icone name={leadingIcone} size={16} />
        )}
        <span className={`styled-dropdown-label${selecionado ? '' : ' placeholder'}`}>
          {selecionado?.label ?? textoAjuda}
        </span>
        <span className="styled-dropdown-chevron">
          <Icone name="chevron" size={15} />
        </span>
      </button>
      {aberto && (
        <div
          className="styled-dropdown-menu"
          role="listbox"
          onKeyDown={(evento) => {
            const itens = Array.from(
              raiz.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [],
            );
            const indice = itens.indexOf(document.activeElement as HTMLButtonElement);
            if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
              evento.preventDefault();
              itens[
                (indice + (evento.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length
              ]?.focus();
            }
            if (evento.key === 'Escape') {
              setAberto(false);
              raiz.current?.querySelector<HTMLButtonElement>('button')?.focus();
            }
          }}
        >
          {!opcoes.length ? (
            <div className="styled-dropdown-empty" role="status">
              {mensagemVazia ?? 'Nenhuma opção cadastrada.'}
            </div>
          ) : (
            opcoes.map((opcao) => (
              <button
                type="button"
                role="option"
                aria-selected={opcao.value === valor}
                key={opcao.value}
                className={`styled-dropdown-option${opcao.value === valor ? ' selected' : ''}`}
                onClick={() => {
                  aoAlterar(opcao.value);
                  setAberto(false);
                  raiz.current?.querySelector<HTMLButtonElement>('button')?.focus();
                }}
              >
                {opcao.icon ? (
                  <span
                    className="styled-dropdown-option-icon"
                    style={{
                      color: opcao.color ?? '#65758a',
                      backgroundColor: `${opcao.color ?? '#65758a'}18`,
                    }}
                  >
                    <CategoriaIcone name={opcao.icon} size={16} />
                  </span>
                ) : (
                  <span className="styled-dropdown-option-icon neutral">
                    <Icone name={leadingIcone === 'clock' ? 'clock' : 'check'} size={15} />
                  </span>
                )}
                <span>{opcao.label}</span>
                {opcao.value === valor && (
                  <span className="styled-dropdown-check">
                    <Icone name="check" size={15} />
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
function CategoriaSelecionar({
  value: valor,
  onChange: aoAlterar,
  categories: categoriasLocal,
  placeholder: textoAjuda = 'Selecione uma categoria',
}: {
  value: string;
  onChange: (valor: string) => void;
  categories: CategoriaServico[];
  placeholder?: string;
}) {
  return (
    <SeletorEstilizado
      value={valor}
      onChange={aoAlterar}
      placeholder={textoAjuda}
      leadingIcon="filter"
      emptyMessage="Nenhuma categoria cadastrada no banco. Crie uma categoria para relacionar o serviço."
      options={categoriasLocal.map((categoria) => ({
        value: categoria.id,
        label: categoria.nome,
        icon: categoria.icone,
        color: categoria.cor,
      }))}
    />
  );
}
function DuracaoSelecionar({
  value: valor,
  onChange: aoAlterar,
}: {
  value: string;
  onChange: (valor: string) => void;
}) {
  const [customAberto, setCustomAberto] = useState(false);
  const [horas, setHoras] = useEstadoRascunho('servico-duracao', 'hours', '');
  const [minutos, setMinutos] = useEstadoRascunho('servico-duracao', 'minutes', '');
  const duracoes: [string, string][] = [
    ['15 min', '15 min'],
    ['20 min', '20 min'],
    ['30 min', '30 min'],
    ['45 min', '45 min'],
    ['1h', '1 hora'],
    ['1h 30min', '1h 30min'],
    ['2h', '2 horas'],
    ['3h', '3 horas'],
  ];
  const ehCustom = valor !== '' && !duracoes.some(([opcao]) => opcao === valor);
  const opcoes = [
    ...duracoes.map(([opcao, rotulo]) => ({
      value: opcao,
      label: rotulo,
      icon: 'clock',
      color: '#5B7FA6',
    })),
    ...(ehCustom && valor !== 'Personalizado'
      ? [{ value: valor, label: valor, icon: 'clock', color: '#5B7FA6' }]
      : []),
    { value: 'Personalizado', label: 'Personalizado', icon: 'clock', color: '#5B7FA6' },
  ];
  function selecionarDuracao(continuar: string) {
    if (continuar !== 'Personalizado') {
      aoAlterar(continuar);
      return;
    }
    const correspondencia = valor.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?$/i);
    setHoras(correspondencia?.[1] ?? '');
    setMinutos(correspondencia?.[2] ?? '');
    setCustomAberto(true);
  }
  function salvarCustom() {
    const alturaAtual = Math.min(24, Math.max(0, Number(horas) || 0));
    const mesAtual = Math.min(59, Math.max(0, Number(minutos) || 0));
    if (!alturaAtual && !mesAtual) return;
    const formatado = [alturaAtual ? `${alturaAtual}h` : '', mesAtual ? `${mesAtual}min` : '']
      .filter(Boolean)
      .join(' ');
    aoAlterar(formatado);
    setCustomAberto(false);
  }
  return (
    <>
      <SeletorEstilizado
        value={valor}
        onChange={selecionarDuracao}
        placeholder="Selecione o tempo"
        leadingIcon="clock"
        options={opcoes}
      />
      {customAberto && (
        <div
          className="services-modal-backdrop custom-time-backdrop"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) setCustomAberto(false);
          }}
        >
          <section
            className="custom-time-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-time-title"
          >
            <header>
              <span>
                <Icone name="clock" size={21} />
              </span>
              <div>
                <h3 id="custom-time-title">Definir tempo personalizado</h3>
                <p>Informe quanto tempo este serviço costuma levar.</p>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setCustomAberto(false)}>
                <Icone name="close" size={17} />
              </button>
            </header>
            <div className="custom-time-fields">
              <label>
                <span>Horas</span>
                <div>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    max="24"
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    value={horas}
                    onChange={(evento) => setHoras(evento.target.value)}
                  />
                  <small>h</small>
                </div>
              </label>
              <b className="custom-time-separator">:</b>
              <label>
                <span>Minutos</span>
                <div>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    inputMode="numeric"
                    placeholder="00"
                    value={minutos}
                    onChange={(evento) => setMinutos(evento.target.value)}
                  />
                  <small>min</small>
                </div>
              </label>
            </div>
            <div className="custom-time-preview">
              <Icone name="clock" size={17} />
              <span>Duração estimada</span>
              <strong>
                {Number(horas) || Number(minutos)
                  ? [
                      Number(horas) ? `${Number(horas)}h` : '',
                      Number(minutos) ? `${Number(minutos)}min` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  : 'Defina horas e minutos'}
              </strong>
            </div>
            <footer>
              <button
                type="button"
                className="services-btn secondary"
                onClick={() => setCustomAberto(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="services-btn primary"
                disabled={!Number(horas) && !Number(minutos)}
                onClick={salvarCustom}
              >
                <Icone name="check" size={15} />
                Aplicar duração
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
function CategoriaIcone({ name: nomeLocal, size: tamanho = 16 }: { name: string; size?: number }) {
  return /^https:\/\//i.test(nomeLocal) ? (
    <img
      className="services-external-icon"
      src={nomeLocal}
      width={tamanho}
      height={tamanho}
      alt=""
      loading="lazy"
    />
  ) : (
    <Icone name={nomeLocal} size={tamanho} />
  );
}
function IconeSeletor({
  value: valor,
  onClose: aoFechar,
  onSelect: aoSelecionar,
}: {
  value: string;
  onClose: () => void;
  onSelect: (iconeLocal: string) => void;
}) {
  const [consulta, setConsulta] = useState('');
  const [aba, setAba] = useState('Todos');
  const [selecionado, setSelecionado] = useState(valor);
  const [svgUrl, setSvgUrl] = useState(/^https:\/\//i.test(valor) ? valor : '');
  const focoIcones = useFocoModal<HTMLElement>();
  const [urlErro, setUrlErro] = useState('');
  const filtrado = iconeOpcoes.filter(
    ([iconeLocal, rotulo, grupo]) =>
      (aba === 'Todos' || grupo === aba) && correspondeBusca(consulta, `${rotulo} ${iconeLocal}`),
  );
  return (
    <div
      className="services-modal-backdrop icon-picker-backdrop"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <section
        className="icon-picker-modal"
        ref={focoIcones}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="icon-picker-title"
      >
        <header>
          <h3 id="icon-picker-title">Escolher ícone</h3>
          <button type="button" aria-label="Fechar" onClick={aoFechar}>
            <Icone name="close" size={15} />
          </button>
        </header>
        <div className="icon-picker-tabs">
          <span>
            <Icone name="dashboard" size={13} /> Ícones
          </span>
        </div>
        <label className="icon-picker-search">
          <Icone name="search" size={15} />
          <input
            autoFocus
            placeholder="Buscar ícones..."
            value={consulta}
            onChange={(evento) => setConsulta(evento.target.value)}
          />
        </label>
        <nav className="icon-picker-categories">
          {['Todos', 'Veículos', 'Ferramentas', 'Elétrica'].map((item) => (
            <button
              type="button"
              key={item}
              className={aba === item ? 'selected' : ''}
              onClick={() => setAba(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="icon-picker-grid">
          {filtrado.map(([iconeLocal, rotulo]) => (
            <button
              type="button"
              key={iconeLocal}
              title={rotulo}
              aria-label={rotulo}
              className={selecionado === iconeLocal ? 'selected' : ''}
              onClick={() => {
                setSelecionado(iconeLocal);
                setSvgUrl('');
                setUrlErro('');
              }}
            >
              <Icone name={iconeLocal} size={19} />
            </button>
          ))}
        </div>
        <label className="icon-picker-link">
          <span>
            <Icone name="download" size={15} />
            <b>Adicionar link do SVG</b>
            <small>Cole um endereço HTTPS de arquivo SVG</small>
          </span>
          <input
            placeholder="https://exemplo.com/icone.svg"
            type="url"
            value={svgUrl}
            onChange={(evento) => {
              const continuar = evento.target.value;
              setSvgUrl(continuar);
              setUrlErro(
                continuar && !/^https:\/\//i.test(continuar) ? 'Use um endereço HTTPS válido.' : '',
              );
            }}
          />
          {urlErro && <small className="icon-picker-error">{urlErro}</small>}
        </label>
        <footer>
          <button type="button" className="services-btn secondary" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="services-btn primary"
            disabled={!!urlErro}
            onClick={() => aoSelecionar(svgUrl.trim() || selecionado)}
          >
            Confirmar
          </button>
        </footer>
      </section>
    </div>
  );
}
function CorSeletor({
  value: valor,
  onChange: aoAlterar,
}: {
  value: string;
  onChange: (corLocal: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [matiz, setMatiz] = useState(() => hexadecimalParaHsv(valor)[0]);
  const [saturacao, setSaturacao] = useState(() => hexadecimalParaHsv(valor)[1]);
  const [brilho, setBrilho] = useState(() => hexadecimalParaHsv(valor)[2]);
  const [hexTexto, setHexTexto] = useState(valor.toUpperCase());
  const containerCor = useRef<HTMLDivElement>(null);
  const painelCor = useRef<HTMLDivElement>(null);
  const [posicaoPainel, setPosicaoPainel] = useState<{ top: number; left: number } | null>(null);
  const [recente, setRecente] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('estacao-servicos-recent-colors') || '[]') as string[];
    } catch {
      return [];
    }
  });
  const entradaHexadecimal = useRef<HTMLInputElement>(null);
  useEffect(() => setHexTexto(valor.toUpperCase()), [valor]);
  useLayoutEffect(() => {
    if (!aberto) {
      setPosicaoPainel(null);
      return;
    }
    const posicionar = () => {
      const ancora = containerCor.current?.getBoundingClientRect();
      const painel = painelCor.current;
      if (!ancora || !painel) return;
      const largura = painel.offsetWidth || Math.min(370, window.innerWidth - 24);
      const altura = painel.offsetHeight || 560;
      const direita = ancora.right + 10;
      const esquerda = ancora.left - largura - 10;
      const left =
        direita + largura <= window.innerWidth - 12
          ? direita
          : esquerda >= 12
            ? esquerda
            : Math.max(12, Math.min(direita, window.innerWidth - largura - 12));
      const top = Math.max(12, Math.min(ancora.top, window.innerHeight - altura - 12));
      setPosicaoPainel((anterior) =>
        anterior?.top === top && anterior.left === left ? anterior : { top, left },
      );
    };
    posicionar();
    const observer = new ResizeObserver(posicionar);
    if (containerCor.current) observer.observe(containerCor.current);
    if (painelCor.current) observer.observe(painelCor.current);
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    function fecharFora(evento: MouseEvent) {
      if (evento.target instanceof Node && !containerCor.current?.contains(evento.target))
        setAberto(false);
    }
    document.addEventListener('mousedown', fecharFora);
    return () => document.removeEventListener('mousedown', fecharFora);
  }, [aberto]);
  function escolher(corLocal: string) {
    const normalizado = corLocal.toUpperCase();
    const [continuarMatiz, continuarSaturacao, continuarBrilho] = hexadecimalParaHsv(normalizado);
    setMatiz(continuarMatiz);
    setSaturacao(continuarSaturacao);
    setBrilho(continuarBrilho);
    setHexTexto(normalizado);
    aoAlterar(normalizado);
    setRecente((anterior) => {
      const continuar = [
        normalizado,
        ...anterior.filter((item) => item.toUpperCase() !== normalizado),
      ].slice(0, 5);
      localStorage.setItem('estacao-servicos-recent-colors', JSON.stringify(continuar));
      return continuar;
    });
  }
  function selecionarPlano(evento: ReactPointerEvent<HTMLButtonElement>) {
    const retangulo = evento.currentTarget.getBoundingClientRect();
    const saturacaoAtual = Math.max(
      0,
      Math.min(100, ((evento.clientX - retangulo.left) / retangulo.width) * 100),
    );
    const brilhoAtual =
      100 - Math.max(0, Math.min(100, ((evento.clientY - retangulo.top) / retangulo.height) * 100));
    setSaturacao(saturacaoAtual);
    setBrilho(brilhoAtual);
    escolher(hsvParaHexadecimal(matiz, saturacaoAtual, brilhoAtual));
  }
  function limparRecente() {
    setRecente([]);
    localStorage.removeItem('estacao-servicos-recent-colors');
  }
  function atualizarHex(texto: string) {
    setHexTexto(texto);
    const candidato = texto.startsWith('#') ? texto : `#${texto}`;
    if (/^#[0-9a-f]{6}$/i.test(candidato)) {
      escolher(candidato);
    } else if (/^#[0-9a-f]{3}$/i.test(candidato)) {
      escolher(
        `#${candidato[1]}${candidato[1]}${candidato[2]}${candidato[2]}${candidato[3]}${candidato[3]}`,
      );
    }
  }
  const recenteCores = recente.length ? recente : paleta.slice(0, 5);
  return (
    <div className="services-color-wrap" ref={containerCor}>
      <button
        type="button"
        className="services-color-trigger"
        aria-expanded={aberto}
        onClick={() => setAberto((valorAtual) => !valorAtual)}
      >
        <i style={{ backgroundColor: valor }} />
        <span>{valor.toUpperCase()}</span>
        <Icone name="chevron" size={13} />
      </button>
      {aberto && (
        <div
          ref={painelCor}
          className="services-color-popover"
          style={
            posicaoPainel
              ? {
                  position: 'fixed',
                  top: posicaoPainel.top,
                  left: posicaoPainel.left,
                  bottom: 'auto',
                  right: 'auto',
                }
              : undefined
          }
        >
          <header>
            <strong>Escolha uma cor</strong>
            <button
              type="button"
              aria-label="Fechar seletor de cor"
              onClick={() => setAberto(false)}
            >
              <Icone name="close" size={13} />
            </button>
          </header>
          <button
            type="button"
            className="color-plane"
            style={{ backgroundColor: `hsl(${matiz} 100% 50%)` }}
            aria-label="Escolher saturação e luminosidade"
            onPointerDown={(evento) => {
              evento.currentTarget.setPointerCapture(evento.pointerId);
              selecionarPlano(evento);
            }}
            onPointerMove={(evento) => {
              if (evento.buttons === 1) selecionarPlano(evento);
            }}
          >
            <i
              style={{
                left: `${Math.max(2, Math.min(98, saturacao))}%`,
                top: `${Math.max(2, Math.min(98, 100 - brilho))}%`,
              }}
            />
          </button>
          <input
            className="color-hue"
            aria-label="Matiz"
            type="range"
            min="0"
            max="360"
            value={matiz}
            onChange={(evento) => {
              const continuar = Number(evento.target.value);
              setMatiz(continuar);
              escolher(hsvParaHexadecimal(continuar, saturacao, brilho));
            }}
          />
          <label className="color-current">
            <i style={{ backgroundColor: valor }} />
            <input
              ref={entradaHexadecimal}
              aria-label="Código hexadecimal da cor"
              value={hexTexto}
              maxLength={7}
              spellCheck={false}
              onChange={(evento) => atualizarHex(evento.target.value)}
            />
            <Icone name="chevron" size={13} />
          </label>
          <div className="color-swatches">
            {['#EF4444', '#172033', '#F43F46', '#1684FF'].map((corLocal) => (
              <button
                type="button"
                key={corLocal}
                aria-label={`Usar cor ${corLocal}`}
                title={corLocal}
                className={valor.toUpperCase() === corLocal ? 'selected' : ''}
                style={{ backgroundColor: corLocal }}
                onClick={() => escolher(corLocal)}
              />
            ))}
          </div>
          <div className="color-recent">
            <span>Cores recentes</span>
            <div>
              {recenteCores.map((corLocal, indice) => (
                <button
                  type="button"
                  key={`${corLocal}-${indice}`}
                  aria-label={`Cor recente ${corLocal}`}
                  title={corLocal}
                  className={valor.toUpperCase() === corLocal.toUpperCase() ? 'selected' : ''}
                  style={{ backgroundColor: corLocal }}
                  onClick={() => escolher(corLocal)}
                />
              ))}
            </div>
            <button
              type="button"
              className="color-clear-recent"
              aria-label="Limpar cores recentes"
              title="Limpar cores recentes"
              onClick={limparRecente}
            >
              <Icone name="trash" size={14} />
            </button>
          </div>
          <button
            type="button"
            className="color-native-label"
            onClick={() => entradaHexadecimal.current?.focus()}
          >
            <span>
              <Icone name="activity" size={15} />
              Mais cores
            </span>
            <i aria-hidden="true" style={{ backgroundColor: valor }} />
          </button>
        </div>
      )}
    </div>
  );
}
function gerarIdCatalogo(prefixo: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return prefixo + '-' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function CategoriaModal({
  value: valor,
  onClose: aoFechar,
  onSave: aoSalvar,
}: {
  value?: CategoriaServico;
  onClose: () => void;
  onSave: (categoria: CategoriaServico) => Promise<void>;
}) {
  const [nomeLocal, setNome] = useEstadoRascunho(
    `categoria-${valor?.id ?? 'nova'}`,
    'name',
    valor?.nome ?? '',
  );
  const [descricaoLocal, setDescricao] = useEstadoRascunho(
    `categoria-${valor?.id ?? 'nova'}`,
    'description',
    valor?.descricao ?? '',
  );
  const [corLocal, setCor] = useEstadoRascunho(
    `categoria-${valor?.id ?? 'nova'}`,
    'color',
    valor?.cor ?? '#EF4444',
  );
  const [iconeLocal, setIcone] = useEstadoRascunho(
    `categoria-${valor?.id ?? 'nova'}`,
    'icon',
    valor?.icone ?? 'wrench',
  );
  const [iconeAberto, setIconeAberto] = useState(false);
  const focoCategoria = useFocoModal<HTMLFormElement>(!iconeAberto);
  const [erro, setErro] = useState('');
  const [salvandoCategoria, setSalvandoCategoria] = useState(false);
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (salvandoCategoria) return;
    if (!nomeLocal.trim()) {
      setErro('Informe o nome da categoria.');
      return;
    }
    setErro('');
    setSalvandoCategoria(true);
    try {
      await aoSalvar({
        id: valor?.id ?? gerarIdCatalogo('cat'),
        nome: nomeLocal.trim(),
        descricao: descricaoLocal.trim(),
        cor: corLocal,
        icone: iconeLocal,
      });
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar a categoria.');
    } finally {
      setSalvandoCategoria(false);
    }
  }
  return (
    <div
      className={`services-modal-backdrop${iconeAberto ? ' category-picker-open' : ''}`}
      onMouseDown={(evento) => {
        if (
          evento.target === evento.currentTarget &&
          !evento.currentTarget.querySelector('.services-color-popover') &&
          !salvandoCategoria
        )
          aoFechar();
      }}
    >
      <form
        className="category-modal"
        ref={focoCategoria}
        tabIndex={-1}
        style={{ visibility: iconeAberto ? 'hidden' : undefined }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-modal-title"
        onSubmit={enviar}
      >
        <header className="category-modal-head">
          <span className="category-modal-mark">
            <Icone name="pin" size={18} />
          </span>
          <div>
            <h2 id="category-modal-title">
              {valor ? 'Editar categoria' : 'Nova categoria de serviço'}
            </h2>
            <p>Preencha as informações abaixo para criar uma nova categoria.</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={aoFechar}>
            <Icone name="close" size={15} />
          </button>
        </header>
        <div className="category-modal-body">
          <label className="services-field">
            <span>
              Nome da categoria <b>*</b>
            </span>
            <input
              autoFocus
              required
              maxLength={50}
              placeholder="Ex.: Mecânica, Elétrica, Funilaria..."
              value={nomeLocal}
              onChange={(evento) => setNome(evento.target.value)}
            />
          </label>
          <label className="services-field">
            <span>
              Descrição <small>(opcional)</small>
            </span>
            <textarea
              maxLength={200}
              placeholder="Adicione uma breve descrição sobre esta categoria..."
              value={descricaoLocal}
              onChange={(evento) => setDescricao(evento.target.value)}
            />
            <em>{descricaoLocal.length}/200</em>
          </label>
          <div className="category-modal-row">
            <div className="services-field">
              <span>
                Cor da categoria <b>*</b>
              </span>
              <CorSeletor value={corLocal} onChange={setCor} />
            </div>
            <div className="services-field">
              <span>
                Ícone da categoria <b>*</b>
              </span>
              <button
                type="button"
                className="category-icon-control"
                onClick={() => setIconeAberto(true)}
              >
                <span>
                  <CategoriaIcone name={iconeLocal} size={16} />
                </span>
                <b>
                  {iconeOpcoes.find(([chave]) => chave === iconeLocal)?.[1] ?? 'Ícone selecionado'}
                </b>
                <Icone name="chevron" size={13} />
              </button>
            </div>
          </div>
          <div className="category-preview-label">Visualização</div>
          <div className="category-preview">
            <span style={{ color: corLocal, backgroundColor: `${corLocal}20` }}>
              <CategoriaIcone name={iconeLocal} size={17} />
            </span>
            <div>
              <strong>{nomeLocal.trim() || 'Nome da categoria'}</strong>
              <small>{descricaoLocal.trim() || 'Serviços relacionados a esta categoria.'}</small>
            </div>
          </div>
          {erro && (
            <p className="services-form-error" role="alert">
              {erro}
            </p>
          )}
        </div>
        <footer className="category-modal-footer">
          <button type="button" className="services-btn secondary" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="services-btn primary" disabled={salvandoCategoria}>
            {salvandoCategoria ? 'Salvando…' : 'Salvar categoria'}
          </button>
        </footer>
        {iconeAberto && (
          <IconeSeletor
            value={iconeLocal}
            onClose={() => setIconeAberto(false)}
            onSelect={(selecionado) => {
              setIcone(selecionado);
              setIconeAberto(false);
            }}
          />
        )}
      </form>
    </div>
  );
}
function ServicoLinhaIcone({ icon: iconeLocal, color: corLocal }: { icon: string; color: string }) {
  return (
    <span
      className="service-row-icon"
      style={{ color: corLocal, backgroundColor: `${corLocal}18` }}
    >
      <CategoriaIcone name={iconeLocal} size={14} />
    </span>
  );
}

export default function Servicos() {
  const exibirCartao = useCartaoVisivel('servicos');
  const [catalogo, setCatalogo] = useState({
    categorias: [] as CategoriaServico[],
    servicos: [] as ItemCatalogoServico[],
  });
  const [consulta, setConsulta] = useState('');
  usePesquisaPagina(setConsulta);
  const [categoriaFiltro, setCategoriaFiltro] = useState('todos');
  const [filtroSituacao, setSituacaoFiltro] = useState<SituacaoFiltro>('todos');
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useEstadoRascunho<ItemCatalogoServico | null>(
    'servico-editor',
    'editing',
    null,
  );
  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaServico | null | undefined>(
    undefined,
  );
  const [avisoTemporario, setAvisoTemporario] = useState('');
  const [avisoTemporarioErro, setAvisoTemporarioErro] = useState(false);
  const [formularioErro, setFormularioErro] = useState('');
  const [formulario, setFormulario] = useEstadoRascunho<Omit<ItemCatalogoServico, 'id'>>(
    'servico-editor',
    'form',
    {
      nome: '',
      categoriaId: '',
      descricao: '',
      preco: 0,
      custo: Number.NaN,
      duracao: '',
      ativo: true,
      icone: 'wrench',
      adicional: '',
    },
  );
  useEffect(() => {
    if (!avisoTemporario) return;
    const temporizador = setTimeout(() => setAvisoTemporario(''), 3500);
    return () => clearTimeout(temporizador);
  }, [avisoTemporario]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [atualizandoLista, setAtualizandoLista] = useState(false);
  const atualizacaoCatalogoRef = useRef(false);
  const [erroCarga, setErroCarga] = useState('');
  async function atualizarListaCatalogo(mostrarEstado = true, valido: () => boolean = () => true) {
    if (atualizacaoCatalogoRef.current) return;
    atualizacaoCatalogoRef.current = true;
    if (mostrarEstado) setAtualizandoLista(true);
    try {
      const dadosAtual = await atualizarCatalogoCompartilhado();
      if (valido()) {
        setCatalogo(dadosAtual);
        setErroCarga('');
      }
    } catch (erro) {
      if (valido()) {
        setErroCarga(
          erro instanceof Error ? erro.message : 'Não foi possível atualizar o catálogo.',
        );
        if (mostrarEstado) {
          setAvisoTemporarioErro(true);
          setAvisoTemporario('Não foi possível atualizar os serviços. Tente novamente.');
        }
      }
    } finally {
      atualizacaoCatalogoRef.current = false;
      if (valido()) setAtualizandoLista(false);
    }
  }
  useEffect(() => {
    let ativoLocal = true;
    atualizarCatalogoCompartilhado()
      .then((dadosAtual) => {
        if (ativoLocal) setCatalogo(dadosAtual);
      })
      .catch((eventoRecebido) => {
        if (ativoLocal) setErroCarga(eventoRecebido.message);
      })
      .finally(() => {
        if (ativoLocal) setCarregando(false);
      });
    return () => {
      ativoLocal = false;
    };
  }, []);
  useDadosVivos(
    (valido) => atualizarListaCatalogo(false, valido),
    !carregando && !salvando,
    'catalogo-servicos',
  );
  const contagens = useMemo(
    () => ({
      total: catalogo.servicos.length,
      active: catalogo.servicos.filter((item) => item.ativo).length,
      inactive: catalogo.servicos.filter((item) => !item.ativo).length,
      categories: catalogo.categorias.length,
    }),
    [catalogo],
  );
  const filtrado = useMemo(
    () =>
      catalogo.servicos
        .filter((item) => {
          const categoria = catalogo.categorias.find(
            (elementoAtual) => elementoAtual.id === item.categoriaId,
          );
          return (
            (categoriaFiltro === 'todos' || item.categoriaId === categoriaFiltro) &&
            (filtroSituacao === 'todos' ||
              (filtroSituacao === 'ativos' ? item.ativo : !item.ativo)) &&
            correspondeBusca(consulta, `${item.nome} ${item.descricao} ${categoria?.nome ?? ''}`)
          );
        })
        .sort((primeiroElemento, segundoElemento) =>
          primeiroElemento.nome.localeCompare(segundoElemento.nome, 'pt-BR'),
        ),
    [catalogo, categoriaFiltro, filtroSituacao, consulta],
  );
  const paginas = Math.max(1, Math.ceil(filtrado.length / 8));
  const atual = Math.min(pagina, paginas);
  const linhas = filtrado.slice((atual - 1) * 8, atual * 8);
  useEffect(() => observarCatalogoServicos(() => setCatalogo(lerCatalogoServicos())), []);
  async function persistir(continuar: typeof catalogo, erroNoFormulario = false) {
    if (salvando) {
      if (erroNoFormulario) throw new Error('Aguarde o salvamento em andamento e tente novamente.');
      return false;
    }
    setSalvando(true);
    try {
      await salvarCatalogoServicos(continuar);
      setCatalogo(continuar);
      setAvisoTemporarioErro(false);
      return true;
    } catch (erro) {
      setAvisoTemporarioErro(true);
      setAvisoTemporario(erro instanceof Error ? erro.message : 'Não foi possível salvar.');
      await atualizarCatalogoCompartilhado()
        .then(setCatalogo)
        .catch(() => {});
      if (erroNoFormulario) throw erro;
      return false;
    } finally {
      setSalvando(false);
    }
  }
  useAtalhoPagina({
    novo: () => {
      if (pode('servicos', 'criar')) {
        restaurarFormulario();
        focusEditor();
      }
    },
    categoria: () => {
      if (pode('servicos', 'editar')) setCategoriaEditando(null);
    },
  });
  function focusEditor() {
    requestAnimationFrame(() => {
      const campo = document.querySelector<HTMLInputElement>('.service-editor-card input');
      campo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      campo?.focus({ preventScroll: true });
    });
  }
  function restaurarFormulario() {
    setEditando(null);
    setFormulario({
      nome: '',
      categoriaId: '',
      descricao: '',
      preco: 0,
      custo: Number.NaN,
      duracao: '',
      ativo: true,
      icone: 'wrench',
      adicional: '',
    });
    setFormularioErro('');
  }
  function editarServico(servico: ItemCatalogoServico) {
    if (!pode('servicos', 'editar')) {
      setAvisoTemporarioErro(true);
      setAvisoTemporario('Seu cargo permite somente consultar este serviço.');
      return;
    }
    setEditando(servico);
    setFormulario({ ...servico });
    setFormularioErro('');
    focusEditor();
  }
  async function salvarServico(evento: FormEvent) {
    evento.preventDefault();
    if (
      !formulario.nome.trim() ||
      !formulario.categoriaId ||
      !formulario.descricao.trim() ||
      !Number.isFinite(formulario.preco) ||
      formulario.preco <= 0 ||
      !Number.isFinite(formulario.custo) ||
      formulario.custo < 0 ||
      !formulario.duracao
    ) {
      setFormularioErro('Preencha os campos obrigatórios, informe preço e custo válidos.');
      return;
    }
    const categoria = catalogo.categorias.find((item) => item.id === formulario.categoriaId);
    if (!categoria) {
      setFormularioErro('Selecione uma categoria válida.');
      return;
    }
    if (editando && !catalogo.servicos.some((item) => item.id === editando.id)) {
      setFormularioErro(
        'Este serviço não está mais no catálogo. Limpe o formulário para criar um novo.',
      );
      return;
    }
    const salvo: ItemCatalogoServico = {
      ...formulario,
      id: editando?.id ?? gerarIdCatalogo('svc'),
      nome: formulario.nome.trim(),
      descricao: formulario.descricao.trim(),
      icone: categoria?.icone ?? formulario.icone,
    };
    const servicosLocal = editando
      ? catalogo.servicos.map((item) => (item.id === editando.id ? salvo : item))
      : [salvo, ...catalogo.servicos];
    if (!(await persistir({ ...catalogo, servicos: servicosLocal }))) return;
    setAvisoTemporario(editando ? 'Serviço atualizado.' : 'Serviço adicionado.');
    restaurarFormulario();
    limparRascunho('servico-editor');
  }
  async function salvarCategoria(categoria: CategoriaServico) {
    const categoriasLocal = categoriaEditando
      ? catalogo.categorias.map((item) => (item.id === categoria.id ? categoria : item))
      : [...catalogo.categorias, categoria];
    if (!(await persistir({ ...catalogo, categorias: categoriasLocal }, true))) return;
    limparRascunho(`categoria-${categoriaEditando?.id ?? 'nova'}`);
    setCategoriaEditando(undefined);
    setAvisoTemporario(categoriaEditando ? 'Categoria atualizada.' : 'Categoria criada.');
  }
  function setCartaoFiltro(filtro: SituacaoFiltro) {
    setConsulta('');
    setCategoriaFiltro('todos');
    setSituacaoFiltro(filtro);
    setPagina(1);
  }
  return (
    <div
      className="orders-viewport services-app"
      data-catalog-readonly={!pode('servicos', 'editar') && !pode('servicos', 'criar')}
    >
      <div className="orders-main">
        <main className="services-content">
          <ConteudoCarregando carregando={carregando}>
            {erroCarga && (
              <p role="alert">
                {erroCarga}
                <button
                  onClick={() =>
                    atualizarCatalogoCompartilhado()
                      .then((dadosAtual) => {
                        setCatalogo(dadosAtual);
                        setErroCarga('');
                      })
                      .catch((eventoRecebido) => setErroCarga(eventoRecebido.message))
                  }
                >
                  Tentar novamente
                </button>
              </p>
            )}
            <div className="services-page-heading">
              <div>
                <h1>Serviços</h1>
                <p>Cadastre e gerencie os serviços oferecidos pela oficina.</p>
              </div>
              <div className="services-page-actions">
                <button
                  type="button"
                  className="services-btn secondary"
                  disabled={!pode('servicos', 'editar')}
                  onClick={() => setCategoriaEditando(null)}
                >
                  <IconeCadastro tipo="categoria" />
                  Nova categoria
                </button>
                <button
                  type="button"
                  className="services-btn primary"
                  disabled={!pode('servicos', 'criar')}
                  onClick={() => {
                    restaurarFormulario();
                    focusEditor();
                  }}
                >
                  <IconeCadastro tipo="servico" />
                  Novo serviço
                </button>
              </div>
            </div>
            <section
              className="services-metrics indicadores-grid"
              data-indicadores
              aria-label="Resumo dos serviços"
            >
              <CartaoIndicador
                titulo="Total de serviços"
                valor={contagens.total}
                descricao="Serviços cadastrados"
                icone="wrench"
                tom="blue"
                editorId="servicos:todos"
                oculto={!exibirCartao('todos')}
                ativo={filtroSituacao === 'todos'}
                aoClicar={() => setCartaoFiltro('todos')}
              />
              <CartaoIndicador
                titulo="Categorias"
                valor={contagens.categories}
                descricao="Organização do catálogo"
                icone="filter"
                tom="violet"
                editorId="servicos:categorias"
                oculto={!exibirCartao('categorias')}
                ativo={categoriaFiltro !== 'todos'}
                aoClicar={() => {
                  setConsulta('');
                  setCategoriaFiltro('todos');
                  setSituacaoFiltro('todos');
                  setPagina(1);
                  document
                    .getElementById('services-categories')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
              />
              <CartaoIndicador
                titulo="Serviços ativos"
                valor={contagens.active}
                descricao="Disponíveis para agendar"
                icone="check"
                tom="green"
                total={contagens.total}
                editorId="servicos:ativos"
                oculto={!exibirCartao('ativos')}
                ativo={filtroSituacao === 'ativos'}
                aoClicar={() => setCartaoFiltro('ativos')}
              />
              <CartaoIndicador
                titulo="Serviços inativos"
                valor={contagens.inactive}
                descricao="Fora da agenda"
                icone="pause"
                tom="amber"
                total={contagens.total}
                editorId="servicos:inativos"
                oculto={!exibirCartao('inativos')}
                ativo={filtroSituacao === 'inativos'}
                aoClicar={() => setCartaoFiltro('inativos')}
              />
            </section>
            <div className="services-workspace">
              <section className="services-list-card">
                <header className="services-card-heading">
                  <div>
                    <h2>Catálogo de serviços</h2>
                    <p>{filtrado.length} serviços encontrados</p>
                  </div>
                  <button
                    type="button"
                    className={`services-icon-action${atualizandoLista ? ' is-refreshing' : ''}`}
                    aria-label={atualizandoLista ? 'Atualizando catálogo' : 'Atualizar catálogo'}
                    title={
                      atualizandoLista
                        ? 'Atualizando dados do banco...'
                        : 'Atualizar serviços e categorias'
                    }
                    disabled={atualizandoLista || carregando}
                    onClick={() => void atualizarListaCatalogo(true)}
                  >
                    <Icone name="refresh" size={17} />
                  </button>
                </header>
                <div className="services-toolbar">
                  <label className="services-search">
                    <Icone name="search" size={17} />
                    <input
                      aria-label="Buscar no catálogo"
                      placeholder="Buscar por nome ou descrição..."
                      value={consulta}
                      onChange={(evento) => {
                        setConsulta(evento.target.value);
                        setPagina(1);
                      }}
                    />
                  </label>
                  <SeletorFiltro
                    variant="staff"
                    label="Categoria dos serviços"
                    value={categoriaFiltro}
                    options={[
                      { value: 'todos', label: 'Todas as categorias', icon: 'dashboard' },
                      ...catalogo.categorias.map((elementoAtual) => ({
                        value: elementoAtual.id,
                        label: elementoAtual.nome,
                        icon: /^https:/.test(elementoAtual.icone) ? 'wrench' : elementoAtual.icone,
                      })),
                    ]}
                    onChange={(valor) => {
                      setCategoriaFiltro(valor);
                      setPagina(1);
                    }}
                  />
                  <SeletorFiltro
                    variant="staff"
                    label="Status dos serviços"
                    value={filtroSituacao}
                    options={[
                      { value: 'todos', label: 'Todos os status', icon: 'sliders' },
                      { value: 'ativos', label: 'Ativos', tone: 'green' },
                      { value: 'inativos', label: 'Inativos', tone: 'neutral' },
                    ]}
                    onChange={(valor) => {
                      setSituacaoFiltro(valor);
                      setPagina(1);
                    }}
                  />
                </div>
                {(consulta || categoriaFiltro !== 'todos' || filtroSituacao !== 'todos') && (
                  <div className="services-filter-summary">
                    <span>
                      {filtrado.length} resultado{filtrado.length === 1 ? '' : 's'} com os filtros
                      selecionados
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConsulta('');
                        setCategoriaFiltro('todos');
                        setSituacaoFiltro('todos');
                        setPagina(1);
                      }}
                    >
                      Limpar filtros <Icone name="close" size={12} />
                    </button>
                  </div>
                )}
                <div className="services-table-scroll">
                  <table className="services-table">
                    <thead>
                      <tr>
                        <th>Serviço</th>
                        <th>Categoria</th>
                        <th>Preço (R$)</th>
                        <th>Tempo médio</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((servico) => {
                        const categoria = catalogo.categorias.find(
                          (item) => item.id === servico.categoriaId,
                        ) ?? {
                          id: 'missing',
                          nome: 'Sem categoria',
                          descricao: '',
                          cor: '#64748B',
                          icone: 'wrench',
                        };
                        return (
                          <tr
                            key={servico.id}
                            className={
                              editando?.id === servico.id ? 'service-row-editing' : undefined
                            }
                          >
                            <td>
                              <div className="services-name-cell">
                                <ServicoLinhaIcone
                                  icon={categoria.icone || servico.icone}
                                  color={categoria.cor}
                                />
                                <span>
                                  <strong>{servico.nome}</strong>
                                  <small>{servico.descricao}</small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <span
                                className="service-category-pill"
                                style={{
                                  color: categoria.cor,
                                  backgroundColor: `${categoria.cor}19`,
                                }}
                              >
                                {categoria.nome}
                              </span>
                            </td>
                            <td className="service-price">{moeda(servico.preco)}</td>
                            <td>
                              <span className="service-duration">
                                <Icone name="clock" size={13} />
                                {servico.duracao}
                              </span>
                            </td>
                            <td>
                              <span className={`service-status ${classeSituacao(servico.ativo)}`}>
                                {servico.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="service-edit-button"
                                aria-label={`Editar ${servico.nome}`}
                                title={`Editar ${servico.nome}`}
                                onClick={() => editarServico(servico)}
                              >
                                <Icone name="pencil" size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!linhas.length && (
                        <tr>
                          <td colSpan={6}>
                            <div className="services-empty">
                              <Icone name="wrench" size={26} />
                              <strong>
                                {catalogo.servicos.length
                                  ? 'Nenhum serviço corresponde aos filtros.'
                                  : 'Ainda não há serviços cadastrados.'}
                              </strong>
                              <button
                                type="button"
                                onClick={() => {
                                  setConsulta('');
                                  setCategoriaFiltro('todos');
                                  setSituacaoFiltro('todos');
                                }}
                              >
                                Limpar filtros
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <footer className="services-pagination">
                  <span>
                    Mostrando {filtrado.length ? (atual - 1) * 8 + 1 : 0} a{' '}
                    {Math.min(atual * 8, filtrado.length)} de {filtrado.length} serviços
                  </span>
                  <nav aria-label="Paginação dos serviços">
                    <button
                      type="button"
                      aria-label="Primeira página"
                      disabled={atual === 1}
                      onClick={() => setPagina(1)}
                    >
                      <Icone name="left" size={12} />
                      <Icone name="left" size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="Página anterior"
                      disabled={atual === 1}
                      onClick={() => setPagina((valor) => Math.max(1, valor - 1))}
                    >
                      <Icone name="left" size={12} />
                    </button>
                    {Array.from({ length: paginas }, (_, indice) => indice + 1)
                      .filter(
                        (numeroLocal) =>
                          numeroLocal === 1 ||
                          numeroLocal === paginas ||
                          Math.abs(numeroLocal - atual) <= 1,
                      )
                      .map((numeroLocal) => (
                        <button
                          type="button"
                          key={numeroLocal}
                          className={numeroLocal === atual ? 'current' : ''}
                          onClick={() => setPagina(numeroLocal)}
                        >
                          {numeroLocal}
                        </button>
                      ))}
                    <button
                      type="button"
                      aria-label="Próxima página"
                      disabled={atual === paginas}
                      onClick={() => setPagina((valor) => Math.min(paginas, valor + 1))}
                    >
                      <Icone name="right" size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="Última página"
                      disabled={atual === paginas}
                      onClick={() => setPagina(paginas)}
                    >
                      <Icone name="right" size={12} />
                      <Icone name="right" size={12} />
                    </button>
                  </nav>
                </footer>
              </section>
              <EditorServico
                {...{
                  formulario,
                  setFormulario,
                  editando,
                  formularioErro,
                  restaurarFormulario,
                  salvarServico,
                  categorias: catalogo.categorias,
                }}
              />
            </div>
            <section className="services-categories-card" id="services-categories">
              <header>
                <div>
                  <h2>Categorias de serviços</h2>
                  <p>Organize os serviços por tipo</p>
                </div>
                <button
                  type="button"
                  className="services-btn secondary compact"
                  disabled={!pode('servicos', 'editar')}
                  onClick={() => setCategoriaEditando(null)}
                >
                  <IconeCadastro tipo="categoria" />
                  Nova categoria
                </button>
              </header>
              <div className="service-category-grid">
                {catalogo.categorias.map((categoria) => {
                  const servicoQuantidade = catalogo.servicos.filter(
                    (item) => item.categoriaId === categoria.id,
                  ).length;
                  return (
                    <article
                      className={`service-category-card${categoriaFiltro === categoria.id ? ' selected' : ''}`}
                      key={categoria.id}
                    >
                      <button
                        type="button"
                        className="category-filter-button"
                        aria-pressed={categoriaFiltro === categoria.id}
                        onClick={() => {
                          setCategoriaFiltro(categoria.id);
                          setSituacaoFiltro('todos');
                          setConsulta('');
                          setPagina(1);
                          setEditando(null);
                          setFormulario({
                            nome: '',
                            categoriaId: categoria.id,
                            descricao: '',
                            preco: 0,
                            custo: Number.NaN,
                            duracao: '',
                            ativo: true,
                            icone: categoria.icone,
                            adicional: '',
                          });
                          setFormularioErro('');
                        }}
                      >
                        <span
                          className="category-card-icon"
                          style={{ color: categoria.cor, backgroundColor: `${categoria.cor}1A` }}
                        >
                          <CategoriaIcone name={categoria.icone} size={16} />
                        </span>
                        <span className="category-card-copy">
                          <strong>{categoria.nome}</strong>
                          <small>
                            {servicoQuantidade} {servicoQuantidade === 1 ? 'serviço' : 'serviços'}
                          </small>
                        </span>
                        <span className="category-card-description">{categoria.descricao}</span>
                      </button>
                      <button
                        type="button"
                        className="category-card-edit"
                        aria-label={`Editar categoria ${categoria.nome}`}
                        disabled={!pode('servicos', 'editar')}
                        onClick={() => setCategoriaEditando(categoria)}
                      >
                        <Icone name="pencil" size={12} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          </ConteudoCarregando>
        </main>
      </div>
      {avisoTemporario && (
        <div
          className={`services-toast${avisoTemporarioErro ? ' error' : ''}`}
          role={avisoTemporarioErro ? 'alert' : 'status'}
        >
          <Icone name={avisoTemporarioErro ? 'info' : 'check'} size={15} />
          {avisoTemporario}
        </div>
      )}
      {categoriaEditando !== undefined && (
        <CategoriaModal
          value={categoriaEditando || undefined}
          onClose={() => setCategoriaEditando(undefined)}
          onSave={salvarCategoria}
        />
      )}
    </div>
  );
}

export function EditorServico({
  formulario,
  setFormulario,
  editando,
  formularioErro,
  restaurarFormulario,
  salvarServico,
  categorias,
}: {
  formulario: Omit<ItemCatalogoServico, 'id'>;
  setFormulario: (valor: Omit<ItemCatalogoServico, 'id'>) => void;
  editando: ItemCatalogoServico | null;
  formularioErro: string;
  restaurarFormulario: () => void;
  salvarServico: (evento: FormEvent) => void;
  categorias: CategoriaServico[];
}) {
  return (
    <form className="service-editor-card" onSubmit={salvarServico}>
      <header>
        <span>
          <Icone name={editando ? 'pencil' : 'wrench'} size={16} />
        </span>
        <div>
          <h2>{editando ? 'Editar serviço' : 'Adicionar novo serviço'}</h2>
          <small>
            {editando ? editando.nome : 'Preencha os dados para disponibilizar um serviço.'}
          </small>
        </div>
      </header>
      {editando && (
        <div className="service-edit-context">
          <span>Editando serviço existente</span>
          <button type="button" onClick={restaurarFormulario}>
            Sair da edição <Icone name="close" size={12} />
          </button>
        </div>
      )}
      <div className="service-editor-fields">
        <label className="services-field">
          <span>
            Nome do serviço <b>*</b>
          </span>
          <input
            maxLength={80}
            placeholder="Ex.: Troca de Óleo do Motor"
            value={formulario.nome}
            onChange={(evento) => setFormulario({ ...formulario, nome: evento.target.value })}
          />
        </label>
        <label className="services-field">
          <span>
            Categoria <b>*</b>
          </span>
          <CategoriaSelecionar
            value={formulario.categoriaId}
            categories={categorias}
            onChange={(valor) => {
              const categoria = categorias.find((item) => item.id === valor);
              setFormulario({
                ...formulario,
                categoriaId: valor,
                icone: categoria?.icone ?? formulario.icone,
              });
            }}
          />
        </label>
        <label className="services-field">
          <span>
            Descrição <b>*</b>
          </span>
          <textarea
            maxLength={300}
            placeholder="Descreva o serviço em detalhes..."
            value={formulario.descricao}
            onChange={(evento) => setFormulario({ ...formulario, descricao: evento.target.value })}
          />
        </label>
        <div className="service-price-row">
          <label className="services-field">
            <span>
              Preço (R$) <b>*</b>
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0,00"
              value={formulario.preco || ''}
              onChange={(evento) =>
                setFormulario({ ...formulario, preco: Number(evento.target.value) })
              }
            />
          </label>
          <label className="services-field">
            <span>
              Custo do serviço (R$) <b>*</b>
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              value={Number.isFinite(formulario.custo) ? formulario.custo : ''}
              onChange={(evento) =>
                setFormulario({
                  ...formulario,
                  custo: evento.target.value === '' ? Number.NaN : Number(evento.target.value),
                })
              }
            />
          </label>
        </div>
        <div className="service-duration-row">
          <label className="services-field">
            <span>
              Tempo médio <b>*</b>
            </span>
            <DuracaoSelecionar
              value={formulario.duracao}
              onChange={(valor) => setFormulario({ ...formulario, duracao: valor })}
            />
          </label>
          <div className="services-field">
            <span>Status</span>
            <button
              type="button"
              className={`service-switch${formulario.ativo ? ' enabled' : ''}`}
              aria-pressed={formulario.ativo}
              onClick={() => setFormulario({ ...formulario, ativo: !formulario.ativo })}
            >
              <i />
              <span>{formulario.ativo ? 'Ativo' : 'Inativo'}</span>
            </button>
          </div>
        </div>
        <label className="services-field">
          <span>
            Informações adicionais <small>(opcional)</small>
          </span>
          <textarea
            className="service-extra-textarea"
            maxLength={300}
            placeholder="Observações, recomendações ou detalhes importantes..."
            value={formulario.adicional}
            onChange={(evento) => setFormulario({ ...formulario, adicional: evento.target.value })}
          />
        </label>
        {formularioErro && (
          <p className="services-form-error" role="alert">
            {formularioErro}
          </p>
        )}
      </div>
      <footer>
        <button type="button" className="services-btn secondary" onClick={restaurarFormulario}>
          <img
            className="service-reset-icon"
            src="/assets/services/reload-single.svg"
            alt=""
            aria-hidden="true"
          />
          Limpar
        </button>
        <button type="submit" className="services-btn primary">
          {editando ? 'Salvar alterações' : 'Salvar serviço'}
        </button>
      </footer>
    </form>
  );
}

export function CadastroCatalogoOS({
  aoFechar,
  aoSalvar,
}: {
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  return (
    <CategoriaModal
      onClose={aoFechar}
      onSave={async (categoria) => {
        const atual = await atualizarCatalogoCompartilhado();
        await salvarCatalogoServicos({ ...atual, categorias: [...atual.categorias, categoria] });
        limparRascunho('categoria-nova');
        aoSalvar();
      }}
    />
  );
}
