import CartaoIndicador from '../components/CartaoIndicador';
import SkeletonDashboard from '../components/SkeletonDashboard';
import Skeleton from '../components/Skeleton';
import { useCartaoVisivel } from '../hooks/useCartoesPagina';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GraficoOrdens from '../components/GraficoOrdens';
import { Icone } from '../components/MenuAdmin';
import SeletorFiltro from '../components/SeletorFiltro';
import SeletorPeriodo, { type DadosIntervalo } from '../components/SeletorPeriodo';
import { useDadosVivos } from '../hooks/useDadosVivos';
import {
  buscarNotificacoesAdministrador,
  request,
  type ItemOrdem,
  type RespostaOrdens,
  type SituacaoOrdem,
} from '../services/apiAutenticacao';
import './dashboard.css';
type OrdemPainel = {
  id: number;
  status: SituacaoOrdem;
  entry: string;
  exit: string | null;
  forecast: string | null;
  mechanicId: number | null;
};
type TecnicoPainel = { id: number; nome: string; cargo: string };
type DadosPainel = {
  orders: OrdemPainel[];
  counts: RespostaOrdens['counts'];
  oldest: ItemOrdem[];
  employees: TecnicoPainel[];
};

const vazio: RespostaOrdens = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 15,
  counts: {
    aguardando: 0,
    'em andamento': 0,
    'aguardando peça': 0,
    pronto: 0,
    entregue: 0,
    cancelada: 0,
  },
};
const situacaoInformacao: { key: SituacaoOrdem; label: string; color: string }[] = [
  { key: 'aguardando', label: 'Em aberto', color: '#ef3348' },
  { key: 'em andamento', label: 'Em andamento', color: '#ed7624' },
  { key: 'aguardando peça', label: 'Aguardando peça', color: '#3b82f6' },
  { key: 'pronto', label: 'Prontas para entrega', color: '#06b6d4' },
  { key: 'entregue', label: 'Finalizadas', color: '#10b981' },
  { key: 'cancelada', label: 'Canceladas', color: '#94a3b8' },
];

function dadosChave(valor: string) {
  return valor.slice(0, 10);
}
function dadosCurta(valor: string) {
  if (!valor) return '—';
  const [dadosLocal, horario = ''] = valor.replace('T', ' ').split(' ');
  const [, mes, dia] = dadosLocal.split('-');
  return `${dia}/${mes}${horario ? ` · ${horario.slice(0, 5)}` : ''}`;
}

