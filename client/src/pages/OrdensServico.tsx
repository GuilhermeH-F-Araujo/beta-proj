import CartaoIndicador from '../components/CartaoIndicador';
import { useCargaInicial } from '../hooks/useCargaInicial';
import { usePesquisaPagina, useParametroPagina } from '../hooks/usePesquisaPagina';
import { useCartoesPagina, useCartaoVisivel } from '../hooks/useCartoesPagina';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConteudoCarregando from '../components/ConteudoCarregando';
import SkeletonLinhasTabela from '../components/SkeletonLinhasTabela';
import MenuAcoesOrdem from '../components/MenuAcoesOrdem';
import { Icone } from '../components/MenuAdmin';
import ModalAcoesOrdem from '../components/ModalAcoesOrdem';
import ModalPagamento from '../components/ModalPagamento';
import { useUsuarioAdministrador } from '../components/RotaProtegida';
import SeletorFiltro from '../components/SeletorFiltro';
import SeletorPeriodo, { type DadosIntervalo } from '../components/SeletorPeriodo';
import { useDadosVivos } from '../hooks/useDadosVivos';
import {
  buscarOrdens,
  ErroRequisicaoApi,
  exportarOrdens,
  type FiltrosOrdens,
  type ItemOrdem,
  type RespostaOrdens,
} from '../services/apiAutenticacao';
import {
  cartoesSituacaoOrdem as cards,
  rotulosSituacaoOrdem as rotulos,
} from '../services/statusOrdem';
import './ordens-servico.css';

type Colunas = {
  phone: boolean;
  plate: boolean;
  forecast: boolean;
  mechanic: boolean;
  total: boolean;
};
const padraoColunas: Colunas = {
  phone: true,
  plate: true,
  forecast: true,
  mechanic: true,
  total: false,
};
const vazioDados: RespostaOrdens = {
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

function partesDados(valor: string | null) {
  if (!valor) return { date: '—', time: '' };
  const [dia, relogio] = valor.replace('T', ' ').split(' ');
  const [ano, mes, dadosLocal] = dia.split('-');
  return { date: `${dadosLocal}/${mes}/${ano}`, time: relogio ? relogio.slice(0, 5) : '' };
}
function paginasExibidas(atual: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, indice) => indice + 1);
  const paginas = new Set([1, total, atual - 1, atual, atual + 1]);
  if (atual <= 3) [2, 3, 4, 5].forEach((numero) => paginas.add(numero));
  if (atual >= total - 2)
    [total - 4, total - 3, total - 2, total - 1].forEach((numero) => paginas.add(numero));
  const ordenado = [...paginas]
    .filter((numero) => numero >= 1 && numero <= total)
    .sort((primeiroElemento, segundoElemento) => primeiroElemento - segundoElemento);
  return ordenado.flatMap((numero, indice) =>
    indice && numero - ordenado[indice - 1] > 1 ? ['…' as const, numero] : [numero],
  );
}

const situacaoOpcoes: { value: FiltrosOrdens['status']; label: string; tone: string }[] = [
  { value: 'todos', label: 'Todos os status', tone: 'neutral' },
  ...cards.map((cartao) => ({ value: cartao.status, label: cartao.title, tone: cartao.shade })),
  { value: 'pronto', label: 'Prontas', tone: 'green' },
];

