import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ConteudoCarregando from '../components/ConteudoCarregando';
import SkeletonPagina from '../components/SkeletonPagina';
import { Icone } from '../components/MenuAdmin';
import SeletorPeriodo, { type DadosIntervalo } from '../components/SeletorPeriodo';
import { useDadosVivos } from '../hooks/useDadosVivos';
import {
  ErroRequisicaoApi,
  buscarHistoricoMotocicleta,
  type HistoricoMotocicleta,
  type SituacaoOrdem,
} from '../services/apiAutenticacao';
import { useMiniaturaMotocicleta } from '../services/miniaturasMotocicletas';
import { rotulosSituacaoOrdem } from '../services/statusOrdem';
import { correspondeBusca } from '../utils/buscaAproximada';
import './historico-motocicleta.css';
import './ordens-servico.css';

const moeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
const km = (valor: number | null | undefined) =>
  valor == null ? '—' : `${new Intl.NumberFormat('pt-BR').format(valor)} km`;
const quando = (valor: string | null, opcao: 'date' | 'time' = 'date') =>
  valor
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        ...(opcao === 'date'
          ? { day: '2-digit', month: '2-digit', year: 'numeric' }
          : { hour: '2-digit', minute: '2-digit' }),
      }).format(new Date(valor))
    : '—';
const totalPara = (ordem: HistoricoMotocicleta['orders'][number]) =>
  ordem.total ??
  ordem.services.reduce((numero, item) => numero + item.price, 0) +
    ordem.parts.reduce((numero, item) => numero + item.quantity * item.unitPrice, 0);
const iconesHistorico: Record<SituacaoOrdem, string> = {
  aguardando: 'clock',
  'aguardando peça': 'package',
  'em andamento': 'wrench',
  pronto: 'check',
  entregue: 'check',
  cancelada: 'close',
};

