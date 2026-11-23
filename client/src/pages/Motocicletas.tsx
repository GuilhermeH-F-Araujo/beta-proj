import CartaoIndicador from '../components/CartaoIndicador';
import { useCargaInicial } from '../hooks/useCargaInicial';
import { usePesquisaPagina } from '../hooks/usePesquisaPagina';
import { useCartoesPagina, useCartaoVisivel } from '../hooks/useCartoesPagina';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConteudoCarregando from '../components/ConteudoCarregando';
import SkeletonLinhasTabela from '../components/SkeletonLinhasTabela';
import { Icone } from '../components/MenuAdmin';
import ModalEditarMotocicleta from '../components/ModalEditarMotocicleta';
import ModalPreviaModelo from '../components/ModalPreviaModelo';
import ModalVerMotocicleta from '../components/ModalVerMotocicleta';
import { useUsuarioAdministrador } from '../components/RotaProtegida';
import SeletorFiltro from '../components/SeletorFiltro';
import { useDadosVivos } from '../hooks/useDadosVivos';
import {
  buscarMotocicletas,
  type ItemMotocicleta,
  type RespostaMotocicletas,
  type SituacaoMotocicleta,
} from '../services/apiAutenticacao';
import { useMiniaturaModeloMotocicleta } from '../services/miniaturasMotocicletas';
import { correspondeBusca } from '../utils/buscaAproximada';
import './motocicletas.css';
import './ordens-servico.css';

