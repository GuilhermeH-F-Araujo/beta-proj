import CartaoIndicador from '../components/CartaoIndicador';
import { usePesquisaPagina } from '../hooks/usePesquisaPagina';
import { useCartaoVisivel } from '../hooks/useCartoesPagina';
import { useAtalhoPagina } from '../hooks/useAtalhoPagina';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import ConteudoCarregando from '../components/ConteudoCarregando';
import { Icone } from '../components/MenuAdmin';
import { correspondeBusca } from '../utils/buscaAproximada';
import '../components/modal-acoes-ordem.css';
import { useUsuarioAdministrador } from '../components/RotaProtegida';
import SeletorPeriodo, { type DadosIntervalo } from '../components/SeletorPeriodo';
import { useDadosVivos } from '../hooks/useDadosVivos';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import { pode } from '../services/acessoConta';
import {
  buscarAgendamentos,
  buscarOpcoesAgendamento,
  excluirAgendamento,
  salvarAgendamento,
  type ItemAgendamento,
  type OpcoesAgendamento,
} from '../services/agendamentos';
import {
  atualizarCatalogoCompartilhado,
  lerCatalogoServicos,
  observarCatalogoServicos,
} from '../services/catalogoServicos';
import { limparRascunho } from '../services/rascunhos';
import './agendamentos.css';