export default function PaginaHistoricoMotocicleta() {
  const { id } = useParams();
  const idOrdem = Number(id);
  const navegar = useNavigate();
  const [dados, setDados] = useState<HistoricoMotocicleta | null>(null);
  const [erro, setErro] = useState('');
  const [avisoTemporario, setAvisoTemporario] = useState('');
  const [consulta, setConsulta] = useState('');
  const [situacao, setSituacao] = useState<SituacaoOrdem | 'todos'>('todos');
  const [ano, setAno] = useState('todos');
  const [intervaloDatas, setDadosIntervalo] = useState<DadosIntervalo | null>(null);
  const [visivel, setVisivel] = useState(6);
  const [showTodosPecas, setShowTodosPecas] = useState(false);
  const [badImagem, setBadImagem] = useState('');
  const miniatura = useMiniaturaMotocicleta(
    idOrdem,
    dados?.motorcycle.model,
    dados?.motorcycle.color,
  );
  const imagemMoto = miniatura.url && miniatura.url !== badImagem ? miniatura.url : null;

  useEffect(() => {
    if (!Number.isSafeInteger(idOrdem) || idOrdem < 1) {
      setErro('Número da OS inválido.');
      return;
    }
    let montado = true;
    buscarHistoricoMotocicleta(idOrdem)
      .then((historico) => {
        if (montado) {
          setDados(historico);
          setErro('');
        }
      })
      .catch((erroCapturado) => {
        if (!montado) return;
        if (
          erroCapturado instanceof ErroRequisicaoApi &&
          (erroCapturado.situacao === 401 || erroCapturado.situacao === 403)
        )
          navegar('/login', { replace: true });
        else
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível carregar o histórico.',
          );
      });
    return () => {
      montado = false;
    };
  }, [idOrdem, navegar]);

  useDadosVivos(
    async (valido) => {
      try {
        const resultado = await buscarHistoricoMotocicleta(idOrdem);
        if (valido()) {
          setDados(resultado);
          setErro('');
        }
      } catch (erroCapturado) {
        if (valido())
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível atualizar o histórico.',
          );
      }
    },
    !!dados,
    String(idOrdem),
  );
  const anos = useMemo(
    () =>
      [...new Set((dados?.orders ?? []).map((ordem) => ordem.entry.slice(0, 4)))].sort().reverse(),
    [dados],
  );
  const filtrado = useMemo(
    () =>
      (dados?.orders ?? []).filter((ordem) => {
        const conteudo =
          `OS ${ordem.id} ${ordem.problem ?? ''} ${ordem.observations ?? ''} ${ordem.cancellationReason ?? ''} ${ordem.mechanic} ${ordem.services.map((item) => item.description).join(' ')} ${ordem.parts.map((item) => item.name).join(' ')}`;
        const dia = ordem.entry.slice(0, 10);
        return (
          correspondeBusca(consulta, conteudo) &&
          (situacao === 'todos' || ordem.status === situacao) &&
          (ano === 'todos' || dia.startsWith(ano)) &&
          (!intervaloDatas || (dia >= intervaloDatas.from && dia <= intervaloDatas.to))
        );
      }),
    [dados, consulta, situacao, ano, intervaloDatas],
  );
  const ultimoConcluido = dados?.orders.find((ordem) => ordem.status === 'entregue');
  const maintenanceDados = ultimoConcluido
    ? new Date(ultimoConcluido.exit || ultimoConcluido.entry)
    : null;
  if (maintenanceDados && !Number.isNaN(maintenanceDados.getTime()))
    maintenanceDados.setMonth(maintenanceDados.getMonth() + 6);
  const continuarKm = ultimoConcluido
    ? (ultimoConcluido.kmExit ?? ultimoConcluido.kmEntry ?? dados?.motorcycle.km ?? 0) + 5000
    : null;
  function restaurarFiltros() {
    setConsulta('');
    setSituacao('todos');
    setAno('todos');
    setDadosIntervalo(null);
    setVisivel(6);
  }

  return (
    <div className="orders-viewport history-viewport">
      <div className="orders-main">
        <main className="history-scroll">
          <ConteudoCarregando carregando={!dados && !erro}>
            {erro ? (
              <div className="details-error">
                <p>{erro}</p>
                <button onClick={() => navegar(`/ordens-de-servico/${idOrdem}`)}>
                  Voltar aos detalhes
                </button>
              </div>
            ) : !dados ? (
              <SkeletonPagina caminho={`/ordens-de-servico/${id}/historico`} />
            ) : (
              <div className="history-body">
                <h1>Histórico da Motocicleta</h1>
                <div className="history-breadcrumb">
                  <button onClick={() => navegar(`/ordens-de-servico/${idOrdem}`)}>
                    Voltar aos detalhes da OS
                  </button>
                  <Icone name="right" size={10} />
                  <span>Histórico</span>
                </div>
                <div className="history-columns">
                  <div className="history-left">
                    <section className="history-bike-card">
                      <div className="history-bike-art">
                        {imagemMoto ? (
                          <img
                            src={imagemMoto}
                            alt={`Miniatura de ${dados.motorcycle.model}`}
                            onError={() => setBadImagem(imagemMoto)}
                          />
                        ) : (
                          <Icone name="bike" size={65} />
                        )}
                        {miniatura.error && (
                          <small className="history-image-error" role="status">
                            {miniatura.error}
                          </small>
                        )}
                      </div>
                      <div className="history-bike-info">
                        <div className="history-bike-title">
                          <h2>{dados.motorcycle.model}</h2>
                          {dados.motorcycle.year && (
                            <span className="history-year">
                              ◎ {dados.motorcycle.year}/{dados.motorcycle.year + 1}
                            </span>
                          )}
                        </div>
                        <div className="history-bike-meta">
                          <div>
                            <Icone name="card" />
                            <span>
                              Placa<b>{dados.motorcycle.plate || '—'}</b>
                            </span>
                          </div>
                          <div>
                            <Icone name="users" />
                            <span>
                              Cliente<b>{dados.motorcycle.client}</b>
                            </span>
                          </div>
                          <div>
                            <Icone name="hash" />
                            <span>
                              Chassi<b>Não cadastrado</b>
                            </span>
                          </div>
                          <div>
                            <Icone name="calendar" />
                            <span>
                              Data de Cadastro<b>Não cadastrada</b>
                            </span>
                          </div>
                          <div>
                            <Icone name="clock" />
                            <span>
                              Cor<b>{dados.motorcycle.color || '—'}</b>
                            </span>
                          </div>
                          <div>
                            <Icone name="gauge" />
                            <span>
                              KM Atual<b>{km(dados.motorcycle.km)}</b>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="history-bike-stats">
                        <div>
                          <span>Total de OS</span>
                          <b>{dados.summary.total}</b>
                        </div>
                        <div>
                          <span>Última Entrada</span>
                          <b>{quando(dados.orders[0]?.entry || null)}</b>
                        </div>
                        <div>
                          <span>Média por OS</span>
                          <b>
                            {moeda(
                              dados.summary.total ? dados.summary.spent / dados.summary.total : 0,
                            )}
                          </b>
                        </div>
                      </div>
                    </section>
                    <section className="history-filters" aria-label="Filtros do histórico">
                      <label className="history-query">
                        <Icone name="search" size={14} />
                        <input
                          aria-label="Buscar no histórico"
                          placeholder="Buscar no histórico..."
                          value={consulta}
                          onChange={(eventoRecebido) => {
                            setConsulta(eventoRecebido.target.value);
                            setVisivel(6);
                          }}
                        />
                      </label>
                      <label>
                        Status
                        <select
                          value={situacao}
                          onChange={(eventoRecebido) => {
                            setSituacao(eventoRecebido.target.value as typeof situacao);
                            setVisivel(6);
                          }}
                        >
                          <option value="todos">Todos</option>
                          <option value="aguardando">Aberta</option>
                          <option value="em andamento">Em andamento</option>
                          <option value="aguardando peça">Aguardando peça</option>
                          <option value="pronto">Pronta</option>
                          <option value="entregue">Finalizada</option>
                          <option value="cancelada">Cancelada</option>
                        </select>
                      </label>
                      <label>
                        Ano
                        <select
                          value={ano}
                          onChange={(eventoRecebido) => {
                            setAno(eventoRecebido.target.value);
                            setVisivel(6);
                          }}
                        >
                          <option value="todos">Todos</option>
                          {anos.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <SeletorPeriodo
                        variant="fields"
                        value={intervaloDatas}
                        onApply={(valor) => {
                          setDadosIntervalo(valor);
                          setVisivel(6);
                        }}
                      />
                      <button className="history-clear" onClick={restaurarFiltros}>
                        <Icone name="filter" size={12} /> Limpar
                      </button>
                    </section>
                    <section className="history-timeline">
                      <h2>Histórico de Ordens de Serviço</h2>
                      <div className="timeline-items">
                        {filtrado.slice(0, visivel).map((ordem) => (
                          <div className="timeline-row" key={ordem.id}>
                            <div className="timeline-date">
                              <b>{quando(ordem.entry)}</b>
                              <small>{quando(ordem.entry, 'time')}</small>
                            </div>
                            <div
                              className={`timeline-icon timeline-${ordem.status.replace(' ', '-')}`}
                            >
                              <Icone name={iconesHistorico[ordem.status]} size={15} />
                            </div>
                            <article className="timeline-card">
                              <div className="timeline-card-top">
                                <b>OS #{ordem.id}</b>
                                <span
                                  className={`history-status hs-${ordem.status.replace(' ', '-')}`}
                                >
                                  {rotulosSituacaoOrdem[ordem.status]}
                                </span>
                                <span className="timeline-more">···</span>
                              </div>
                              <div className="timeline-details">
                                <div className="timeline-problem">
                                  <small>Problema relatado</small>
                                  <b>{ordem.problem || 'Não informado'}</b>
                                  <small>Serviços realizados</small>
                                  <b>
                                    {ordem.services.length
                                      ? ordem.services.map((item) => item.description).join(' · ')
                                      : 'Nenhum serviço registrado'}
                                  </b>
                                </div>
                                <div>
                                  <small>
                                    <Icone name="wrench" size={11} /> Mecânico
                                  </small>
                                  <b>{ordem.mechanic}</b>
                                </div>
                                <div>
                                  <small>
                                    <Icone name="gauge" size={11} /> KM na entrada
                                  </small>
                                  <b>{km(ordem.kmEntry)}</b>
                                </div>
                                <div>
                                  <small>
                                    <Icone name="hash" size={11} /> Status Pagamento
                                  </small>
                                  <span className={`history-payment ${ordem.paymentStatus}`}>
                                    {ordem.paymentStatus === 'pago' ? '✓ Pago' : 'Pendente'}
                                  </span>
                                </div>
                              </div>
                              {ordem.status === 'cancelada' && (
                                <div className="history-cancellation-reason">
                                  <Icone name="info" size={13} />
                                  <span>
                                    <b>Motivo do cancelamento</b>
                                    {ordem.cancellationReason ||
                                      'Motivo não registrado nesta OS antiga.'}
                                  </span>
                                </div>
                              )}
                              <div className="timeline-card-footer">
                                <span>{moeda(totalPara(ordem))}</span>
                                <button onClick={() => navegar(`/ordens-de-servico/${ordem.id}`)}>
                                  Ver detalhes <Icone name="right" size={12} />
                                </button>
                              </div>
                            </article>
                          </div>
                        ))}
                        {!filtrado.length && (
                          <div className="history-no-results">
                            Nenhuma OS encontrada com esses filtros.
                          </div>
                        )}
                      </div>
                      {filtrado.length > visivel && (
                        <button
                          className="history-more"
                          onClick={() => setVisivel((numero) => numero + 6)}
                        >
                          Carregar mais histórico <Icone name="chevron" size={12} />
                        </button>
                      )}
                    </section>
                  </div>
                  <aside className="history-right">
                    <section className="history-side-card">
                      <h2>Resumo Geral</h2>
                      <div className="history-summary-list">
                        <div>
                          Total de OS <b>{dados.summary.total}</b>
                        </div>
                        <div>
                          OS Concluídas <b className="green">{dados.summary.completed}</b>
                        </div>
                        <div>
                          OS em Andamento <b className="orange">{dados.summary.inProgress}</b>
                        </div>
                        <div>
                          OS Canceladas <b className="red">{dados.summary.cancelled}</b>
                        </div>
                        <hr />
                        <div>
                          Total de Serviços <b>{dados.summary.services}</b>
                        </div>
                        <div>
                          Total de Peças Utilizadas <b>{dados.summary.parts}</b>
                        </div>
                        <div>
                          Total Gasto <b>{moeda(dados.summary.spent)}</b>
                        </div>
                      </div>
                    </section>
                    <section className="history-side-card history-parts">
                      <div className="history-side-heading">
                        <h2>Peças Mais Utilizadas</h2>
                        {dados.mostUsedParts.length > 5 && (
                          <button onClick={() => setShowTodosPecas(!showTodosPecas)}>
                            {showTodosPecas ? 'Ver menos' : 'Ver todas'}
                          </button>
                        )}
                      </div>
                      <table>
                        <thead>
                          <tr>
                            <th>Peça</th>
                            <th>Quantidade</th>
                            <th>Total Gasto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(showTodosPecas
                            ? dados.mostUsedParts
                            : dados.mostUsedParts.slice(0, 5)
                          ).map((parte) => (
                            <tr key={parte.name}>
                              <td>{parte.name}</td>
                              <td>{parte.quantity}</td>
                              <td>{moeda(parte.total)}</td>
                            </tr>
                          ))}
                          {!dados.mostUsedParts.length && (
                            <tr>
                              <td colSpan={3}>Nenhuma peça registrada.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </section>
                    <section className="history-side-card history-maintenance">
                      <span className="maintenance-icon">
                        <Icone name="calendar" size={21} />
                      </span>
                      <div>
                        <h2>Próxima Manutenção sugerida</h2>
                        <p>Estimativa: 6 meses ou 5.000 km após a última OS concluída.</p>
                        {ultimoConcluido && maintenanceDados ? (
                          <>
                            <div className="maintenance-target">
                              <b>{quando(maintenanceDados.toISOString())}</b>
                              <span>+ 5.000 km</span>
                            </div>
                            <div className="maintenance-km">
                              <span>
                                KM na última OS
                                <strong>
                                  {km(ultimoConcluido.kmExit ?? ultimoConcluido.kmEntry)}
                                </strong>
                              </span>
                              <span>
                                Próximo serviço<strong>{km(continuarKm)}</strong>
                              </span>
                            </div>
                          </>
                        ) : (
                          <p>Conclua uma OS para calcular a estimativa.</p>
                        )}
                      </div>
                    </section>
                  </aside>
                </div>
              </div>
            )}
          </ConteudoCarregando>
        </main>
      </div>
      {avisoTemporario && (
        <div className="orders-toast" role="status" onClick={() => setAvisoTemporario('')}>
          {avisoTemporario}
        </div>
      )}
    </div>
  );
}