const vazio: RespostaMotocicletas = {
  items: [],
  counts: {
    all: 0,
    active: 0,
    maintenance: 0,
    completed: 0,
    pickup: 0,
    inactive: 0,
    delivered: 0,
    cancelled: 0,
    'no-orders': 0,
  },
  clients: [],
};
const situacoes: {
  key: SituacaoMotocicleta | 'all';
  label: string;
  icon: string;
  shade: string;
}[] = [
  { key: 'all', label: 'Total de motocicletas', icon: 'bike', shade: 'blue' },
  { key: 'active', label: 'Ativas', icon: 'check', shade: 'mint' },
  { key: 'pickup', label: 'Aguardando retirada', icon: 'clock', shade: 'green' },
  { key: 'maintenance', label: 'Em manutenção', icon: 'wrench', shade: 'amber' },
  { key: 'inactive', label: 'Inativas', icon: 'pause', shade: 'gray' },
];
const situacaoTexto: Record<SituacaoMotocicleta, string> = {
  active: 'Ativa',
  maintenance: 'Em manutenção',
  completed: 'Concluída',
  pickup: 'Aguardando retirada',
  inactive: 'Inativa',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
  'no-orders': 'Sem OS',
};
const situacaoIcone: Record<SituacaoMotocicleta, string> = {
  active: 'check',
  maintenance: 'wrench',
  completed: 'clipboard-check',
  pickup: 'clock',
  inactive: 'clock',
  delivered: 'exit-arrow',
  cancelled: 'close',
  'no-orders': 'info',
};
function SituacaoBadge({ value: valor }: { value: SituacaoMotocicleta }) {
  return (
    <span className={`bikes-status ${valor}`}>
      <Icone name={situacaoIcone[valor]} size={12} />
      {situacaoTexto[valor]}
    </span>
  );
}
const filtroSituacoes: { key: SituacaoMotocicleta; label: string }[] = [
  { key: 'active', label: 'Ativas' },
  { key: 'maintenance', label: 'Em manutenção' },
  { key: 'completed', label: 'Concluídas' },
  { key: 'pickup', label: 'Aguardando retirada' },
  { key: 'delivered', label: 'Entregues' },
  { key: 'cancelled', label: 'Canceladas' },
  { key: 'inactive', label: 'Inativas' },
  { key: 'no-orders', label: 'Sem OS' },
];
const motocicletaSituacaoOpcoes: { value: SituacaoMotocicleta | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  ...filtroSituacoes.map((opcao) => ({ value: opcao.key, label: opcao.label })),
];
function MotoMiniatura({ item, revision: revisao }: { item: ItemMotocicleta; revision: number }) {
  const miniatura = useMiniaturaModeloMotocicleta(item.model, item.color, revisao, item.id);
  return (
    <span className="bikes-thumb">
      {miniatura ? (
        <img src={miniatura} alt={`Miniatura de ${item.model}`} />
      ) : (
        <Icone name="bike" size={25} />
      )}
    </span>
  );
}
function dadosBrasileira(valor: string) {
  const dia = valor.slice(0, 10).split('-');
  return dia.length === 3 ? `${dia[2]}/${dia[1]}/${dia[0]}` : '—';
}
function paginasExibidas(pagina: number, ultimo: number): (number | '…')[] {
  if (ultimo <= 6) return Array.from({ length: ultimo }, (_, indice) => indice + 1);
  const lista = [...new Set([1, ultimo, pagina - 1, pagina, pagina + 1])]
    .filter((numero) => numero >= 1 && numero <= ultimo)
    .sort((primeiroElemento, segundoElemento) => primeiroElemento - segundoElemento);
  return lista.flatMap((numero, indice) =>
    indice && numero - lista[indice - 1] > 1 ? ['…' as const, numero] : [numero],
  );
}
export default function Motocicletas() {
  const exibirCartao = useCartaoVisivel('motocicletas');
  const cartoesVisiveis = useCartoesPagina('motocicletas', situacoes, (item) => item.key);
  const navegar = useNavigate();
  const usuario = useUsuarioAdministrador();
  const autorizado = !!usuario;
  const [dados, setDados] = useState<RespostaMotocicletas>(vazio);
  const [carregandoLocal, setCarregando] = useState(true);
  const primeiraCarga = useCargaInicial(carregandoLocal);
  const [erro, setErro] = useState('');
  const [avisoTemporario, setAvisoTemporario] = useState('');
  const [busca, setBusca] = useState('');
  usePesquisaPagina(setBusca);
  const [situacao, setSituacao] = useState<SituacaoMotocicleta | 'all'>('all');
  const [marca, setMarca] = useState('all');
  const [ano, setAno] = useState('all');
  const [filtrosAberto, setFiltrosAberto] = useState(false);
  const filtrosReferencia = useRef<HTMLDivElement>(null);
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setPaginaTamanho] = useState(10);
  const [paginaTamanhoAberto, setPaginaTamanhoAberto] = useState(false);
  const paginaTamanhoReferencia = useRef<HTMLDivElement>(null);
  const [editando, setEditando] = useState<ItemMotocicleta | null | undefined>(undefined);
  const [imagemEditar, setImagemEditar] = useState<ItemMotocicleta | null>(null);
  const [visualizando, setVisualizando] = useState<ItemMotocicleta | null>(null);
  const [excluindo, setExcluindo] = useState<ItemMotocicleta | null>(null);
  const [revisaoImagem, setImagemRevisao] = useState(0);

  async function recarregar() {
    setCarregando(true);
    setErro('');
    try {
      setDados(await buscarMotocicletas());
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Falha ao carregar motocicletas.');
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    if (autorizado) void recarregar();
  }, [autorizado]);
  useEffect(() => {
    setPagina(1);
  }, [busca, situacao, marca, ano, tamanhoPagina]);
  useEffect(() => {
    if (!avisoTemporario) return;
    const temporizador = window.setTimeout(() => setAvisoTemporario(''), 4500);
    return () => window.clearTimeout(temporizador);
  }, [avisoTemporario]);
  useEffect(() => {
    if (!paginaTamanhoAberto) return;
    const fechar = (evento: PointerEvent) => {
      if (!paginaTamanhoReferencia.current?.contains(evento.target as Node))
        setPaginaTamanhoAberto(false);
    };
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setPaginaTamanhoAberto(false);
    };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', escapar);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', escapar);
    };
  }, [paginaTamanhoAberto]);
  useEffect(() => {
    if (!filtrosAberto) return;
    const fechar = (evento: PointerEvent) => {
      if (!filtrosReferencia.current?.contains(evento.target as Node)) setFiltrosAberto(false);
    };
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setFiltrosAberto(false);
    };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', escapar);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', escapar);
    };
  }, [filtrosAberto]);
  useEffect(() => {
    if (!excluindo) return;
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setExcluindo(null);
    };
    document.addEventListener('keydown', escapar);
    return () => document.removeEventListener('keydown', escapar);
  }, [excluindo]);
  useDadosVivos(async (valido) => {
    try {
      const resultado = await buscarMotocicletas();
      if (valido()) {
        setDados(resultado);
        setErro('');
      }
    } catch (erroCapturado) {
      if (valido())
        setErro(
          erroCapturado instanceof Error
            ? erroCapturado.message
            : 'Não foi possível atualizar as motos.',
        );
    }
  }, autorizado && !carregandoLocal);
  const marcas = useMemo(
    () => [...new Set(dados.items.map((item) => item.model.split(' ')[0]))].sort(),
    [dados.items],
  );
  const anos = useMemo(
    () =>
      [
        ...new Set(
          dados.items.map((item) => item.year).filter((valor): valor is number => valor !== null),
        ),
      ].sort((primeiroElemento, segundoElemento) => segundoElemento - primeiroElemento),
    [dados.items],
  );
  const filtrado = useMemo(
    () =>
      dados.items.filter((item) => {
        const palavras = `${item.model} ${item.plate} ${item.client} ${item.phone ?? ''}`;
        return (
          correspondeBusca(busca, palavras) &&
          (situacao === 'all' || item.status === situacao) &&
          (marca === 'all' || item.model.startsWith(`${marca} `)) &&
          (ano === 'all' || item.year === Number(ano))
        );
      }),
    [dados.items, busca, situacao, marca, ano],
  );
  const ultimoPagina = Math.max(1, Math.ceil(filtrado.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, ultimoPagina);
  const visivel = filtrado.slice((paginaAtual - 1) * tamanhoPagina, paginaAtual * tamanhoPagina);
  return (
    <div className="orders-viewport bikes-viewport">
      <div className="orders-main">
        <main className="bikes-content">
          <ConteudoCarregando carregando={carregandoLocal && !erro}>
            <div className="bikes-heading">
              <div>
                <h1>Motocicletas</h1>
                <p>Cadastre e gerencie as motocicletas dos seus clientes.</p>
              </div>
              <button type="button" className="bikes-new" onClick={() => setEditando(null)}>
                <Icone name="plus" size={15} /> Nova motocicleta
              </button>
            </div>
            <div
              className="bikes-stats indicadores-grid"
              data-indicadores
              data-colunas="5"
              data-workspace-custom-cards={cartoesVisiveis.length !== situacoes.length}
            >
              {cartoesVisiveis.map((cartao) => (
                <CartaoIndicador
                  key={cartao.key}
                  editorId={`motocicletas:${cartao.key}`}
                  oculto={!exibirCartao(cartao.key)}
                  titulo={cartao.label}
                  valor={dados.counts[cartao.key]}
                  icone={cartao.icon}
                  tom={cartao.shade}
                  descricao={
                    cartao.key === 'all'
                      ? 'Todas as cadastradas'
                      : `${dados.counts.all ? Math.round((dados.counts[cartao.key] / dados.counts.all) * 100) : 0}% do total`
                  }
                  total={dados.counts.all}
                  ativo={situacao === cartao.key}
                  aoClicar={() => setSituacao(cartao.key)}
                />
              ))}
            </div>
            <section className="bikes-panel" aria-label="Lista de motocicletas">
              <div className="bikes-filters">
                <label className="bikes-search">
                  <Icone name="search" size={15} />
                  <input
                    aria-label="Buscar motocicletas"
                    placeholder="Buscar por placa, modelo ou cliente..."
                    value={busca}
                    onChange={(evento) => setBusca(evento.target.value)}
                  />
                </label>
                <SeletorFiltro
                  label="Status da motocicleta"
                  value={situacao}
                  options={motocicletaSituacaoOpcoes}
                  onChange={setSituacao}
                />
                <SeletorFiltro
                  label="Marca"
                  value={marca}
                  options={[
                    { value: 'all', label: 'Todas' },
                    ...marcas.map((valor) => ({ value: valor, label: valor })),
                  ]}
                  onChange={setMarca}
                />
                <SeletorFiltro
                  label="Ano"
                  value={ano}
                  options={[
                    { value: 'all', label: 'Todos' },
                    ...anos.map((valor) => ({ value: String(valor), label: String(valor) })),
                  ]}
                  onChange={setAno}
                />
                <div className="bikes-filter-action" ref={filtrosReferencia}>
                  <button
                    type="button"
                    className="bikes-filter-button"
                    aria-expanded={filtrosAberto}
                    aria-controls="bikes-filter-options"
                    onClick={() => setFiltrosAberto((aberto) => !aberto)}
                  >
                    <Icone name="filter" size={14} /> Filtros
                  </button>
                  {filtrosAberto && (
                    <div id="bikes-filter-options" className="bikes-filter-popover">
                      <strong>Filtrar por situação</strong>
                      <p>
                        Mostrando {filtrado.length} de {dados.items.length} motocicletas
                      </p>
                      <div>
                        {filtroSituacoes.map((opcao) => (
                          <button
                            type="button"
                            key={opcao.key}
                            aria-pressed={situacao === opcao.key}
                            onClick={() => {
                              setSituacao(opcao.key);
                              setFiltrosAberto(false);
                            }}
                          >
                            {opcao.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="bikes-clear"
                  onClick={() => {
                    setBusca('');
                    setSituacao('all');
                    setMarca('all');
                    setAno('all');
                    setFiltrosAberto(false);
                  }}
                >
                  <Icone name="trash" size={13} /> Limpar filtros
                </button>
              </div>
              <div className="bikes-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Motocicleta</th>
                      <th>Placa</th>
                      <th>Cliente</th>
                      <th>Ano/Modelo</th>
                      <th>Quilometragem</th>
                      <th>Status</th>
                      <th>Última OS</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!primeiraCarga && visivel.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="bikes-empty">
                          {erro
                            ? 'Não foi possível carregar a lista. Tente novamente pelo aviso no canto da tela.'
                            : 'Nenhuma motocicleta encontrada. Ajuste os filtros ou cadastre uma nova.'}
                        </td>
                      </tr>
                    ) : !primeiraCarga ? (
                      visivel.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="bikes-name">
                              <MotoMiniatura item={item} revision={revisaoImagem} />
                              <span>
                                <strong>{item.model}</strong>
                                <small>Cor: {item.color || 'Não informada'}</small>
                              </span>
                            </div>
                          </td>
                          <td className="bikes-plate">{item.plate}</td>
                          <td>
                            <div className="bikes-client">
                              <strong>{item.client}</strong>
                              {item.phone && (
                                <a
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  href={`https://wa.me/${item.phone
                                    .replace(/\D/g, '')
                                    .replace(/^55(?=\d{10,11}$)/, '')
                                    .replace(/^(?=\d{10,11}$)/, '55')}`}
                                >
                                  {item.phone} <Icone name="whatsapp" size={10} />
                                </a>
                              )}
                            </div>
                          </td>
                          <td>
                            {item.year ?? '—'}/{item.modelYear ?? item.year ?? '—'}
                          </td>
                          <td>
                            {item.mileage === null
                              ? '—'
                              : `${item.mileage.toLocaleString('pt-BR')} km`}
                          </td>
                          <td>
                            <SituacaoBadge value={item.status} />
                          </td>
                          <td>
                            {item.lastOrder ? (
                              <button
                                type="button"
                                className="bikes-last-os"
                                onClick={() => navegar(`/ordens-de-servico/${item.lastOrder!.id}`)}
                              >
                                <strong>OS #{item.lastOrder.id}</strong>
                                <small>{dadosBrasileira(item.lastOrder.date)}</small>
                              </button>
                            ) : (
                              <span className="bikes-muted">—</span>
                            )}
                          </td>
                          <td>
                            <div className="bikes-actions">
                              <button
                                type="button"
                                title="Ver motocicleta"
                                aria-label={`Ver ${item.model}`}
                                onClick={() => setVisualizando(item)}
                              >
                                <Icone name="eye" size={14} />
                              </button>
                              <button
                                type="button"
                                title="Editar motocicleta"
                                aria-label={`Editar ${item.model}`}
                                onClick={() => setEditando(item)}
                              >
                                <Icone name="pencil" size={14} />
                              </button>
                              <button
                                type="button"
                                className="delete"
                                title="Excluir motocicleta"
                                aria-label={`Excluir ${item.model}`}
                                onClick={() => setExcluindo(item)}
                              >
                                <Icone name="trash" size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : null}
                  </tbody>
                </table>
                {primeiraCarga && <SkeletonLinhasTabela colunas={8} />}
              </div>
              <div className="bikes-footer">
                <span>
                  Mostrando{' '}
                  {filtrado.length
                    ? `${(paginaAtual - 1) * tamanhoPagina + 1} a ${Math.min(paginaAtual * tamanhoPagina, filtrado.length)}`
                    : '0'}{' '}
                  de {filtrado.length} motocicletas
                </span>
                <div>
                  <div className="bikes-page-size" ref={paginaTamanhoReferencia}>
                    <span>Itens por página:</span>
                    <button
                      type="button"
                      className="bikes-page-size-trigger"
                      aria-label={`Itens por página: ${tamanhoPagina}`}
                      aria-expanded={paginaTamanhoAberto}
                      aria-haspopup="menu"
                      onClick={() => setPaginaTamanhoAberto((aberto) => !aberto)}
                    >
                      {tamanhoPagina}
                      <Icone name="chevron" size={12} />
                    </button>
                    {paginaTamanhoAberto && (
                      <div
                        className="bikes-page-size-options"
                        role="menu"
                        aria-label="Itens por página"
                      >
                        {[10, 15, 25].map((tamanho) => (
                          <button
                            role="menuitemradio"
                            aria-checked={tamanhoPagina === tamanho}
                            type="button"
                            key={tamanho}
                            onClick={() => {
                              setPaginaTamanho(tamanho);
                              setPaginaTamanhoAberto(false);
                            }}
                          >
                            {tamanho}
                            <span>{tamanhoPagina === tamanho ? '✓' : ''}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPagina(Math.max(1, paginaAtual - 1))}
                    disabled={paginaAtual === 1}
                    aria-label="Página anterior"
                  >
                    <Icone name="left" size={13} />
                  </button>
                  {paginasExibidas(paginaAtual, ultimoPagina).map((numero, indiceLocal) =>
                    numero === '…' ? (
                      <span key={`dots${indiceLocal}`}>…</span>
                    ) : (
                      <button
                        type="button"
                        key={numero}
                        className={numero === paginaAtual ? 'current' : ''}
                        onClick={() => setPagina(numero)}
                      >
                        {numero}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => setPagina(Math.min(ultimoPagina, paginaAtual + 1))}
                    disabled={paginaAtual === ultimoPagina}
                    aria-label="Próxima página"
                  >
                    <Icone name="right" size={13} />
                  </button>
                </div>
              </div>
            </section>
          </ConteudoCarregando>
        </main>
      </div>
      {(avisoTemporario || (erro && !excluindo)) && (
        <div className="bikes-notice" role={erro ? 'alert' : 'status'}>
          <span className="bikes-notice-mark">
            <Icone name={erro ? 'close' : 'check'} size={14} />
          </span>
          <span>{erro || avisoTemporario}</span>
          {erro && (
            <button type="button" onClick={() => void recarregar()}>
              Tentar novamente
            </button>
          )}
          <button
            type="button"
            className="bikes-notice-close"
            onClick={() => {
              setAvisoTemporario('');
              setErro('');
            }}
            aria-label="Fechar aviso"
          >
            <Icone name="close" size={14} />
          </button>
        </div>
      )}
      {editando !== undefined && (
        <ModalEditarMotocicleta
          item={editando}
          clients={dados.clients}
          onClose={() => setEditando(undefined)}
          onSaved={() => {
            setEditando(undefined);
            setAvisoTemporario('Motocicleta salva com sucesso.');
            void recarregar();
          }}
          onImage={(motocicleta) => {
            setEditando(undefined);
            setImagemEditar(motocicleta);
          }}
        />
      )}
      {imagemEditar && (
        <ModalPreviaModelo
          motorcycleId={imagemEditar.id}
          currentModel={imagemEditar.model}
          onClose={() => setImagemEditar(null)}
          onChanged={() => {
            setImagemRevisao((valor) => valor + 1);
            void recarregar();
          }}
        />
      )}
      {visualizando && (
        <ModalVerMotocicleta
          item={visualizando}
          revision={revisaoImagem}
          onClose={() => setVisualizando(null)}
          onEdit={() => {
            setEditando(visualizando);
            setVisualizando(null);
          }}
          onOwner={() => {
            setVisualizando(null);
            navegar(`/clientes/${visualizando.clientId}`);
          }}
          onLastOrder={() => {
            if (visualizando.lastOrder) {
              setVisualizando(null);
              navegar(`/ordens-de-servico/${visualizando.lastOrder.id}`);
            }
          }}
          onHistory={() => {
            if (visualizando.lastOrder) {
              setVisualizando(null);
              navegar(`/ordens-de-servico/${visualizando.lastOrder.id}/historico`);
            }
          }}
        />
      )}
      {excluindo && (
        <div
          className="bikes-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) setExcluindo(null);
          }}
        >
          <section
            className="bikes-delete"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bike-delete-title"
            aria-describedby="bike-delete-description"
          >
            <span className="bikes-delete-icon">
              <Icone name="trash" size={21} />
            </span>
            <div className="bikes-delete-content">
              <button
                type="button"
                className="bikes-delete-close"
                aria-label="Fechar"
                onClick={() => setExcluindo(null)}
              >
                <Icone name="close" size={19} />
              </button>
              <h2 id="bike-delete-title">Manter o histórico da motocicleta</h2>
              <p id="bike-delete-description">
                O cadastro de <strong>{excluindo.model}</strong> não pode ser excluído. Ele preserva
                a identificação da moto e suas ordens de serviço.
              </p>
              <p>Se ela não deve aparecer como ativa, edite o cadastro e marque como inativo.</p>
              <div className="bikes-delete-actions">
                <button type="button" onClick={() => setExcluindo(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setEditando(excluindo);
                    setExcluindo(null);
                  }}
                >
                  Editar motocicleta
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