export default function OrdensServico() {
  const exibirCartao = useCartaoVisivel('ordens');
  const cartoesVisiveis = useCartoesPagina('ordens', cards, (item) => item.status);
  const navegar = useNavigate();
  const usuario = useUsuarioAdministrador();
  const acesso = !!usuario;
  const [busca, setBusca] = useState(
    () => new URLSearchParams(window.location.search).get('search') || '',
  );
  usePesquisaPagina(setBusca);
  const [debouncedBusca, setDebouncedBusca] = useState(
    () => new URLSearchParams(window.location.search).get('search') || '',
  );
  const [clienteFiltro, setClienteFiltro] = useState(() => {
    const id = Number(new URLSearchParams(window.location.search).get('clientId'));
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  const clienteFiltroNome = new URLSearchParams(window.location.search).get('clientName');
  const [situacao, setSituacao] = useState<FiltrosOrdens['status']>(() => {
    const solicitado = new URLSearchParams(window.location.search).get('status');
    return situacaoOpcoes.find((opcao) => opcao.value === solicitado)?.value ?? 'todos';
  });
  const [intervaloDatas, setDadosIntervalo] = useState<DadosIntervalo | null>(null);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<RespostaOrdens>(vazioDados);
  useParametroPagina('status', (valor) => {
    if (
      [
        'todos',
        'aguardando',
        'em andamento',
        'aguardando peça',
        'pronto',
        'entregue',
        'cancelada',
      ].includes(valor)
    )
      setSituacao(valor as FiltrosOrdens['status']);
  });
  const [carregandoLocal, setCarregando] = useState(true);
  const primeiraCarga = useCargaInicial(carregandoLocal);
  const [erro, setErro] = useState('');
  const [personalizar, setPersonalizar] = useState(false);
  const [colunas, setColunas] = useState<Colunas>(() => {
    try {
      return { ...padraoColunas, ...JSON.parse(localStorage.getItem('orders-columns') || '{}') };
    } catch {
      return padraoColunas;
    }
  });
  const [avisoTemporario, setAvisoTemporario] = useState('');
  const [abertoAcao, setAbertoAcao] = useState<number | null>(null);
  const [acaoModal, setAcaoModal] = useState<{
    id: number;
    tab: 'status' | 'edit' | 'delete';
  } | null>(null);
  const [acaoAncora, setAcaoAncora] = useState<{ x: number; bottom: number } | null>(null);
  const [pagamentoOrdem, setPagamentoOrdem] = useState<number | null>(null);
  const filtros: FiltrosOrdens = useMemo(
    () => ({
      page: pagina,
      search: debouncedBusca,
      status: situacao,
      period: 'todos',
      dateFrom: intervaloDatas?.from,
      dateTo: intervaloDatas?.to,
      clientId: clienteFiltro ?? undefined,
    }),
    [pagina, debouncedBusca, situacao, intervaloDatas, clienteFiltro],
  );

  useEffect(() => {
    const id = setTimeout(() => setDebouncedBusca(busca.trim()), 250);
    return () => clearTimeout(id);
  }, [busca]);
  useEffect(() => {
    setPagina(1);
    setAbertoAcao(null);
  }, [debouncedBusca, situacao, intervaloDatas]);
  useEffect(() => {
    if (!acesso) return;
    let ativo = true;
    setCarregando(true);
    setErro('');
    buscarOrdens(filtros)
      .then((resultado) => {
        if (ativo) setDados(resultado);
      })
      .catch((erroCapturado) => {
        if (!ativo) return;
        if (
          erroCapturado instanceof ErroRequisicaoApi &&
          (erroCapturado.situacao === 401 || erroCapturado.situacao === 403)
        ) {
          navegar('/login', { replace: true });
        } else {
          setDados(vazioDados);
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível carregar as OS.',
          );
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [acesso, filtros, navegar]);
  useEffect(() => {
    localStorage.setItem('orders-columns', JSON.stringify(colunas));
  }, [colunas]);
  useEffect(() => {
    if (!avisoTemporario) return;
    const id = setTimeout(() => setAvisoTemporario(''), 3500);
    return () => clearTimeout(id);
  }, [avisoTemporario]);
  useEffect(() => {
    if (!personalizar) return;
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setPersonalizar(false);
    };
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [personalizar]);

  async function tratarExportacao() {
    try {
      await exportarOrdens(filtros);
    } catch (erroCapturado) {
      setAvisoTemporario(
        erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível exportar.',
      );
    }
  }
  function atualizarOrdens(excluido = false) {
    const continuarPagina = excluido && pagina > 1 && dados.items.length <= 1 ? pagina - 1 : pagina;
    if (continuarPagina !== pagina) setPagina(continuarPagina);
    else
      void buscarOrdens(filtros)
        .then(setDados)
        .catch((erroCapturado) =>
          setAvisoTemporario(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível atualizar as OS.',
          ),
        );
  }
  const paginas = Math.max(1, Math.ceil(dados.total / 15));
  const primeiro = dados.total ? (pagina - 1) * 15 + 1 : 0;
  const ultimo = Math.min(pagina * 15, dados.total);
  const visivelColunaQuantidade =
    6 + Number(colunas.forecast) + Number(colunas.mechanic) + Number(colunas.total);

  useDadosVivos(
    async (valido) => {
      try {
        const resultado = await buscarOrdens(filtros);
        if (valido()) {
          setDados(resultado);
          setErro('');
        }
      } catch (erroCapturado) {
        if (valido())
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível atualizar as ordens.',
          );
      }
    },
    acesso && !carregandoLocal,
    JSON.stringify(filtros),
  );
  return (
    <div className="orders-viewport">
      <div className="orders-main">
        <main className="orders-content">
          <ConteudoCarregando carregando={carregandoLocal && !erro}>
            {clienteFiltro && (
              <div className="orders-client-filter">
                Exibindo ordens de{' '}
                <strong>{clienteFiltroNome || `cliente #${clienteFiltro}`}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setClienteFiltro(null);
                    navegar('/ordens-de-servico', { replace: true });
                  }}
                >
                  Remover filtro <Icone name="close" size={12} />
                </button>
              </div>
            )}
            <div className="orders-toolbar">
              <label className="orders-search">
                <Icone name="search" size={16} />
                <input
                  aria-label="Buscar ordens"
                  placeholder="Buscar por cliente, OS ou placa..."
                  value={busca}
                  onChange={(eventoRecebido) => setBusca(eventoRecebido.target.value)}
                />
              </label>
              <div className="toolbar-right">
                <SeletorFiltro
                  variant="toolbar"
                  label="Status da ordem de serviço"
                  value={situacao}
                  options={situacaoOpcoes}
                  onChange={setSituacao}
                />
                <SeletorPeriodo value={intervaloDatas} onApply={setDadosIntervalo} />
              </div>
            </div>
            <div
              className="status-cards indicadores-grid"
              data-indicadores
              data-colunas="5"
              data-workspace-custom-cards={cartoesVisiveis.length !== cards.length}
            >
              {cartoesVisiveis.map((cartao) => (
                <CartaoIndicador
                  key={cartao.status}
                  editorId={`ordens:${cartao.status}`}
                  oculto={!exibirCartao(cartao.status)}
                  titulo={cartao.title}
                  descricao={cartao.subtitle}
                  valor={dados.counts[cartao.status]}
                  icone={cartao.icon}
                  tom={cartao.shade}
                  ativo={situacao === cartao.status}
                  aoClicar={() => setSituacao(situacao === cartao.status ? 'todos' : cartao.status)}
                />
              ))}
            </div>
            <section className="order-list" aria-label="Lista de Ordens">
              <div className="list-title">
                <h2>Lista de Ordens</h2>
                <div>
                  <button className="white-btn" onClick={tratarExportacao}>
                    <Icone name="download" size={15} /> Exportar
                  </button>
                  <button className="white-btn" onClick={() => setPersonalizar(true)}>
                    <Icone name="sliders" size={15} /> Personalizar
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>N° OS</th>
                      <th>CLIENTE</th>
                      <th>MOTOCICLETA</th>
                      <th>STATUS</th>
                      <th>ENTRADA</th>
                      {colunas.forecast && <th>PREVISÃO</th>}
                      {colunas.mechanic && <th>RESPONSÁVEL</th>}
                      {colunas.total && <th>TOTAL</th>}
                      <th className="actions-heading">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.items.map((linha: ItemOrdem) => {
                      const registro = partesDados(linha.entry);
                      const previsao = partesDados(linha.forecast);
                      return (
                        <tr key={linha.id}>
                          <td className="order-number">OS #{linha.id}</td>
                          <td>
                            <b>{linha.client}</b>
                            {colunas.phone && <small>{linha.phone || '—'}</small>}
                          </td>
                          <td>
                            <b>{linha.motorcycle}</b>
                            {colunas.plate && <small>{linha.plate || '—'}</small>}
                          </td>
                          <td>
                            <span
                              className={`order-badge badge-${linha.status.replaceAll(' ', '-')}`}
                            >
                              {rotulos[linha.status]}
                            </span>
                          </td>
                          <td>
                            {registro.date}
                            <small>{registro.time}</small>
                          </td>
                          {colunas.forecast && (
                            <td>
                              {previsao.date}
                              <small>{previsao.time}</small>
                            </td>
                          )}
                          {colunas.mechanic && (
                            <td>
                              <span className="mechanic">
                                <span className="mechanic-avatar">{linha.mechanic.charAt(0)}</span>
                                {linha.mechanic}
                              </span>
                            </td>
                          )}
                          {colunas.total && (
                            <td>
                              {linha.total == null
                                ? '—'
                                : new Intl.NumberFormat('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  }).format(linha.total)}
                            </td>
                          )}
                          <td className="order-actions">
                            <div className="action-controls">
                              <button
                                className="action-view"
                                type="button"
                                onClick={() => navegar(`/ordens-de-servico/${linha.id}`)}
                              >
                                Ver
                              </button>
                              <div className="action-menu-wrap">
                                <button
                                  className="action-more"
                                  type="button"
                                  aria-label={`Mais ações da OS #${linha.id}`}
                                  aria-expanded={abertoAcao === linha.id}
                                  onClick={(evento) => {
                                    const retangulo = evento.currentTarget.getBoundingClientRect();
                                    setAcaoAncora({
                                      x: retangulo.left + retangulo.width / 2,
                                      bottom: retangulo.bottom,
                                    });
                                    setAbertoAcao(abertoAcao === linha.id ? null : linha.id);
                                  }}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                    fill="currentColor"
                                    aria-hidden="true"
                                  >
                                    <circle cx="7" cy="3" r="1" />
                                    <circle cx="7" cy="7" r="1" />
                                    <circle cx="7" cy="11" r="1" />
                                  </svg>
                                </button>
                              </div>
                              {linha.paymentStatus === 'pago' ? (
                                <span className="payment-paid">
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.4"
                                    aria-hidden="true"
                                  >
                                    <circle cx="8" cy="8" r="5.5" />
                                    <path d="m5.3 8 1.8 1.8 3.7-3.7" />
                                  </svg>
                                  Pago
                                </span>
                              ) : (
                                <button
                                  className="payment-button"
                                  type="button"
                                  onClick={() => {
                                    setPagamentoOrdem(linha.id);
                                    setAbertoAcao(null);
                                  }}
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.4"
                                    aria-hidden="true"
                                  >
                                    <rect x="2.1" y="3.4" width="11.8" height="9.2" rx="1.8" />
                                    <path d="M2.4 6.7h11.2M4.5 10h3" />
                                  </svg>
                                  Pagamento
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!primeiraCarga && (erro || !dados.items.length) && (
                      <tr>
                        <td colSpan={visivelColunaQuantidade} className="empty-state">
                          {erro || 'Nenhuma ordem encontrada para esses filtros.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {primeiraCarga && <SkeletonLinhasTabela colunas={visivelColunaQuantidade} />}
              </div>
              <div className="list-footer">
                <span>
                  Mostrando {primeiro} a {ultimo} de {dados.total} ordens
                </span>
                <nav className="pagination" aria-label="Páginas de ordens">
                  <button
                    aria-label="Página anterior"
                    disabled={pagina <= 1 || carregandoLocal}
                    onClick={() => setPagina(pagina - 1)}
                  >
                    <Icone name="left" size={14} />
                  </button>
                  {paginasExibidas(pagina, paginas).map((item, indiceLocal) =>
                    item === '…' ? (
                      <span key={`gap-${indiceLocal}`}>…</span>
                    ) : (
                      <button
                        key={item}
                        className={pagina === item ? 'active' : ''}
                        aria-current={pagina === item ? 'page' : undefined}
                        onClick={() => setPagina(item)}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    aria-label="Próxima página"
                    disabled={pagina >= paginas || carregandoLocal}
                    onClick={() => setPagina(pagina + 1)}
                  >
                    <Icone name="right" size={14} />
                  </button>
                </nav>
              </div>
            </section>
          </ConteudoCarregando>
        </main>
      </div>
      {abertoAcao !== null && acaoAncora && (
        <MenuAcoesOrdem
          anchor={acaoAncora}
          onClose={() => setAbertoAcao(null)}
          onSelect={(acao) => {
            setAcaoModal({ id: abertoAcao, tab: acao });
            setAbertoAcao(null);
          }}
        />
      )}
      {acaoModal && (
        <ModalAcoesOrdem
          key={`${acaoModal.id}-${acaoModal.tab}`}
          orderId={acaoModal.id}
          initialTab={acaoModal.tab}
          onClose={() => setAcaoModal(null)}
          onChanged={() => atualizarOrdens()}
          onDeleted={() => atualizarOrdens(true)}
        />
      )}
      {avisoTemporario && (
        <div className="orders-toast" role="status">
          {avisoTemporario}
        </div>
      )}
      {pagamentoOrdem !== null && (
        <ModalPagamento
          orderId={pagamentoOrdem}
          onClose={() => setPagamentoOrdem(null)}
          onPaid={(id) => {
            setDados((anterior) => ({
              ...anterior,
              items: anterior.items.map((item) =>
                item.id === id ? { ...item, paymentStatus: 'pago' } : item,
              ),
            }));
          }}
        />
      )}
      {personalizar && (
        <div
          className="modal-backdrop"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) setPersonalizar(false);
          }}
        >
          <section
            className="orders-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="columns-title"
          >
            <div className="modal-heading">
              <div>
                <span className="modal-eyebrow">EXIBIÇÃO DA TABELA</span>
                <h2 id="columns-title">Personalizar colunas</h2>
                <p>Escolha os dados que deseja ver na lista de ordens.</p>
              </div>
              <button
                className="modal-close plain"
                aria-label="Fechar"
                onClick={() => setPersonalizar(false)}
              >
                <Icone name="close" size={18} />
              </button>
            </div>
            <div className="column-list">
              {(
                [
                  ['phone', 'Telefone do cliente'],
                  ['plate', 'Placa da moto'],
                  ['forecast', 'Previsão de entrega'],
                  ['mechanic', 'Responsável'],
                  ['total', 'Valor total'],
                ] as const
              ).map(([chave, rotulo]) => (
                <label className="column-option" key={chave}>
                  <span>{rotulo}</span>
                  <input
                    type="checkbox"
                    checked={colunas[chave]}
                    onChange={(evento) =>
                      setColunas((anterior) => ({
                        ...anterior,
                        [chave]: evento.target.checked,
                      }))
                    }
                  />
                  <span className="toggle" aria-hidden="true" />
                </label>
              ))}
            </div>
            <div className="modal-footer">
              <button className="white-btn" onClick={() => setColunas(padraoColunas)}>
                Restaurar padrão
              </button>
              <button className="red-btn" onClick={() => setPersonalizar(false)}>
                Concluir
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