export default function PainelInicial() {
  const exibirCartao = useCartaoVisivel('dashboard');
  const navegar = useNavigate();
  const [resumo, setResumo] = useState<RespostaOrdens>(vazio);
  const [mensal, setMensal] = useState<OrdemPainel[]>([]);
  const [periodoGrafico, setChartPeriodo] = useState(() => {
    const salvo = localStorage.getItem('estacao-periodo-dashboard');
    return salvo === 'diario' || salvo === 'mensal' ? salvo : 'semanal';
  });
  const [customIntervalo, setCustomIntervalo] = useState<DadosIntervalo | null>(null);
  const [pickingIntervalo, setPickingIntervalo] = useState(false);
  const [pickerRevisao, setSeletorRevisao] = useState(0);
  const [semanal, setSemanal] = useState<OrdemPainel[]>([]);
  const [maisAntigo, setMaisAntigo] = useState<ItemOrdem[]>([]);
  const [ativoOrdens, setAtivoOrdens] = useState<OrdemPainel[]>([]);
  const [equipe, setEquipe] = useState<TecnicoPainel[]>([]);
  const [avisos, setAvisos] = useState<
    { title: string; body: string; orderId: number | null; createdAt: string }[]
  >([]);
  const [naoLido, setNaoLido] = useState(0);
  const [avisosEstado, setAvisosEstado] = useState<'pending' | 'ok' | 'error'>('pending');
  const [carregando, setCarregando] = useState(true);
  const [carregado, setCarregado] = useState(false);
  const [equipePeriodo, setEquipePeriodo] = useState('mes');
  const [equipeIntervalo, setEquipeIntervalo] = useState<DadosIntervalo | null>(null);
  const [seletorEquipe, setEquipeSeletor] = useState(false);
  const [equipeSeletorRevisao, setEquipeSeletorRevisao] = useState(0);
  const [erro, setErro] = useState('');
  const solicitacaoRevisao = useRef(0);

  const atualizar = useCallback(() => {
    let ativo = true;
    const revisao = ++solicitacaoRevisao.current;
    const ehAtual = () => ativo && solicitacaoRevisao.current === revisao;
    setCarregando(true);
    setErro('');
    const agora = new Date();
    const mes = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    })
      .format(agora)
      .slice(0, 7);
    request<DadosPainel>('/api/admin/dashboard', { method: 'GET' })
      .then((dados) => {
        if (!ehAtual()) return;
        setResumo({ ...vazio, total: dados.orders.length, counts: dados.counts });
        setSemanal(dados.orders);
        setMensal(dados.orders.filter((objetoAtual) => objetoAtual.entry.slice(0, 7) === mes));
        setAtivoOrdens(
          dados.orders.filter(
            (objetoAtual) => !['entregue', 'cancelada'].includes(objetoAtual.status),
          ),
        );
        setMaisAntigo(dados.oldest);
        setEquipe(dados.employees);
        setCarregado(true);
      })
      .catch((erroCapturado) => {
        if (ehAtual())
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível carregar o painel.',
          );
      })
      .finally(() => {
        if (ehAtual()) setCarregando(false);
      });
    buscarNotificacoesAdministrador()
      .then((dados) => {
        if (ehAtual()) {
          setAvisos(dados.items.filter((item) => !item.read).slice(0, 4));
          setNaoLido(dados.unreadCount);
          setAvisosEstado('ok');
        }
      })
      .catch(() => {
        if (ehAtual()) setAvisosEstado('error');
      });

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    const cancelar = atualizar();
    return () => {
      cancelar();
      solicitacaoRevisao.current += 1;
    };
  }, [atualizar]);
  useDadosVivos(async (valido) => {
    const dados = await request<DadosPainel>('/api/admin/dashboard', { method: 'GET' });
    if (!valido()) return;
    const mes = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    })
      .format(new Date())
      .slice(0, 7);
    setResumo({ ...vazio, total: dados.orders.length, counts: dados.counts });
    setSemanal(dados.orders);
    setMensal(dados.orders.filter((objetoAtual) => objetoAtual.entry.slice(0, 7) === mes));
    setAtivoOrdens(
      dados.orders.filter((objetoAtual) => !['entregue', 'cancelada'].includes(objetoAtual.status)),
    );
    setMaisAntigo(dados.oldest);
    setEquipe(dados.employees);
  }, carregado && !carregando);
  const semanalSerie = useMemo(() => {
    const hoje = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [ano, mes, dia] = hoje.split('-').map(Number);
    const hojeUtc = Date.UTC(ano, mes - 1, dia);
    const quantidade =
      periodoGrafico === 'semanal'
        ? 8
        : periodoGrafico === 'mensal'
          ? 6
          : periodoGrafico === 'personalizado' && customIntervalo
            ? Math.ceil(
                (Math.round(
                  (Date.parse(customIntervalo.to) - Date.parse(customIntervalo.from)) / 86400000,
                ) +
                  1) /
                  Math.max(
                    1,
                    Math.ceil(
                      (Math.round(
                        (Date.parse(customIntervalo.to) - Date.parse(customIntervalo.from)) /
                          86400000,
                      ) +
                        1) /
                        31,
                    ),
                  ),
              )
            : 30;
    const intervaloInicio = customIntervalo
      ? Date.parse(customIntervalo.from + 'T00:00:00Z')
      : hojeUtc;
    const intervaloFim = customIntervalo
      ? Date.parse(customIntervalo.to + 'T00:00:00Z') + 86400000
      : hojeUtc + 86400000;
    const dias = Array.from({ length: quantidade }, (_, indice) => {
      let origem: number;
      let destino: number;
      if (periodoGrafico === 'mensal') {
        origem = Date.UTC(ano, mes - 1 - (quantidade - 1 - indice), 1);
        destino = Date.UTC(ano, mes - (quantidade - 1 - indice), 1);
      } else if (periodoGrafico === 'semanal') {
        origem = hojeUtc - (quantidade - 1 - indice) * 7 * 86400000 - 6 * 86400000;
        destino = origem + 7 * 86400000;
      } else if (periodoGrafico === 'personalizado' && customIntervalo) {
        const passo =
          Math.max(1, Math.ceil((intervaloFim - intervaloInicio) / 86400000 / 31)) * 86400000;
        origem = intervaloInicio + indice * passo;
        destino = Math.min(intervaloFim, origem + passo);
      } else {
        origem = hojeUtc - (quantidade - 1 - indice) * 86400000;
        destino = origem + 86400000;
      }
      const dadosLocal = new Date(origem);
      const rotulo = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'UTC',
        ...(periodoGrafico === 'mensal'
          ? { month: 'short', year: '2-digit' }
          : { day: '2-digit', month: '2-digit' }),
      }).format(dadosLocal);
      const dadosFormatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const rotuloDica =
        destino - origem > 86400000
          ? `${dadosFormatter.format(new Date(origem))} – ${dadosFormatter.format(new Date(destino - 1))}`
          : dadosFormatter.format(dadosLocal);
      return {
        key: String(origem),
        label: rotulo,
        tooltipLabel: rotuloDica,
        count: semanal.filter((ordem) => {
          const horario = Date.parse(dadosChave(ordem.entry) + 'T00:00:00Z');
          return horario >= origem && horario < destino;
        }).length,
      };
    });
    return dias;
  }, [semanal, periodoGrafico, customIntervalo]);
  const chartTotal = semanalSerie.reduce((soma, dia) => soma + dia.count, 0);
  const peakDia = semanalSerie.reduce(
    (melhor, dia) => (dia.count > melhor.count ? dia : melhor),
    semanalSerie[0],
  );
  const roscaTotal = situacaoInformacao.reduce((soma, item) => soma + resumo.counts[item.key], 0);
  const gradienteRosca = useMemo(() => {
    let posicao = 0;
    const paradas = situacaoInformacao.map((item) => {
      const inicio = posicao;
      posicao += roscaTotal ? (resumo.counts[item.key] / roscaTotal) * 100 : 0;
      return resumo.counts[item.key]
        ? `${item.color} ${inicio}% ${Math.max(inicio, posicao - 0.45)}%, #fff ${Math.max(inicio, posicao - 0.45)}% ${posicao}%`
        : `${item.color} ${inicio}% ${posicao}%`;
    });
    return `conic-gradient(${paradas.join(', ')})`;
  }, [resumo, roscaTotal]);
  const equipeOrdenada = useMemo(() => {
    const hoje = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const dadosLocal = new Date(hoje + 'T12:00:00Z');
    dadosLocal.setUTCDate(dadosLocal.getUTCDate() - 6);
    const origem =
      equipePeriodo === 'dia'
        ? hoje
        : equipePeriodo === 'semana'
          ? dadosLocal.toISOString().slice(0, 10)
          : equipePeriodo === 'personalizado' && equipeIntervalo
            ? equipeIntervalo.from
            : hoje.slice(0, 7) + '-01';
    const destino =
      equipePeriodo === 'personalizado' && equipeIntervalo ? equipeIntervalo.to : hoje;
    return equipe
      .map((pessoa) => {
        const ordens = semanal.filter(
          (objetoAtual) =>
            objetoAtual.mechanicId === pessoa.id &&
            objetoAtual.status !== 'cancelada' &&
            objetoAtual.entry.slice(0, 10) >= origem &&
            objetoAtual.entry.slice(0, 10) <= destino,
        );
        return {
          ...pessoa,
          worked: ordens.length,
          completed: ordens.filter((objetoAtual) =>
            ['pronto', 'entregue'].includes(objetoAtual.status),
          ).length,
        };
      })
      .filter((registroAtual) => registroAtual.worked > 0)
      .sort(
        (primeiroElemento, segundoElemento) =>
          segundoElemento.worked - primeiroElemento.worked ||
          segundoElemento.completed - primeiroElemento.completed ||
          primeiroElemento.nome.localeCompare(segundoElemento.nome, 'pt-BR'),
      )
      .slice(0, 5);
  }, [equipe, semanal, equipePeriodo, equipeIntervalo]);
  const equipeMes = mensal.filter(
    (objetoAtual) => objetoAtual.mechanicId !== null && objetoAtual.status !== 'cancelada',
  );
  const produtividade = equipeMes.length
    ? Math.round(
        (equipeMes.filter((objetoAtual) => ['pronto', 'entregue'].includes(objetoAtual.status))
          .length /
          equipeMes.length) *
          100,
      )
    : 0;
  const temProdutividadeDados = equipeMes.length > 0;
  const atrasados = ativoOrdens.filter(
    (ordem) => ordem.forecast && new Date(ordem.forecast).getTime() < Date.now(),
  ).length;
  function irOrdem(idOrdem: number | null) {
    if (idOrdem) navegar(`/ordens-de-servico/${idOrdem}`);
    else navegar('/ordens-de-servico');
  }

  return (
    <div className="orders-viewport dashboard-viewport">
      <div className="orders-main dashboard-main">
        <main className="dashboard-content">
          <div className="dashboard-title-row">
            <div>
              <h2>Visão geral da oficina</h2>
              <p>Acompanhe sua operação. Priorize o que precisa de atenção.</p>
            </div>
            <button className="dashboard-refresh" onClick={() => atualizar()} disabled={carregando}>
              <img src="/assets/services/reload-double.svg" width="16" height="16" alt="" />
              {carregando ? 'Atualizando' : 'Atualizar painel'}
            </button>
          </div>
          {erro && (
            <div className="dashboard-error" role="alert">
              <span>{erro}</span>
              <button onClick={() => atualizar()}>Tentar novamente</button>
            </div>
          )}

          {!carregado ? (
            erro ? (
              <div className="dashboard-empty">
                O resumo não foi carregado. Use “Tentar novamente” acima.
              </div>
            ) : (
              <SkeletonDashboard />
            )
          ) : (
            <>
              <section
                className="dashboard-kpis indicadores-grid"
                data-indicadores
                data-colunas="5"
                aria-label="Resumo da oficina"
              >
                <CartaoIndicador
                  titulo="Em aberto"
                  valor={resumo.counts.aguardando}
                  descricao="Precisam de atendimento"
                  icone="clipboard"
                  tom="red"
                  editorId="dashboard:abertas"
                  oculto={!exibirCartao('abertas')}
                  aoClicar={() => navegar('/ordens-de-servico?status=aguardando')}
                />
                <CartaoIndicador
                  titulo="Em andamento"
                  valor={resumo.counts['em andamento']}
                  descricao="Serviços em execução"
                  icone="wrench"
                  tom="amber"
                  editorId="dashboard:andamento"
                  oculto={!exibirCartao('andamento')}
                  aoClicar={() => navegar('/ordens-de-servico?status=em%20andamento')}
                />
                <CartaoIndicador
                  titulo="Aguardando peça"
                  valor={resumo.counts['aguardando peça']}
                  descricao="Dependem de reposição"
                  icone="package"
                  tom="blue"
                  editorId="dashboard:peca"
                  oculto={!exibirCartao('peca')}
                  aoClicar={() => navegar('/ordens-de-servico?status=aguardando%20peça')}
                />
                <CartaoIndicador
                  titulo="Concluídas"
                  valor={resumo.counts.entregue}
                  descricao="Total histórico de entregas"
                  icone="check"
                  tom="green"
                  editorId="dashboard:concluidas"
                  oculto={!exibirCartao('concluidas')}
                  aoClicar={() => navegar('/ordens-de-servico?status=entregue')}
                />
                <CartaoIndicador
                  titulo="Produtividade da equipe"
                  valor={temProdutividadeDados ? `${produtividade}%` : '—'}
                  descricao={
                    temProdutividadeDados ? 'Conclusão das OS do mês' : 'Ainda sem atividade no mês'
                  }
                  icone="users"
                  tom="violet"
                  editorId="dashboard:equipe"
                  oculto={!exibirCartao('equipe')}
                  aoClicar={() => navegar('/funcionarios')}
                />
              </section>

              <section className="dashboard-visuals">
                <article className="dashboard-panel volume-panel">
                  <div className="panel-heading">
                    <div className="panel-title-icon rose">
                      <Icone name="activity" size={18} />
                    </div>
                    <div>
                      <h3>Movimento da oficina</h3>
                      <p>
                        {semanalSerie[0]?.tooltipLabel?.split(' – ')[0]} a{' '}
                        {semanalSerie.at(-1)?.tooltipLabel?.split(' – ').at(-1)}
                      </p>
                    </div>
                    <div className="dashboard-period">
                      <SeletorFiltro
                        label="Agrupamento do gráfico"
                        value={periodoGrafico}
                        variant="toolbar"
                        options={[
                          { value: 'diario', label: 'Diário' },
                          { value: 'semanal', label: 'Semanal' },
                          { value: 'mensal', label: 'Mensal' },
                          { value: 'personalizado', label: 'Personalizado' },
                        ]}
                        onChange={(valor) => {
                          if (valor === 'personalizado') {
                            setSeletorRevisao((valorAtual) => valorAtual + 1);
                            setPickingIntervalo(true);
                          } else {
                            setChartPeriodo(valor);
                            setPickingIntervalo(false);
                          }
                        }}
                      />
                      {pickingIntervalo && (
                        <SeletorPeriodo
                          key={pickerRevisao}
                          autoOpen
                          value={customIntervalo}
                          onApply={(intervalo) => {
                            if (intervalo) {
                              setCustomIntervalo(intervalo);
                              setChartPeriodo('personalizado');
                            }
                            setPickingIntervalo(false);
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="volume-summary">
                    <strong>{chartTotal}</strong>
                    <span>ordens abertas no período</span>
                    <span className="volume-peak">
                      {peakDia.count
                        ? `Pico: ${peakDia.label} · ${peakDia.count} OS`
                        : 'Sem novas ordens neste período'}
                    </span>
                  </div>
                  <GraficoOrdens data={semanalSerie} />
                </article>
                <article className="dashboard-panel status-panel">
                  <div className="panel-heading">
                    <div className="panel-title-icon rose">
                      <Icone name="gauge" size={15} />
                    </div>
                    <div>
                      <h3>Status das OS</h3>
                      <p>Distribuição atual</p>
                    </div>
                    <button className="panel-link" onClick={() => navegar('/ordens-de-servico')}>
                      Ver lista <Icone name="right" size={12} />
                    </button>
                  </div>
                  <div className="status-overview">
                    <div
                      className="status-donut"
                      style={{
                        background: roscaTotal ? gradienteRosca : 'conic-gradient(#e6ebf1 0 100%)',
                      }}
                    >
                      <div>
                        <strong>{roscaTotal}</strong>
                        <small>ordens</small>
                      </div>
                    </div>
                    <div className="status-legend">
                      {situacaoInformacao.map((item) => (
                        <div className="legend-row" key={item.key}>
                          <i style={{ background: item.color }} />
                          <span>{item.label}</span>
                          <b>{resumo.counts[item.key]}</b>
                          <small>
                            {roscaTotal
                              ? Math.round((resumo.counts[item.key] / roscaTotal) * 100)
                              : 0}
                            %
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              </section>

              <section className="dashboard-details">
                <article className="dashboard-panel oldest-panel">
                  <div className="panel-heading">
                    <div className="panel-title-icon blue">
                      <Icone name="clock" size={15} />
                    </div>
                    <div>
                      <h3>Ordens mais antigas</h3>
                      <p>Solicitações que estão há mais tempo na fila</p>
                    </div>
                    <button className="panel-link" onClick={() => navegar('/ordens-de-servico')}>
                      Todas as OS <Icone name="right" size={12} />
                    </button>
                  </div>
                  <div className="oldest-table">
                    <div className="oldest-head">
                      <span>OS / CLIENTE</span>
                      <span>MOTOCICLETA</span>
                      <span>ABERTA EM</span>
                      <span>STATUS</span>
                    </div>
                    {maisAntigo.map((ordem) => (
                      <button
                        className="oldest-row"
                        key={ordem.id}
                        onClick={() => irOrdem(ordem.id)}
                      >
                        <span>
                          <b>#{ordem.id}</b>
                          <small>{ordem.client}</small>
                        </span>
                        <span>
                          <b>{ordem.motorcycle}</b>
                          <small>{ordem.plate || 'Placa não informada'}</small>
                        </span>
                        <span>{dadosCurta(ordem.entry)}</span>
                        <span>
                          <i className={`status-pill status-${ordem.status.replaceAll(' ', '-')}`}>
                            {ordem.status === 'aguardando'
                              ? 'Aberta'
                              : ordem.status === 'em andamento'
                                ? 'Em andamento'
                                : ordem.status === 'aguardando peça'
                                  ? 'Aguard. peça'
                                  : ordem.status === 'entregue'
                                    ? 'Finalizada'
                                    : ordem.status === 'cancelada'
                                      ? 'Cancelada'
                                      : 'Pronta'}
                          </i>
                        </span>
                      </button>
                    ))}
                    {!maisAntigo.length && (
                      <div className="dashboard-empty">
                        {carregando ? <Skeleton tipo="tabela" linhas={3} /> : 'Ainda não há ordens para exibir.'}
                      </div>
                    )}
                  </div>
                </article>
                <article className="dashboard-panel alerts-panel">
                  <div className="panel-heading">
                    <div className="panel-title-icon amber">
                      <Icone name="bell" size={15} />
                    </div>
                    <div>
                      <h3>Alertas e pendências</h3>
                      <p>
                        {naoLido
                          ? `${naoLido} atualização${naoLido === 1 ? '' : 'ões'} não lida${naoLido === 1 ? '' : 's'}`
                          : 'Acompanhe os pontos de atenção'}
                      </p>
                    </div>
                    <button className="panel-link" onClick={() => navegar('/ordens-de-servico')}>
                      Ver OS <Icone name="right" size={12} />
                    </button>
                  </div>
                  <div className="alert-list">
                    {atrasados > 0 && (
                      <button className="alert-item" onClick={() => navegar('/ordens-de-servico')}>
                        <span className="alert-icon amber">
                          <Icone name="clock" size={14} />
                        </span>
                        <span>
                          <b>Previsão ultrapassada</b>
                          <small>
                            {atrasados} OS ativa{atrasados === 1 ? '' : 's'} com entrega vencida
                          </small>
                        </span>
                        <strong>{atrasados}</strong>
                      </button>
                    )}
                    {avisos.map((avisar, indice) => (
                      <button
                        className="alert-item"
                        key={`${avisar.orderId}-${avisar.createdAt}-${indice}`}
                        onClick={() => irOrdem(avisar.orderId)}
                      >
                        <span className="alert-icon rose">
                          <Icone name="info" size={14} />
                        </span>
                        <span>
                          <b>{avisar.title}</b>
                          <small>{avisar.body || dadosCurta(avisar.createdAt)}</small>
                        </span>
                        <Icone name="right" size={13} />
                      </button>
                    ))}
                    {avisosEstado === 'pending' && (
                      <Skeleton tipo="tabela" linhas={3} />
                    )}
                    {avisosEstado === 'error' && (
                      <p className="dashboard-empty">Não foi possível atualizar os avisos.</p>
                    )}
                    {avisosEstado === 'ok' && !atrasados && !avisos.length && (
                      <div className="clear-alerts">
                        <span className="clear-check">
                          <Icone name="check" size={14} />
                        </span>
                        <span>
                          <b>Tudo em dia</b>
                          <small>Nenhuma pendência importante no momento.</small>
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              </section>

              <section className="dashboard-panel team-panel">
                <div className="panel-heading">
                  <div className="panel-title-icon rose">
                    <Icone name="staff" size={17} />
                  </div>
                  <div>
                    <h3>Técnicos mais ativos</h3>
                    <p>
                      OS atribuídas com entrada no período · canceladas não contam
                      {equipePeriodo === 'personalizado' && equipeIntervalo
                        ? ` · ${equipeIntervalo.from.split('-').reverse().join('/')} a ${equipeIntervalo.to.split('-').reverse().join('/')}`
                        : ''}
                    </p>
                  </div>
                  <div className="dashboard-period">
                    <SeletorFiltro
                      label="Período dos técnicos"
                      value={equipePeriodo}
                      variant="toolbar"
                      options={[
                        { value: 'dia', label: 'Hoje' },
                        { value: 'semana', label: 'Últimos 7 dias' },
                        { value: 'mes', label: 'Este mês' },
                        { value: 'personalizado', label: 'Personalizado' },
                      ]}
                      onChange={(valor) => {
                        if (valor === 'personalizado') {
                          setEquipeSeletorRevisao((valorAtual) => valorAtual + 1);
                          setEquipeSeletor(true);
                        } else {
                          setEquipePeriodo(valor);
                          setEquipeSeletor(false);
                        }
                      }}
                    />
                    {seletorEquipe && (
                      <SeletorPeriodo
                        key={equipeSeletorRevisao}
                        autoOpen
                        value={equipeIntervalo}
                        onApply={(intervalo) => {
                          if (intervalo) {
                            setEquipeIntervalo(intervalo);
                            setEquipePeriodo('personalizado');
                          }
                          setEquipeSeletor(false);
                        }}
                      />
                    )}
                  </div>
                  <button className="panel-link" onClick={() => navegar('/funcionarios')}>
                    Ver equipe <Icone name="right" size={14} />
                  </button>
                </div>
                <div className="team-grid">
                  {equipeOrdenada.map((pessoa, indice) => (
                    <button
                      className="team-member"
                      key={pessoa.id}
                      onClick={() => navegar(`/funcionarios/${pessoa.id}`)}
                    >
                      <span className="team-avatar">{String(indice + 1).padStart(2, '0')}</span>
                      <b>{pessoa.nome}</b>
                      <small>{pessoa.cargo}</small>
                      <span className="team-stats">
                        <span>
                          <strong>{pessoa.worked}</strong>
                          <small>OS no período</small>
                        </span>
                        <span>
                          <strong>{pessoa.completed}</strong>
                          <small>Já finalizadas</small>
                        </span>
                      </span>
                    </button>
                  ))}
                  {!equipeOrdenada.length && (
                    <div className="dashboard-empty">
                      {carregando
                        ? <Skeleton tipo="tabela" linhas={3} />
                        : 'Nenhum técnico com OS atribuída neste período.'}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
          <footer className="dashboard-footer">
            <span>
              <i /> {carregado ? 'Dados carregados' : 'Aguardando dados'}
            </span>
            <span>{carregando ? 'Sincronizando…' : 'Operação da oficina'}</span>
            <button onClick={() => atualizar()} disabled={carregando}>
              <img src="/assets/services/reload-single.svg" width="14" height="14" alt="" />{' '}
              Atualizar
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