type SituacaoAgenda = 'Confirmado' | 'Pendente' | 'Concluído' | 'Cancelado';
type Agendamento = ItemAgendamento;
const CHAVE_RASCUNHO_AGENDAMENTO = 'estacao-motos-agendamento-rascunho-servico';
const NovoUsuario = lazy(() => import('../components/ModalNovoUsuario'));
const SERVICO_PERSONALIZADO = 'Personalizar serviço';
function dadosRotulo(valor: string) {
  const [outroItem, mesAtual, dadosAtual] = valor.split('-');
  return `${dadosAtual}/${mesAtual}/${outroItem}`;
}
function destinoEntradaDados(dadosAtual: Date) {
  return `${dadosAtual.getFullYear()}-${String(dadosAtual.getMonth() + 1).padStart(2, '0')}-${String(dadosAtual.getDate()).padStart(2, '0')}`;
}
function iniciaisLocal(valor: string) {
  return valor
    .split(/\s+/)
    .slice(0, 2)
    .map((textoAtual) => textoAtual[0])
    .join('')
    .toUpperCase();
}
function SituacaoSeletor({
  value: valor,
  onChange: aoAlterar,
}: {
  value: string;
  onChange: (valor: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const opcoes = [
    { label: 'Todos', tone: 'todos' },
    ...(['Confirmado', 'Pendente', 'Concluído', 'Cancelado'] as SituacaoAgenda[]).map((rotulo) => ({
      label: rotulo,
      tone: rotulo.toLowerCase().replace('í', 'i'),
    })),
  ];
  useEffect(() => {
    if (!aberto) return;
    const fechar = (evento: PointerEvent) => {
      if (evento.target instanceof Node && !raiz.current?.contains(evento.target)) setAberto(false);
    };
    const chave = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false);
    };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', chave);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', chave);
    };
  }, [aberto]);
  const tom = valor === 'Todos' ? 'todos' : valor.toLowerCase().replace('í', 'i');
  return (
    <div className="appointment-status-filter" ref={raiz}>
      <span className="appointment-filter-caption">Status</span>
      <button
        type="button"
        className="appointment-status-trigger"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((valorAtual) => !valorAtual)}
      >
        <span className={`appointment-filter-dot ${tom}`} />
        <span>{valor === 'Todos' ? 'Todos' : valor}</span>
        <Icone name="chevron" size={13} />
      </button>
      {aberto && (
        <div className="appointment-status-menu" role="listbox" aria-label="Filtrar por status">
          {opcoes.map((opcao) => (
            <button
              key={opcao.label}
              type="button"
              role="option"
              aria-selected={valor === opcao.label}
              className={valor === opcao.label ? 'selected' : ''}
              onClick={() => {
                aoAlterar(opcao.label);
                setAberto(false);
              }}
            >
              <span className={`appointment-filter-dot ${opcao.tone}`} />
              <span>{opcao.label === 'Todos' ? 'Todos os status' : opcao.label}</span>
              {valor === opcao.label && <Icone name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
type OpcaoAgendamento = { value: string; label?: string; description?: string; icon: string };
function EscolhaIcone({ name: nomeLocal, size: tamanho = 15 }: { name: string; size?: number }) {
  return /^https:\/\//i.test(nomeLocal) ? (
    <img
      className="appointment-choice-external-icon"
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
function SeletorAgendamento({
  id,
  value: valor,
  placeholder: textoAjuda,
  options: opcoes,
  onChange: aoAlterar,
  ariaLabel: ariaRotulo,
  emptyMessage: vazioMensagem = 'Nenhuma opção disponível no momento.',
}: {
  id: string;
  value: string;
  placeholder: string;
  options: OpcaoAgendamento[];
  onChange: (valor: string) => void;
  ariaLabel: string;
  emptyMessage?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const menuId = `${id}-options`;
  const selecionado = opcoes.find((opcao) => opcao.value === valor);
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      if (evento.target instanceof Node && !raiz.current?.contains(evento.target)) setAberto(false);
    };
    const chave = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', chave);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', chave);
    };
  }, [aberto]);
  return (
    <div className={`appointment-choice${aberto ? ' is-open' : ''}`} ref={raiz}>
      <button
        id={id}
        type="button"
        className="appointment-choice-trigger"
        role="combobox"
        aria-label={ariaRotulo}
        aria-controls={menuId}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        onClick={() => setAberto((valorAtual) => !valorAtual)}
        onKeyDown={(evento) => {
          if (evento.key === 'ArrowDown') {
            evento.preventDefault();
            setAberto(true);
          }
        }}
      >
        <span className={`appointment-choice-icon${selecionado ? ' selected' : ''}`}>
          <EscolhaIcone name={selecionado?.icon ?? opcoes[0]?.icon ?? 'check'} size={15} />
        </span>
        <span className={`appointment-choice-value${selecionado ? '' : ' placeholder'}`}>
          {selecionado?.label ?? selecionado?.value ?? textoAjuda}
        </span>
        <Icone name="chevron" size={14} />
      </button>
      {aberto && (
        <div className="appointment-choice-menu" id={menuId} role="listbox" aria-label={ariaRotulo}>
          {opcoes.length ? (
            opcoes.map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                role="option"
                aria-selected={valor === opcao.value}
                className={`appointment-choice-option${valor === opcao.value ? ' selected' : ''}`}
                onClick={() => {
                  aoAlterar(opcao.value);
                  setAberto(false);
                }}
              >
                <span className="appointment-choice-option-icon">
                  <EscolhaIcone name={opcao.icon} size={16} />
                </span>
                <span className="appointment-choice-option-copy">
                  <strong>{opcao.label ?? opcao.value}</strong>
                  {opcao.description && <small>{opcao.description}</small>}
                </span>
                {valor === opcao.value && <Icone name="check" size={15} />}
              </button>
            ))
          ) : (
            <p className="appointment-choice-empty">{vazioMensagem}</p>
          )}
        </div>
      )}
    </div>
  );
}
function PaginaNovoAgendamento({
  value: valor,
  onClose: aoFechar,
  onSave: aoSalvar,
  onGoServices: aoIrServicos,
  clients: clientes,
  mechanics: mecanicos,
  mechanicsLoading: carregandoMecanicos,
  mechanicsError: mecanicosErro,
  onRetryMechanics: aoTentarNovamenteMecanicos,
  onRefreshOptions: aoAtualizarOpcoes,
  onMechanicsError: aoErroMecanicos,
  serviceCatalogOptions: opcoesCatalogoServicos,
  saving: salvandoLocal,
}: {
  value?: Agendamento;
  onClose: () => void;
  onSave: (item: Agendamento) => void;
  onGoServices: (rascunho: Agendamento) => void;
  clients: OpcoesAgendamento['clientes'];
  mechanics: OpcaoAgendamento[];
  mechanicsLoading: boolean;
  mechanicsError: string;
  onRetryMechanics: () => void;
  onRefreshOptions: () => Promise<OpcoesAgendamento>;
  onMechanicsError: (mensagem: string) => void;
  serviceCatalogOptions: OpcaoAgendamento[];
  saving: boolean;
}) {
  const [cliente, setCliente] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'cliente',
    valor?.cliente ?? '',
  );
  const [clienteId, setClienteId] = useState<number | null>(valor?.clienteId ?? null);
  const [telefone, setTelefone] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'telefone',
    valor?.telefone ?? '',
  );
  const [moto, setMoto] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'moto',
    valor?.moto ?? '',
  );
  const [motoId, setMotoId] = useState<number | null>(valor?.motoId ?? null);
  const [servico, setServico] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'servico',
    valor?.servico ?? '',
  );
  const [dados, setDados] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'data',
    valor?.data ?? destinoEntradaDados(new Date()),
  );
  const [hora, setHora] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'hora',
    valor?.hora ?? '09:00',
  );
  const [horarioAberto, setHorarioAberto] = useState(false);
  const [relogioHora, setRelogioHora] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'clockHour',
    9,
  );
  const [relogioMinuto, setRelogioMinuto] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'clockMinute',
    0,
  );
  const [relogioPeriodo, setRelogioPeriodo] = useEstadoRascunho<'AM' | 'PM'>(
    `agenda-${valor?.id ?? 'novo'}`,
    'clockPeriod',
    'AM',
  );
  const [relogioParte, setRelogioParte] = useEstadoRascunho<'hour' | 'minute'>(
    `agenda-${valor?.id ?? 'novo'}`,
    'clockPart',
    'hour',
  );
  const [manualHorario, setManualHorario] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'manualTime',
    valor?.hora ?? '09:00',
  );
  const [mecanico, setMecanico] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'mecanico',
    valor?.mecanicoId ? String(valor.mecanicoId) : '',
  );
  const [duracao, setDuracao] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'duracao',
    valor?.duracao ?? '1 hora',
  );
  const [observacoes, setObservacoes] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'observacoes',
    valor?.observacoes ?? '',
  );
  const [placa, setPlaca] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'placa',
    valor?.placa ?? '',
  );
  const [useResultadoAtualAberto, setUsuarioAberto] = useState(false);
  const [duracaoAberto, setDuracaoAberto] = useState(false);
  const [duracaoHoras, setDuracaoHoras] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'durationHours',
    '',
  );
  const [duracaoMinutos, setDuracaoMinutos] = useEstadoRascunho(
    `agenda-${valor?.id ?? 'novo'}`,
    'durationMinutes',
    '',
  );
  const [clienteAberto, setClienteAberto] = useState(false);
  const [validacao, setValidacao] = useState('');
  const clienteRaiz = useRef<HTMLDivElement>(null);
  const clienteOpcoes = clientes
    .filter((item) => correspondeBusca(cliente, `${item.nome} ${item.telefone ?? ''}`))
    .slice(0, 6);
  useEffect(() => {
    if (!clienteAberto) return;
    const fora = (evento: PointerEvent) => {
      if (evento.target instanceof Node && !clienteRaiz.current?.contains(evento.target))
        setClienteAberto(false);
    };
    const chave = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setClienteAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', chave);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', chave);
    };
  }, [clienteAberto]);
  const clienteSelecionado = clientes.find((item) => item.id === clienteId);
  const motosDisponiveis = clienteSelecionado?.motos ?? [];
  const salvoServicoOpcao =
    servico && !opcoesCatalogoServicos.some((opcao) => opcao.value === servico)
      ? [{ value: servico, description: 'Serviço salvo neste agendamento', icon: 'wrench' }]
      : [];
  const servicoOpcoes = [
    ...opcoesCatalogoServicos,
    ...salvoServicoOpcao,
    {
      value: SERVICO_PERSONALIZADO,
      description: 'Cadastre um novo serviço na tela de Serviços',
      icon: 'pencil',
    },
  ];
  const standardDuracoes = ['30 minutos', '1 hora', '1 hora e 30 minutos', '2 horas', '3 horas'];
  const salvoDuracaoOpcao =
    duracao && !standardDuracoes.includes(duracao) && !/^\d+\s*(h|hora)/i.test(duracao)
      ? [{ value: duracao, description: 'Duração deste agendamento', icon: 'clock' }]
      : [];
  const duracaoOpcoes = [
    ...standardDuracoes.map((valor) => ({
      value: valor,
      description: 'Tempo reservado na agenda',
      icon: 'clock',
    })),
    ...salvoDuracaoOpcao,
    { value: 'Personalizar', description: 'Defina horas e minutos', icon: 'clock' },
  ];
  const dialHoras = Array.from({ length: 12 }, (_, indiceLocal) => indiceLocal + 1);
  const dialMinutos = Array.from({ length: 12 }, (_, indiceLocal) => indiceLocal * 5);
  function abertoCustomDuracao() {
    const alturaAtual = duracao.match(/(\d+)\s*(?:h|hora)/i)?.[1] ?? '';
    const mesAtual = duracao.match(/(\d+)\s*(?:minuto|min)/i)?.[1] ?? '';
    setDuracaoHoras(alturaAtual);
    setDuracaoMinutos(mesAtual);
    setDuracaoAberto(true);
  }
  function salvarCustomDuracao() {
    const alturaAtual = Math.min(24, Math.max(0, Number(duracaoHoras) || 0));
    const mesAtual = Math.min(59, Math.max(0, Number(duracaoMinutos) || 0));
    if (!alturaAtual && !mesAtual) return;
    setDuracao(
      [
        alturaAtual ? `${alturaAtual} ${alturaAtual === 1 ? 'hora' : 'horas'}` : '',
        mesAtual ? `${mesAtual} ${mesAtual === 1 ? 'minuto' : 'minutos'}` : '',
      ]
        .filter(Boolean)
        .join(' e '),
    );
    setDuracaoAberto(false);
  }
  function formatarDialHorario(
    horaLocal = relogioHora,
    minuto = relogioMinuto,
    periodo = relogioPeriodo,
  ) {
    const horaCompleta = (horaLocal % 12) + (periodo === 'PM' ? 12 : 0);
    return `${String(horaCompleta).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
  }
  function abertoHorarioSeletor() {
    const [alturaAtual, mesAtual] = hora.split(':').map(Number);
    const horaCompleta = Number.isFinite(alturaAtual) ? alturaAtual : 9;
    const minuto = Number.isFinite(mesAtual) ? mesAtual : 0;
    setRelogioHora(horaCompleta % 12 || 12);
    setRelogioMinuto(minuto);
    setRelogioPeriodo(horaCompleta >= 12 ? 'PM' : 'AM');
    setRelogioParte('hour');
    setManualHorario(hora || '09:00');
    setHorarioAberto(true);
  }
  function escolherRelogioHora(horaLocal: number) {
    setRelogioHora(horaLocal);
    setRelogioParte('minute');
    setManualHorario(formatarDialHorario(horaLocal, relogioMinuto, relogioPeriodo));
  }
  function escolherRelogioMinuto(minuto: number) {
    setRelogioMinuto(minuto);
    setManualHorario(formatarDialHorario(relogioHora, minuto, relogioPeriodo));
  }
  function escolherRelogioPeriodo(periodo: 'AM' | 'PM') {
    setRelogioPeriodo(periodo);
    setManualHorario(formatarDialHorario(relogioHora, relogioMinuto, periodo));
  }
  function editarManualHorario(bruto: string) {
    const continuar = bruto.replace(/[^\d:]/g, '').slice(0, 5);
    setManualHorario(continuar);
    const correspondencia = continuar.match(/^(\d{2}):(\d{2})$/);
    if (!correspondencia) return;
    const alturaAtual = Number(correspondencia[1]);
    const mesAtual = Number(correspondencia[2]);
    if (alturaAtual > 23 || mesAtual > 59) return;
    setRelogioHora(alturaAtual % 12 || 12);
    setRelogioMinuto(mesAtual);
    setRelogioPeriodo(alturaAtual >= 12 ? 'PM' : 'AM');
  }
  function selecionarPontoRelogio(evento: MouseEvent<HTMLDivElement>) {
    const retangulo = evento.currentTarget.getBoundingClientRect();
    const diferencaHorizontal = evento.clientX - (retangulo.left + retangulo.width / 2);
    const diferencaVertical = evento.clientY - (retangulo.top + retangulo.height / 2);
    const angulo =
      (Math.atan2(diferencaHorizontal, -diferencaVertical) + Math.PI * 2) % (Math.PI * 2);
    if (relogioParte === 'hour') {
      const valor = Math.round(angulo / (Math.PI / 6)) % 12;
      escolherRelogioHora(valor || 12);
    } else escolherRelogioMinuto(Math.round(angulo / (Math.PI / 30)) % 60);
  }
  const manualHorarioValido = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(manualHorario);
  function confirmarHorario() {
    if (!manualHorarioValido) return;
    setHora(manualHorario);
    setHorarioAberto(false);
  }
  useEffect(() => {
    if (!duracaoAberto) return;
    const chave = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setDuracaoAberto(false);
    };
    document.addEventListener('keydown', chave);
    return () => document.removeEventListener('keydown', chave);
  }, [duracaoAberto]);
  useEffect(() => {
    if (!horarioAberto) return;
    const chave = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setHorarioAberto(false);
    };
    document.addEventListener('keydown', chave);
    return () => document.removeEventListener('keydown', chave);
  }, [horarioAberto]);
  function enviar(eventoRecebido: FormEvent) {
    eventoRecebido.preventDefault();
    if (
      !clienteId ||
      !motoId ||
      !servico.trim() ||
      !mecanico ||
      !mecanicos.some((opcao) => opcao.value === mecanico)
    ) {
      setValidacao('Confira cliente, motocicleta, serviço e mecânico da equipe para continuar.');
      return;
    }
    setValidacao('');
    aoSalvar({
      id: valor?.id && valor.id > 0 ? valor.id : 0,
      clienteId,
      cliente: cliente.trim(),
      telefone,
      motoId,
      moto,
      placa,
      servico: servico.trim(),
      status: valor?.status ?? 'Confirmado',
      data: dados,
      hora,
      mecanicoId: Number(mecanico),
      mecanico: mecanicos.find((opcao) => opcao.value === mecanico)?.label ?? mecanico,
      duracao,
      observacoes,
    });
  }
  function irParaServicos() {
    aoIrServicos({
      id: valor?.id ?? -1,
      clienteId: clienteId ?? 0,
      cliente: cliente.trim(),
      telefone,
      motoId: motoId ?? 0,
      moto,
      placa,
      servico: '',
      status: valor?.status ?? 'Confirmado',
      data: dados,
      hora,
      mecanicoId: mecanico ? Number(mecanico) : null,
      mecanico: mecanicos.find((opcao) => opcao.value === mecanico)?.label ?? mecanico,
      duracao,
      observacoes,
    });
  }
  return (
    <>
      {!useResultadoAtualAberto && !duracaoAberto && !horarioAberto && (
        <div
          className="appointment-overlay"
          onMouseDown={(eventoRecebido) => {
            if (eventoRecebido.target === eventoRecebido.currentTarget) aoFechar();
          }}
        >
          <form
            className="appointment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-modal-title"
            onSubmit={enviar}
          >
            <header className="appointment-modal-head">
              <div className="appointment-modal-title-icon">
                <Icone name="calendar" size={23} />
              </div>
              <div>
                <h2 id="appointment-modal-title">
                  {valor?.id && valor.id > 0 ? 'Editar agendamento' : 'Novo agendamento'}
                </h2>
                <p>Preencha os dados para agendar um serviço.</p>
              </div>
              <button
                type="button"
                className="appointment-close"
                aria-label="Fechar"
                onClick={aoFechar}
              >
                <Icone name="close" size={17} />
              </button>
            </header>
            <div className="appointment-form-content">
              <div className="appointment-field appointment-field-client">
                <label htmlFor="ap-client">Cliente</label>
                <div className="appointment-client-row">
                  <div className="appointment-search-control" ref={clienteRaiz}>
                    <Icone name="search" size={15} />
                    <input
                      id="ap-client"
                      autoComplete="off"
                      required
                      placeholder="Buscar cliente por nome ou telefone..."
                      value={cliente}
                      onFocus={() => setClienteAberto(true)}
                      onChange={(eventoRecebido) => {
                        const numero = eventoRecebido.target.value;
                        setCliente(numero);
                        setClienteId(null);
                        setMoto('');
                        setMotoId(null);
                        setPlaca('');
                        setClienteAberto(true);
                      }}
                    />
                    <Icone name="chevron" size={14} />
                    {clienteAberto && (
                      <div
                        className="appointment-client-suggestions"
                        role="listbox"
                        aria-label="Clientes cadastrados"
                      >
                        {clienteOpcoes.length ? (
                          clienteOpcoes.map((clienteLocal) => (
                            <button
                              key={clienteLocal.id}
                              type="button"
                              role="option"
                              aria-selected={clienteId === clienteLocal.id}
                              onPointerDown={(evento) => evento.preventDefault()}
                              onClick={() => {
                                setCliente(clienteLocal.nome);
                                setClienteId(clienteLocal.id);
                                setTelefone(clienteLocal.telefone ?? '');
                                setMoto('');
                                setMotoId(null);
                                setPlaca('');
                                setClienteAberto(false);
                              }}
                            >
                              <span className="appointment-client-avatar">
                                {iniciaisLocal(clienteLocal.nome)}
                              </span>
                              <span>
                                <strong>{clienteLocal.nome}</strong>
                                <small>
                                  {clienteLocal.telefone || 'Cliente cadastrado'}
                                </small>
                              </span>
                              {clienteId === clienteLocal.id && <Icone name="check" size={14} />}
                            </button>
                          ))
                        ) : (
                          <p>
                            {cliente
                              ? 'Nenhum cliente com esse nome ou telefone.'
                              : 'Digite para localizar um cliente cadastrado.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="appointment-new-client-button"
                    onClick={() => setUsuarioAberto(true)}
                  >
                    <Icone name="plus" size={14} />
                    <span>Novo cliente</span>
                  </button>
                </div>
              </div>
              <div className="appointment-fields-grid">
                <div className="appointment-field">
                  <label htmlFor="ap-moto">Motocicleta</label>
                  <SeletorAgendamento
                    id="ap-moto"
                    ariaLabel="Motocicleta"
                    value={motoId ? String(motoId) : ''}
                    placeholder="Selecione uma motocicleta"
                    options={motosDisponiveis.map((motoLocal) => ({
                      value: String(motoLocal.id),
                      label: `${motoLocal.modelo}${motoLocal.placa ? ` · ${motoLocal.placa}` : ''}`,
                      description: motoLocal.placa ? `Placa ${motoLocal.placa}` : 'Sem placa informada',
                      icon: 'bike',
                    }))}
                    emptyMessage={clienteId ? 'Este cliente não possui moto ativa cadastrada.' : 'Selecione o cliente primeiro.'}
                    onChange={(selecionado) => {
                      const motoLocal = motosDisponiveis.find((item) => String(item.id) === selecionado);
                      if (!motoLocal) return;
                      setMotoId(motoLocal.id);
                      setMoto(motoLocal.modelo);
                      setPlaca(motoLocal.placa ?? '');
                      setValidacao('');
                    }}
                  />
                </div>
                <div className="appointment-field">
                  <label htmlFor="ap-service">Serviço</label>
                  <SeletorAgendamento
                    id="ap-service"
                    ariaLabel="Serviço"
                    value={servico}
                    placeholder="Selecione o serviço"
                    options={servicoOpcoes}
                    onChange={(selecionado) => {
                      if (selecionado === SERVICO_PERSONALIZADO) {
                        irParaServicos();
                        return;
                      }
                      setServico(selecionado);
                      setValidacao('');
                    }}
                  />
                </div>
                <div className="appointment-field">
                  <label htmlFor="ap-date">Data</label>
                  <div className="appointment-input-icon">
                    <input
                      id="ap-date"
                      type="date"
                      required
                      value={dados}
                      onChange={(eventoRecebido) => setDados(eventoRecebido.target.value)}
                    />
                    <Icone name="calendar" size={15} />
                  </div>
                </div>
                <div className="appointment-field">
                  <label>Horário</label>
                  <button
                    type="button"
                    className="appointment-time-trigger"
                    aria-haspopup="dialog"
                    onClick={abertoHorarioSeletor}
                  >
                    <Icone name="clock" size={15} />
                    <span>{hora}</span>
                    <Icone name="chevron" size={13} />
                  </button>
                </div>
                <div className="appointment-field">
                  <label htmlFor="ap-mechanic">Mecânico responsável</label>
                  <SeletorAgendamento
                    id="ap-mechanic"
                    ariaLabel="Mecânico responsável"
                    value={mecanico}
                    placeholder={
                      carregandoMecanicos
                        ? 'Carregando equipe…'
                        : mecanicosErro
                          ? 'Não foi possível carregar'
                          : 'Selecione o mecânico'
                    }
                    options={mecanicos}
                    emptyMessage={
                      mecanicosErro ||
                      'Nenhum mecânico ativo cadastrado. Cadastre um em Funcionários.'
                    }
                    onChange={(selecionado) => {
                      setMecanico(selecionado);
                      setValidacao('');
                    }}
                  />
                  {mecanicosErro && (
                    <button
                      type="button"
                      className="appointment-retry-mechanics"
                      onClick={aoTentarNovamenteMecanicos}
                    >
                      Tentar carregar novamente
                    </button>
                  )}
                </div>
                <div className="appointment-field">
                  <label htmlFor="ap-duration">Duração estimada</label>
                  <SeletorAgendamento
                    id="ap-duration"
                    ariaLabel="Duração estimada"
                    value={duracao}
                    placeholder="Selecione a duração"
                    options={duracaoOpcoes}
                    onChange={(selecionado) => {
                      if (selecionado === 'Personalizar') abertoCustomDuracao();
                      else setDuracao(selecionado);
                    }}
                  />
                </div>
              </div>
              <div className="appointment-field appointment-observations">
                <label htmlFor="ap-notes">Observações</label>
                <textarea
                  id="ap-notes"
                  maxLength={300}
                  rows={3}
                  placeholder="Adicione informações importantes sobre o serviço..."
                  value={observacoes}
                  onChange={(eventoRecebido) => setObservacoes(eventoRecebido.target.value)}
                />
                <span>{observacoes.length}/300</span>
              </div>
            </div>
            {validacao && (
              <p className="appointment-form-error" role="alert">
                <Icone name="info" size={14} />
                {validacao}
              </p>
            )}
            <footer className="appointment-modal-footer">
              <p>
                <Icone name="info" size={15} />O agendamento poderá ser alterado posteriormente.
              </p>
              <div>
                <button type="button" className="appointment-cancel" onClick={aoFechar}>
                  Cancelar
                </button>
                <button type="submit" className="appointment-confirm" disabled={salvandoLocal}>
                  <Icone name="calendar" size={15} />
                  {valor ? 'Salvar alterações' : 'Confirmar agendamento'}
                </button>
              </div>
            </footer>
          </form>
        </div>
      )}
      {useResultadoAtualAberto && (
        <Suspense fallback={null}>
          <NovoUsuario
            initialRole="Cliente"
            replaceBackground
            onClose={() => {
              setUsuarioAberto(false);
              void aoAtualizarOpcoes().catch((erro: unknown) =>
                aoErroMecanicos(erro instanceof Error ? erro.message : 'Não foi possível atualizar os cadastros.'),
              );
            }}
            onCreated={(usuarioLocal) => {
              if (usuarioLocal) {
                setCliente(usuarioLocal.name);
                setTelefone(usuarioLocal.phone);
                setClienteId(null);
                void aoAtualizarOpcoes()
                  .then((opcoes) => {
                    const clienteNovo = opcoes.clientes.find(
                      (item) =>
                        item.id === usuarioLocal.id ||
                        (item.nome === usuarioLocal.name && item.telefone === usuarioLocal.phone),
                    );
                    if (clienteNovo) setClienteId(clienteNovo.id);
                  })
                  .catch((erro: unknown) =>
                    aoErroMecanicos(
                      erro instanceof Error
                        ? erro.message
                        : 'Não foi possível atualizar os cadastros.',
                    ),
                  );
              }
            }}
          />
        </Suspense>
      )}
      {duracaoAberto &&
        createPortal(
          <div
            className="appointment-duration-backdrop"
            onMouseDown={(evento) => {
              if (evento.target === evento.currentTarget) setDuracaoAberto(false);
            }}
          >
            <section
              className="appointment-duration-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="appointment-duration-title"
            >
              <header>
                <span>
                  <Icone name="clock" size={20} />
                </span>
                <div>
                  <h3 id="appointment-duration-title">Definir tempo personalizado</h3>
                  <p>Informe quanto tempo reservar para este atendimento.</p>
                </div>
                <button type="button" aria-label="Fechar" onClick={() => setDuracaoAberto(false)}>
                  <Icone name="close" size={17} />
                </button>
              </header>
              <div className="appointment-duration-fields">
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
                      value={duracaoHoras}
                      onChange={(evento) => setDuracaoHoras(evento.target.value)}
                    />
                    <small>h</small>
                  </div>
                </label>
                <b>:</b>
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
                      value={duracaoMinutos}
                      onChange={(evento) => setDuracaoMinutos(evento.target.value)}
                    />
                    <small>min</small>
                  </div>
                </label>
              </div>
              <div className="appointment-duration-preview">
                <Icone name="clock" size={16} />
                <span>Duração estimada</span>
                <strong>
                  {Number(duracaoHoras) || Number(duracaoMinutos)
                    ? [
                        Number(duracaoHoras) ? `${Number(duracaoHoras)}h` : '',
                        Number(duracaoMinutos) ? `${Number(duracaoMinutos)}min` : '',
                      ]
                        .filter(Boolean)
                        .join(' ')
                    : 'Defina horas e minutos'}
                </strong>
              </div>
              <footer>
                <button
                  type="button"
                  className="appointment-cancel"
                  onClick={() => setDuracaoAberto(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="appointment-confirm"
                  disabled={!Number(duracaoHoras) && !Number(duracaoMinutos)}
                  onClick={salvarCustomDuracao}
                >
                  <Icone name="check" size={15} />
                  Aplicar duração
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
      {horarioAberto &&
        createPortal(
          <div
            className="appointment-time-backdrop"
            onMouseDown={(evento) => {
              if (evento.target === evento.currentTarget) setHorarioAberto(false);
            }}
          >
            <section
              className="appointment-time-modal appointment-clock-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="appointment-time-title"
            >
              <header>
                <span>
                  <Icone name="clock" size={20} />
                </span>
                <div>
                  <h3 id="appointment-time-title">Escolher horário</h3>
                  <p>Ajuste os ponteiros ou digite o horário.</p>
                </div>
                <button type="button" aria-label="Fechar" onClick={() => setHorarioAberto(false)}>
                  <Icone name="close" size={17} />
                </button>
              </header>
              <div className="appointment-clock-summary">
                <div>
                  <small>HORÁRIO SELECIONADO</small>
                  <strong>{manualHorario || '--:--'}</strong>
                </div>
                <label>
                  <span>
                    Digitar horário <small>(24h)</small>
                  </span>
                  <input
                    aria-label="Digite o horário no formato de 24 horas"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="09:30"
                    value={manualHorario}
                    onChange={(evento) => editarManualHorario(evento.target.value)}
                  />
                </label>
              </div>
              <div className="appointment-clock-layout">
                <div
                  className={`appointment-clock-face picking-${relogioParte}`}
                  aria-label="Mostrador de relógio"
                  role="group"
                  onClick={selecionarPontoRelogio}
                >
                  <span className="appointment-clock-face-inner" />
                  {Array.from({ length: 60 }, (_, indiceLocal) => (
                    <i
                      key={`tick-${indiceLocal}`}
                      className={`appointment-clock-tick${indiceLocal % 5 === 0 ? ' major' : ''}`}
                      style={{
                        transform: `translate(-50%,-50%) rotate(${indiceLocal * 6}deg) translateY(-111px)`,
                      }}
                    />
                  ))}
                  {(relogioParte === 'hour' ? dialHoras : dialMinutos).map((valor, indiceLocal) => {
                    const angulo =
                      ((relogioParte === 'hour' ? valor % 12 : indiceLocal) * 30 * Math.PI) / 180;
                    const raio = 85;
                    const itemAtual = Math.sin(angulo) * raio;
                    const outroItem = -Math.cos(angulo) * raio;
                    const rotulo =
                      relogioParte === 'hour' ? String(valor) : String(valor).padStart(2, '0');
                    const selecionado =
                      relogioParte === 'hour'
                        ? relogioHora === valor
                        : (Math.round(relogioMinuto / 5) * 5) % 60 === valor;
                    return (
                      <button
                        type="button"
                        key={valor}
                        aria-label={
                          relogioParte === 'hour'
                            ? `Selecionar ${valor} horas`
                            : `Selecionar ${valor} minutos`
                        }
                        aria-pressed={selecionado}
                        className={`appointment-clock-number${selecionado ? ' selected' : ''}${selecionado && relogioParte === 'hour' ? ' active' : ''}`}
                        style={{
                          left: `calc(50% + ${itemAtual}px)`,
                          top: `calc(50% + ${outroItem}px)`,
                        }}
                        onClick={(evento) => {
                          evento.stopPropagation();
                          relogioParte === 'hour'
                            ? escolherRelogioHora(valor)
                            : escolherRelogioMinuto(valor);
                        }}
                      >
                        {rotulo}
                      </button>
                    );
                  })}
                  <span
                    className={`appointment-clock-hand hour${relogioParte === 'hour' ? ' active' : ''}`}
                    style={{
                      transform: `translate(-50%,-100%) rotate(${(relogioHora % 12) * 30 + relogioMinuto * 0.5}deg)`,
                    }}
                  />
                  <span
                    className={`appointment-clock-hand minute${relogioParte === 'minute' ? ' active' : ''}`}
                    style={{ transform: `translate(-50%,-100%) rotate(${relogioMinuto * 6}deg)` }}
                  />
                  <span className="appointment-clock-center" />
                </div>
                <aside className="appointment-clock-controls">
                  <p>Selecione no relógio</p>
                  <div
                    className="appointment-clock-tabs"
                    role="tablist"
                    aria-label="Selecionar hora ou minuto"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={relogioParte === 'hour'}
                      className={relogioParte === 'hour' ? 'active' : ''}
                      onClick={() => setRelogioParte('hour')}
                    >
                      Hora
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={relogioParte === 'minute'}
                      className={relogioParte === 'minute' ? 'active' : ''}
                      onClick={() => setRelogioParte('minute')}
                    >
                      Minutos
                    </button>
                  </div>
                  <span className="appointment-clock-period-label">Período do dia</span>
                  <div className="appointment-clock-period">
                    <button
                      type="button"
                      aria-pressed={relogioPeriodo === 'AM'}
                      className={relogioPeriodo === 'AM' ? 'active' : ''}
                      onClick={() => escolherRelogioPeriodo('AM')}
                    >
                      AM <small>manhã</small>
                    </button>
                    <button
                      type="button"
                      aria-pressed={relogioPeriodo === 'PM'}
                      className={relogioPeriodo === 'PM' ? 'active' : ''}
                      onClick={() => escolherRelogioPeriodo('PM')}
                    >
                      PM <small>tarde/noite</small>
                    </button>
                  </div>
                  <small className="appointment-clock-tip">
                    Toque em um número para mover o ponteiro.
                  </small>
                </aside>
              </div>
              {manualHorario && manualHorario.length >= 5 && !manualHorarioValido && (
                <p className="appointment-clock-error" role="alert">
                  Digite um horário válido entre 00:00 e 23:59.
                </p>
              )}
              <footer>
                <button
                  type="button"
                  className="appointment-cancel"
                  onClick={() => setHorarioAberto(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="appointment-confirm"
                  disabled={!manualHorarioValido}
                  onClick={confirmarHorario}
                >
                  <Icone name="check" size={15} />
                  Confirmar horário
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
function Calendario({
  month: mesLocal,
  items: itensLocal,
  selected: selecionado,
  onMonth: aoMudarMes,
  onSelect: aoSelecionar,
}: {
  month: Date;
  items: Agendamento[];
  selected: string;
  onMonth: (dadosAtual: Date) => void;
  onSelect: (dadosAtual: string) => void;
}) {
  const primeiro = new Date(mesLocal.getFullYear(), mesLocal.getMonth(), 1);
  const inicio = primeiro.getDay();
  const dias = new Date(mesLocal.getFullYear(), mesLocal.getMonth() + 1, 0).getDate();
  const anterior = new Date(mesLocal.getFullYear(), mesLocal.getMonth(), 0).getDate();
  const celulas = Array.from({ length: 42 }, (_, indice) => {
    const numero = indice - inicio + 1;
    const dentro = numero > 0 && numero <= dias;
    const dadosLocal = new Date(mesLocal.getFullYear(), mesLocal.getMonth(), numero);
    return {
      date: destinoEntradaDados(dadosLocal),
      day: dentro ? numero : numero <= 0 ? anterior + numero : numero - dias,
      inside: dentro,
    };
  });
  const mesNome = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    mesLocal,
  );
  const situacaoContagens = {
    confirmed: itensLocal.filter((primeiroElemento) => primeiroElemento.status === 'Confirmado')
      .length,
    pending: itensLocal.filter((primeiroElemento) => primeiroElemento.status === 'Pendente').length,
    done: itensLocal.filter((primeiroElemento) => primeiroElemento.status === 'Concluído').length,
    cancelled: itensLocal.filter((primeiroElemento) => primeiroElemento.status === 'Cancelado')
      .length,
  };
  return (
    <section className="appointment-side-card appointment-calendar">
      <header>
        <Icone name="calendar" size={17} />
        <h2>Calendário</h2>
      </header>
      <div className="calendar-month">
        <button
          aria-label="Mês anterior"
          onClick={() => aoMudarMes(new Date(mesLocal.getFullYear(), mesLocal.getMonth() - 1, 1))}
        >
          <Icone name="left" size={14} />
        </button>
        <strong>{mesNome}</strong>
        <button
          aria-label="Próximo mês"
          onClick={() => aoMudarMes(new Date(mesLocal.getFullYear(), mesLocal.getMonth() + 1, 1))}
        >
          <Icone name="right" size={14} />
        </button>
      </div>
      <div className="calendar-grid">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((itemAtual) => (
          <span className="calendar-weekday" key={itemAtual}>
            {itemAtual}
          </span>
        ))}
        {celulas.map((celula, indice) => {
          const quantidade = itensLocal.filter(
            (primeiroElemento) => primeiroElemento.data === celula.date,
          );
          return (
            <button
              type="button"
              key={`${celula.date}-${indice}`}
              aria-pressed={selecionado === celula.date}
              className={`${celula.inside ? '' : 'outside'}${selecionado === celula.date ? ' selected' : ''}`}
              onClick={() => aoSelecionar(selecionado === celula.date ? '' : celula.date)}
            >
              {celula.day}
              {quantidade.length > 0 && (
                <i className={`dot-${quantidade[0].status.toLowerCase().replace('í', 'i')}`} />
              )}
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span>
          <i className="confirmed" />
          {situacaoContagens.confirmed}
        </span>
        <span>
          <i className="pending" />
          {situacaoContagens.pending}
        </span>
        <span>
          <i className="done" />
          {situacaoContagens.done}
        </span>
        <span>
          <i className="cancelled" />
          {situacaoContagens.cancelled}
        </span>
      </div>
    </section>
  );
}
export default function Agendamentos() {
  const exibirCartao = useCartaoVisivel('agendamentos');
  const usuario = useUsuarioAdministrador();
  const navegar = useNavigate();
  const acesso = !!usuario;
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [clientesOpcoes, setClientesOpcoes] = useState<OpcoesAgendamento['clientes']>([]);
  const [busca, setBusca] = useState('');
  usePesquisaPagina(setBusca);
  const [situacaoLocal, setSituacao] = useState('Todos');
  const [intervalo, setIntervalo] = useState<DadosIntervalo | null>(null);
  const [ativoCartao, setAtivoCartao] = useState<string | null>(null);
  const [selecionadoDados, setSelecionadoDados] = useState('');
  const [mesLocal, setMes] = useState(new Date());
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setPaginaTamanho] = useState(8);
  const [modal, setModal] = useState<Agendamento | undefined>();
  const [modalAberto, setModalAberto] = useState(false);
  useAtalhoPagina({
    novo: () => {
      if (pode('agendamentos', 'criar')) {
        setModal(undefined);
        setModalAberto(true);
      }
    },
  });
  const [visualizacao, setVisualizacao] = useState<Agendamento>();
  const [excluindo, setExcluindo] = useState<Agendamento>();
  const [avisoTemporario, setAvisoTemporario] = useState('');
  const [mecanicos, setMecanicos] = useState<OpcaoAgendamento[]>([]);
  const [carregandoMecanicos, setMecanicosCarregando] = useState(true);
  const [mecanicosErro, setMecanicosErro] = useState('');
  const [mecanicosTentarNovamente, setMecanicosTentarNovamente] = useState(0);
  const [servicoCatalogo, setServicoCatalogo] = useState(lerCatalogoServicos);

  useEffect(() => observarCatalogoServicos(() => setServicoCatalogo(lerCatalogoServicos())), []);
  useEffect(() => {
    try {
      const bruto = sessionStorage.getItem(CHAVE_RASCUNHO_AGENDAMENTO);
      if (!bruto) return;
      const rascunho = JSON.parse(bruto) as Agendamento;
      sessionStorage.removeItem(CHAVE_RASCUNHO_AGENDAMENTO);
      if (rascunho && typeof rascunho === 'object') {
        setModal(rascunho);
        setModalAberto(true);
      }
    } catch {
      sessionStorage.removeItem(CHAVE_RASCUNHO_AGENDAMENTO);
    }
  }, []);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  async function atualizarOpcoes() {
    const opcoes = await buscarOpcoesAgendamento();
    setClientesOpcoes(opcoes.clientes);
    setMecanicos(
      opcoes.mecanicos.map((item) => ({
        value: String(item.id),
        label: item.nome,
        description: 'Mecânico ativo da equipe',
        icon: 'staff',
      })),
    );
    setMecanicosErro('');
    setMecanicosCarregando(false);
    return opcoes;
  }
  async function atualizarAgenda() {
    return buscarAgendamentos();
  }
  useEffect(() => {
    if (!acesso) return;
    let ativoLocal = true;
    setMecanicosCarregando(true);
    setMecanicosErro('');
    Promise.all([buscarAgendamentos(), buscarOpcoesAgendamento(), atualizarCatalogoCompartilhado()])
      .then(([dados, opcoes, catalogo]) => {
        if (ativoLocal) {
          setAgendamentos(dados);
          setClientesOpcoes(opcoes.clientes);
          setMecanicos(
            opcoes.mecanicos.map((item) => ({
              value: String(item.id),
              label: item.nome,
              description: 'Mecânico ativo da equipe',
              icon: 'staff',
            })),
          );
          setServicoCatalogo(catalogo);
          setMecanicosCarregando(false);
        }
      })
      .catch((eventoRecebido) => {
        if (ativoLocal) {
          setErroCarga(eventoRecebido.message);
          setMecanicosErro(eventoRecebido.message);
          setMecanicosCarregando(false);
        }
      })
      .finally(() => {
        if (ativoLocal) setCarregando(false);
      });
    return () => {
      ativoLocal = false;
    };
  }, [acesso, mecanicosTentarNovamente]);
  useDadosVivos(
    async (valido) => {
      try {
        const [dados, opcoesLocal, catalogo] = await Promise.all([
          buscarAgendamentos(),
          buscarOpcoesAgendamento(),
          atualizarCatalogoCompartilhado(),
        ]);
        if (valido()) {
          setAgendamentos(dados);
          setClientesOpcoes(opcoesLocal.clientes);
          setServicoCatalogo(catalogo);
          setMecanicos(
            opcoesLocal.mecanicos.map((registroAtual) => ({
                value: String(registroAtual.id),
                label: registroAtual.nome,
                description: 'Mecânico ativo da equipe',
                icon: 'staff',
              })),
          );
          setErroCarga('');
        }
      } catch (erroCapturado) {
        if (valido())
          setErroCarga(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível atualizar a agenda.',
          );
      }
    },
    acesso && !carregando && !salvando,
  );
  async function excluirAgenda(id: number) {
    if (salvando) return;
    setSalvando(true);
    try {
      await excluirAgendamento(id);
      setAgendamentos((itens) => itens.filter((item) => item.id !== id));
      setExcluindo(undefined);
      setAvisoTemporario('Agendamento removido.');
    } catch (erro) {
      setErroCarga(erro instanceof Error ? erro.message : 'Não foi possível excluir.');
    } finally {
      setSalvando(false);
    }
  }
  useEffect(() => {
    if (!avisoTemporario) return;
    const instanteAtual = setTimeout(() => setAvisoTemporario(''), 3200);
    return () => clearTimeout(instanteAtual);
  }, [avisoTemporario]);
  const contagens = useMemo(
    () => ({
      total: agendamentos.length,
      confirmed: agendamentos.filter((primeiroElemento) => primeiroElemento.status === 'Confirmado')
        .length,
      pending: agendamentos.filter((primeiroElemento) => primeiroElemento.status === 'Pendente')
        .length,
      cancelled: agendamentos.filter((primeiroElemento) => primeiroElemento.status === 'Cancelado')
        .length,
      done: agendamentos.filter((primeiroElemento) => primeiroElemento.status === 'Concluído')
        .length,
    }),
    [agendamentos],
  );
  const filtrado = useMemo(
    () =>
      agendamentos.filter((primeiroElemento) => {
        const dadosAtual = new Date(`${primeiroElemento.data}T12:00:00`);
        const base = new Date((selecionadoDados || destinoEntradaDados(new Date())) + 'T00:00:00');
        const fim = new Date(base);
        fim.setDate(fim.getDate() + 30);
        const dentroPeriodo = intervalo
          ? primeiroElemento.data >= intervalo.from && primeiroElemento.data <= intervalo.to
          : dadosAtual >= base && dadosAtual <= fim;
        return (
          (situacaoLocal === 'Todos' || primeiroElemento.status === situacaoLocal) &&
          (!selecionadoDados || primeiroElemento.data === selecionadoDados) &&
          dentroPeriodo &&
          correspondeBusca(
            busca,
            `${primeiroElemento.cliente} ${primeiroElemento.moto} ${primeiroElemento.placa} ${primeiroElemento.telefone}`,
          )
        );
      }),
    [agendamentos, situacaoLocal, selecionadoDados, busca, intervalo, mesLocal],
  );
  const paginas = Math.max(1, Math.ceil(filtrado.length / tamanhoPagina));
  const atual = Math.min(pagina, paginas);
  const linhas = filtrado.slice((atual - 1) * tamanhoPagina, atual * tamanhoPagina);
  const opcoesCatalogoServicos = servicoCatalogo.servicos
    .filter((item) => item.ativo)
    .map((item) => ({
      value: item.nome,
      description: `${servicoCatalogo.categorias.find((categoria) => categoria.id === item.categoriaId)?.nome ?? 'Serviço'} · ${item.duracao}`,
      icon: item.icone,
    }));
  async function salvar(item: Agendamento) {
    if (
      !pode(
        'agendamentos',
        agendamentos.some((primeiroElemento) => primeiroElemento.id === item.id)
          ? 'editar'
          : 'criar',
      )
    ) {
      setAvisoTemporario('Seu cargo não permite salvar este agendamento.');
      return;
    }
    if (salvando) return;
    setSalvando(true);
    try {
      const existente = item.id > 0 && agendamentos.some((registro) => registro.id === item.id);
      const salvo = await salvarAgendamento(existente ? item.id : null, {
        clienteId: item.clienteId,
        motoId: item.motoId,
        mecanicoId: item.mecanicoId ?? 0,
        servico: item.servico,
        status: item.status,
        data: item.data,
        hora: item.hora,
        duracao: item.duracao,
        observacoes: item.observacoes,
      });
      setAgendamentos((itens) =>
        existente
          ? itens.map((registro) => (registro.id === salvo.id ? salvo : registro))
          : [salvo, ...itens],
      );
      setModalAberto(false);
      setModal(undefined);
      limparRascunho(`agenda-${modal?.id ?? 'novo'}`);
      setAvisoTemporario('Agendamento salvo com sucesso.');
    } catch (erro) {
      setErroCarga(erro instanceof Error ? erro.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }
  function inicioEditar(item: Agendamento) {
    if (!pode('agendamentos', 'editar')) {
      setAvisoTemporario('Seu cargo não permite editar agendamentos.');
      return;
    }
    setVisualizacao(undefined);
    setModal(item);
    setModalAberto(true);
  }
  const cartaoDados = [
    {
      title: 'Total de agendamentos',
      value: contagens.total,
      subtitle: 'Todos os agendamentos',
      tone: 'blue',
      icon: 'list-checks',
      filter: 'Todos',
    },
    {
      title: 'Confirmados',
      value: contagens.confirmed,
      subtitle: `${contagens.total ? Math.round((contagens.confirmed / contagens.total) * 100) : 0}% do total`,
      tone: 'green',
      icon: 'check',
      filter: 'Confirmado',
    },
    {
      title: 'Pendentes',
      value: contagens.pending,
      subtitle: `${contagens.total ? Math.round((contagens.pending / contagens.total) * 100) : 0}% do total`,
      tone: 'amber',
      icon: 'clock',
      filter: 'Pendente',
    },
    {
      title: 'Cancelados',
      value: contagens.cancelled,
      subtitle: `${contagens.total ? Math.round((contagens.cancelled / contagens.total) * 100) : 0}% do total`,
      tone: 'blue',
      icon: 'circle-x',
      filter: 'Cancelado',
    },
    {
      title: 'Concluídos',
      value: contagens.done,
      subtitle: `${contagens.total ? Math.round((contagens.done / contagens.total) * 100) : 0}% do total`,
      tone: 'gray',
      icon: 'clipboard-check',
      filter: 'Concluído',
    },
  ];
  return (
    <div className="appointments-viewport">
      <div className="appointments-main">
        <main className="appointments-content">
          <ConteudoCarregando carregando={carregando}>
            {erroCarga && (
              <p role="alert">
                {erroCarga}
                <button
                  onClick={() =>
                    atualizarAgenda()
                      .then((dados) => {
                        setAgendamentos(dados);
                        setErroCarga('');
                      })
                      .catch((eventoRecebido) => setErroCarga(eventoRecebido.message))
                  }
                >
                  Tentar novamente
                </button>
              </p>
            )}
            <header className="appointments-page-title">
              <div>
                <h1>Agendamentos</h1>
                <p>Gerencie os agendamentos de serviços da sua oficina.</p>
              </div>
              <button
                className="appointment-new-button"
                onClick={() => {
                  setModal(undefined);
                  setModalAberto(true);
                }}
              >
                <Icone name="plus" size={15} />
                Novo agendamento
              </button>
            </header>
            <div className="appointment-metrics indicadores-grid" data-indicadores data-colunas="5">
              {cartaoDados.map((elementoAtual) => (
                <CartaoIndicador
                  key={elementoAtual.title}
                  editorId={`agendamentos:${elementoAtual.filter}`}
                  oculto={!exibirCartao(elementoAtual.filter)}
                  titulo={elementoAtual.title}
                  descricao={elementoAtual.subtitle}
                  valor={elementoAtual.value}
                  icone={elementoAtual.icon}
                  tom={elementoAtual.tone}
                  total={contagens.total}
                  ativo={ativoCartao === elementoAtual.title}
                  aoClicar={() => {
                    setSituacao(elementoAtual.filter);
                    setAtivoCartao(elementoAtual.title);
                    setSelecionadoDados('');
                    setPagina(1);
                  }}
                />
              ))}
            </div>
            <div className="appointments-layout">
              <section className="appointment-list-card">
                <div className="appointment-filters">
                  <label className="appointment-list-search">
                    <Icone name="search" size={16} />
                    <input
                      placeholder="Buscar por cliente, moto ou placa..."
                      value={busca}
                      onChange={(eventoRecebido) => {
                        setBusca(eventoRecebido.target.value);
                        setPagina(1);
                      }}
                    />
                  </label>
                  <SituacaoSeletor
                    value={situacaoLocal}
                    onChange={(valor) => {
                      setSituacao(valor);
                      setAtivoCartao(null);
                      setPagina(1);
                    }}
                  />
                  <div className="appointment-period-filter">
                    <span className="appointment-filter-caption">Período</span>
                    <SeletorPeriodo
                      mode="range"
                      value={intervalo}
                      placeholder="Próximos 30 dias"
                      label="Selecionar período de agendamentos"
                      onApply={(valor) => {
                        setIntervalo(valor);
                        setSelecionadoDados('');
                        setPagina(1);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="appointment-clear"
                    onClick={() => {
                      setSituacao('Todos');
                      setAtivoCartao(null);
                      setIntervalo(null);
                      setSelecionadoDados('');
                      setBusca('');
                      setPagina(1);
                    }}
                  >
                    <Icone name="close" size={14} />
                    Limpar filtros
                  </button>
                </div>
                {selecionadoDados && (
                  <button className="selected-date-filter" onClick={() => setSelecionadoDados('')}>
                    Filtrando por {dadosRotulo(selecionadoDados)} <Icone name="close" size={12} />
                  </button>
                )}
                <div className="appointment-table-wrap">
                  <table className="appointment-table">
                    <thead>
                      <tr>
                        <th>Data e Hora</th>
                        <th>Cliente / Contato</th>
                        <th>Motocicleta</th>
                        <th>Serviço</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((primeiroElemento) => (
                        <tr key={primeiroElemento.id}>
                          <td>
                            <strong>
                              <Icone name="calendar" size={13} />
                              {dadosRotulo(primeiroElemento.data)}
                            </strong>
                            <small>{primeiroElemento.hora}</small>
                          </td>
                          <td>
                            <strong>{primeiroElemento.cliente}</strong>
                            <small>
                              {primeiroElemento.telefone} <Icone name="whatsapp" size={12} />
                            </small>
                          </td>
                          <td>
                            <strong>{primeiroElemento.moto}</strong>
                            <small>PLACA {primeiroElemento.placa}</small>
                          </td>
                          <td>{primeiroElemento.servico}</td>
                          <td>
                            <span
                              className={`appointment-status ${primeiroElemento.status.toLowerCase().replace('í', 'i')}`}
                            >
                              <i />
                              {primeiroElemento.status}
                            </span>
                          </td>
                          <td>
                            <div className="appointment-row-actions">
                              <button
                                aria-label={`Ver ${primeiroElemento.cliente}`}
                                onClick={() => setVisualizacao(primeiroElemento)}
                              >
                                <Icone name="eye" size={15} />
                              </button>
                              <button
                                aria-label={`Editar ${primeiroElemento.cliente}`}
                                onClick={() => inicioEditar(primeiroElemento)}
                              >
                                <Icone name="pencil" size={15} />
                              </button>
                              <button
                                aria-label={`Excluir agendamento de ${primeiroElemento.cliente}`}
                                className="delete"
                                onClick={() => setExcluindo(primeiroElemento)}
                              >
                                <Icone name="trash" size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!linhas.length && (
                        <tr>
                          <td className="appointment-empty" colSpan={6}>
                            Nenhum agendamento encontrado para os filtros selecionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <footer className="appointment-pagination">
                  <span>
                    Mostrando {filtrado.length ? (atual - 1) * tamanhoPagina + 1 : 0} a{' '}
                    {Math.min(atual * tamanhoPagina, filtrado.length)} de {filtrado.length}{' '}
                    agendamentos
                  </span>
                  <nav aria-label="Paginação de agendamentos">
                    <button
                      disabled={atual === 1}
                      onClick={() => setPagina((itemAtual) => Math.max(1, itemAtual - 1))}
                    >
                      <Icone name="left" size={13} />
                    </button>
                    {Array.from({ length: paginas }, (_, indice) => indice + 1).map((numero) => (
                      <button
                        key={numero}
                        className={numero === atual ? 'active' : ''}
                        onClick={() => setPagina(numero)}
                      >
                        {numero}
                      </button>
                    ))}
                    <button
                      disabled={atual === paginas}
                      onClick={() => setPagina((itemAtual) => Math.min(paginas, itemAtual + 1))}
                    >
                      <Icone name="right" size={13} />
                    </button>
                  </nav>
                  <select
                    aria-label="Resultados por página"
                    value={tamanhoPagina}
                    onChange={(eventoRecebido) => {
                      setPaginaTamanho(Number(eventoRecebido.target.value));
                      setPagina(1);
                    }}
                  >
                    <option value={8}>8 por página</option>
                    <option value={16}>16 por página</option>
                  </select>
                </footer>
              </section>
              <aside className="appointments-sidebar">
                <Calendario
                  month={mesLocal}
                  items={agendamentos}
                  selected={selecionadoDados || destinoEntradaDados(new Date())}
                  onMonth={setMes}
                  onSelect={setSelecionadoDados}
                />
                <section className="appointment-side-card appointment-status-summary">
                  <h2>Status dos agendamentos</h2>
                  {[
                    ['Confirmado', contagens.confirmed, 'Agendamento confirmado pelo cliente.'],
                    ['Pendente', contagens.pending, 'Aguardando confirmação do cliente.'],
                    ['Concluído', contagens.done, 'Serviço realizado com sucesso.'],
                    ['Cancelado', contagens.cancelled, 'Agendamento cancelado.'],
                  ].map(([textoAtual, numero, dadosAtual]) => (
                    <div key={String(textoAtual)}>
                      <i
                        className={`summary-dot ${String(textoAtual).toLowerCase().replace('í', 'i')}`}
                      />
                      <span>
                        <strong>{textoAtual}</strong>
                        <small>{dadosAtual}</small>
                      </span>
                      <b>{numero}</b>
                    </div>
                  ))}
                </section>
              </aside>
            </div>
          </ConteudoCarregando>
        </main>
      </div>
      {avisoTemporario && (
        <div className="appointment-toast" role="status">
          {avisoTemporario}
        </div>
      )}
      {modalAberto && (
        <PaginaNovoAgendamento
          value={modal}
          clients={clientesOpcoes}
          mechanics={mecanicos}
          mechanicsLoading={carregandoMecanicos}
          mechanicsError={mecanicosErro}
          onRetryMechanics={() => setMecanicosTentarNovamente((valor) => valor + 1)}
          onRefreshOptions={atualizarOpcoes}
          onMechanicsError={setMecanicosErro}
          serviceCatalogOptions={opcoesCatalogoServicos}
          saving={salvando}
          onClose={() => {
            setModalAberto(false);
            setModal(undefined);
          }}
          onGoServices={(rascunho) => {
            try {
              sessionStorage.setItem(CHAVE_RASCUNHO_AGENDAMENTO, JSON.stringify(rascunho));
            } catch {
              /* Se o armazenamento estiver bloqueado, a navegacao continua normalmente. */
            }
            setModalAberto(false);
            setModal(undefined);
            navegar('/servicos');
          }}
          onSave={salvar}
        />
      )}
      {visualizacao && (
        <div
          className="appointment-overlay"
          onMouseDown={(eventoRecebido) => {
            if (eventoRecebido.target === eventoRecebido.currentTarget) setVisualizacao(undefined);
          }}
        >
          <section
            className="appointment-view-modal appointment-view-redesigned"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-view-title"
          >
            <header className="appointment-view-header">
              <span>
                <Icone name="calendar" size={19} />
              </span>
              <div>
                <small>ESTAÇÃO MOTOS · AGENDAMENTOS</small>
                <strong id="appointment-view-title">Detalhes do atendimento</strong>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setVisualizacao(undefined)}>
                <Icone name="close" size={17} />
              </button>
            </header>
            <div className="appointment-view-content">
              <div className="appointment-view-person">
                <span className="appointment-view-avatar">
                  {iniciaisLocal(visualizacao.cliente)}
                </span>
                <div className="appointment-view-person-copy">
                  <small>CLIENTE</small>
                  <h2>{visualizacao.cliente}</h2>
                  <div>
                    <span>
                      <Icone name="bike" size={14} />
                      {visualizacao.moto}
                    </span>
                    <b>PLACA {visualizacao.placa}</b>
                  </div>
                </div>
                <span
                  className={`appointment-status ${visualizacao.status.toLowerCase().replace('í', 'i')}`}
                >
                  <i />
                  {visualizacao.status}
                </span>
              </div>
              <div className="appointment-view-grid">
                <article>
                  <span>
                    <Icone name="calendar" size={16} />
                  </span>
                  <div>
                    <small>Data e horário</small>
                    <strong>
                      {dadosRotulo(visualizacao.data)} · {visualizacao.hora}
                    </strong>
                  </div>
                </article>
                <article>
                  <span>
                    <Icone name="wrench" size={16} />
                  </span>
                  <div>
                    <small>Serviço</small>
                    <strong>{visualizacao.servico}</strong>
                  </div>
                </article>
                <article>
                  <span>
                    <Icone name="staff" size={16} />
                  </span>
                  <div>
                    <small>Mecânico responsável</small>
                    <strong>{visualizacao.mecanico}</strong>
                  </div>
                </article>
                <article>
                  <span>
                    <Icone name="clock" size={16} />
                  </span>
                  <div>
                    <small>Duração estimada</small>
                    <strong>{visualizacao.duracao || 'Não informada'}</strong>
                  </div>
                </article>
                <article className="appointment-view-contact">
                  <span>
                    <Icone name="whatsapp" size={16} />
                  </span>
                  <div>
                    <small>Contato do cliente</small>
                    <strong>{visualizacao.telefone || 'Não informado'}</strong>
                  </div>
                </article>
              </div>
              {visualizacao.observacoes && (
                <div className="appointment-view-notes">
                  <small>OBSERVAÇÕES</small>
                  <p>{visualizacao.observacoes}</p>
                </div>
              )}
              <footer className="appointment-view-footer">
                <button
                  type="button"
                  className="appointment-cancel"
                  onClick={() => setVisualizacao(undefined)}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  className="appointment-confirm"
                  onClick={() => inicioEditar(visualizacao)}
                >
                  <Icone name="pencil" size={14} />
                  Editar agendamento
                </button>
              </footer>
            </div>
          </section>
        </div>
      )}
      {excluindo && (
        <div
          className="oa-confirm-backdrop"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) setExcluindo(undefined);
          }}
        >
          <section
            className="oa-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="appointment-delete-title"
          >
            <span className="oa-confirm-icon destructive">
              <Icone name="trash" size={19} />
            </span>
            <div>
              <button
                type="button"
                className="oa-confirm-close"
                aria-label="Fechar"
                onClick={() => setExcluindo(undefined)}
              >
                <Icone name="close" size={15} />
              </button>
              <h3 id="appointment-delete-title">Excluir agendamento?</h3>
              <p>
                Tem certeza que deseja excluir o agendamento de <strong>{excluindo.cliente}</strong>{' '}
                para <strong>{excluindo.servico}</strong>, em {dadosRotulo(excluindo.data)} às{' '}
                {excluindo.hora}?
              </p>
              <p>Esta ação é permanente e não poderá ser desfeita.</p>
              <div className="oa-confirm-actions">
                <button type="button" onClick={() => setExcluindo(undefined)}>
                  Manter agendamento
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    if (!pode('agendamentos', 'excluir')) {
                      setAvisoTemporario('Seu cargo não permite excluir agendamentos.');
                      return;
                    }
                    void excluirAgenda(excluindo.id);
                  }}
                >
                  <Icone name="trash" size={13} />
                  Excluir agendamento
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
