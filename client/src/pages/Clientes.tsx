import { useFocoModal } from '../hooks/useFocoModal';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import { limparRascunho } from '../services/rascunhos';
import CartaoIndicador from '../components/CartaoIndicador';
import { useCargaInicial } from '../hooks/useCargaInicial';
import { usePesquisaPagina } from '../hooks/usePesquisaPagina';
import { useCartoesPagina, useCartaoVisivel } from '../hooks/useCartoesPagina';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import ConteudoCarregando from '../components/ConteudoCarregando';
import SkeletonLinhasTabela from '../components/SkeletonLinhasTabela';
import SkeletonPagina from '../components/SkeletonPagina';
import { Icone } from '../components/MenuAdmin';
import ModalEditarCliente from '../components/ModalEditarCliente';
import PerfilCliente from '../components/PerfilCliente';
import { useUsuarioAdministrador } from '../components/RotaProtegida';
import { useDadosVivos } from '../hooks/useDadosVivos';
import { correspondeBusca } from '../utils/buscaAproximada';
import {
  buscarClientes,
  buscarFotoDiretorioCliente,
  buscarPerfilCliente,
  ErroRequisicaoApi,
  excluirCliente,
  type DadosPerfilCliente,
  type ItemCliente,
  type RespostaClientes,
  type SituacaoCliente,
} from '../services/apiAutenticacao';
import { escalaAtual } from '../services/preferenciasGlobais';
import './clientes.css';
import './ordens-servico.css';

type Filtro = 'all' | 'active' | 'return' | 'new' | SituacaoCliente;
type Ordenacao = 'recent' | 'oldest' | 'none';
const vazio: RespostaClientes = {
  items: [],
  counts: { all: 0, active: 0, return: 0, new: 0 },
  models: [],
};
const tamanhoPagina = 6;
const rotulosSituacao: Record<SituacaoCliente, string> = {
  'em andamento': 'OS em andamento',
  'aguardando peça': 'Aguardando peça',
  pronto: 'OS pronta',
  aguardando: 'OS aberta',
  retorno: 'Retorno sugerido',
  entregue: 'Serviço finalizado',
  cancelada: 'Sem OS ativa',
  'sem-os': 'Sem OS ativa',
};
const cartaoInformacao = [
  {
    key: 'all',
    label: 'Clientes',
    icon: 'users',
    tone: 'blue',
    tip: 'Todos os clientes cadastrados',
  },
  {
    key: 'active',
    label: 'Com OS ativa',
    icon: 'wrench',
    tone: 'sky',
    tip: 'Clientes com uma OS aberta, em andamento, aguardando peça ou pronta',
  },
  {
    key: 'return',
    label: 'Aguardando retorno',
    icon: 'clock',
    tone: 'amber',
    tip: 'Sem OS ativa e há pelo menos 90 dias do último serviço concluído',
  },
  {
    key: 'new',
    label: 'Novos este mês',
    icon: 'trending',
    tone: 'mint',
    tip: 'Clientes cujo primeiro atendimento registrado foi neste mês',
  },
] as const;

function dadosOnly(valor: string | null) {
  if (!valor) return '—';
  const [outroItem, mesAtual, dadosAtual] = valor.slice(0, 10).split('-');
  return outroItem && mesAtual && dadosAtual ? `${dadosAtual}/${mesAtual}/${outroItem}` : '—';
}
function iniciais(valor: string) {
  return valor
    .split(/\s+/)
    .slice(0, 2)
    .map((palavra) => palavra[0])
    .join('')
    .toUpperCase();
}
function whatsappLigacao(telefone: string) {
  const digitos = telefone.replace(/\D/g, '');
  return `https://wa.me/${digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`}`;
}
function paginasExibidas(atual: number, total: number): (number | '…')[] {
  if (total <= 5) return Array.from({ length: total }, (_, numero) => numero + 1);
  const escolhas = [
    ...new Set([1, total, atual - 1, atual, atual + 1, ...(atual < 3 ? [2, 3] : [])]),
  ]
    .filter((numero) => numero >= 1 && numero <= total)
    .sort((primeiroElemento, segundoElemento) => primeiroElemento - segundoElemento);
  return escolhas.flatMap((numero, indice) =>
    indice && numero - escolhas[indice - 1] > 1 ? ['…' as const, numero] : [numero],
  );
}

function ClienteAvatar({
  id,
  name: nome,
  hasPhoto: temFoto,
  photoUrl: fotoUrl,
  size: tamanho = 'small',
}: {
  id: number;
  name: string;
  hasPhoto: boolean;
  photoUrl: string | null;
  size?: 'small' | 'large';
}) {
  const [url, setUrl] = useState('');
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    if (!temFoto || fotoUrl) return;
    let atualizacaoContinua = true;
    let urlObjeto = '';
    buscarFotoDiretorioCliente(id)
      .then((blob) => {
        urlObjeto = URL.createObjectURL(blob);
        if (atualizacaoContinua) setUrl(urlObjeto);
        else URL.revokeObjectURL(urlObjeto);
      })
      .catch(() => {
        if (atualizacaoContinua) setUrl('');
      });
    return () => {
      atualizacaoContinua = false;
      if (urlObjeto) URL.revokeObjectURL(urlObjeto);
    };
  }, [id, temFoto, fotoUrl]);
  const foto = url || (!falhou && fotoUrl) || '';
  return (
    <span className={`client-avatar ${tamanho === 'large' ? 'large' : ''}`}>
      {foto ? (
        <img
          src={foto}
          alt={`Foto de ${nome}`}
          onError={() => {
            setUrl('');
            setFalhou(true);
          }}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="client-avatar-initials" role="img" aria-label={`Iniciais de ${nome}`}>
          {iniciais(nome)}
        </span>
      )}
    </span>
  );
}

export default function Clientes() {
  const exibirCartao = useCartaoVisivel('clientes');
  const cartoesVisiveis = useCartoesPagina('clientes', cartaoInformacao, (item) => item.key);
  const navegar = useNavigate();
  const { id } = useParams();
  const perfilId = id ? Number(id) : null;
  const usuario = useUsuarioAdministrador();
  const autorizado = !!usuario;
  const [avisoTemporario, setAvisoTemporario] = useState('');
  const [dados, setDados] = useState<RespostaClientes>(vazio);
  const [perfil, setPerfil] = useState<DadosPerfilCliente | null>(null);
  const [carregandoLocal, setCarregando] = useState(true);
  const primeiraCarga = useCargaInicial(carregandoLocal);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  usePesquisaPagina(setBusca);
  const [filtro, setFiltro] = useState<Filtro>('all');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('recent');
  const [modelo, setModelo] = useState('all');
  const [pagina, setPagina] = useState(1);
  const [acao, setAcao] = useState<number | null>(null);
  const [acaoPosicao, setAcaoPosicao] = useState<{
    left: number;
    top: number;
    arrowLeft: number;
    above: boolean;
  } | null>(null);
  const [editandoCliente, setEditandoCliente] = useState<DadosPerfilCliente | null>(null);
  const [excluindoCliente, setExcluindoCliente] = useState<ItemCliente | null>(null);
  const [excluindoOcupado, setExcluindoOcupado] = useState(false);
  const [excluindoErro, setExcluindoErro] = useState('');
  const focoExclusao = useFocoModal<HTMLElement>(!!excluindoCliente);
  const escopoExclusao = `exclusao-cliente-${excluindoCliente?.id ?? 'nenhum'}`;
  const [excluindoMotivo, setExcluindoMotivo] = useEstadoRascunho(escopoExclusao, 'motivo', '');

  useEffect(() => {
    if (!autorizado) return;
    let atualizacaoContinua = true;
    setCarregando(true);
    setErro('');
    const tarefa = perfilId
      ? buscarPerfilCliente(perfilId).then((resultado) => {
          if (atualizacaoContinua) setPerfil(resultado);
        })
      : buscarClientes().then((resultado) => {
          if (atualizacaoContinua) setDados(resultado);
        });
    tarefa
      .catch((erroCapturado) => {
        if (!atualizacaoContinua) return;
        if (
          erroCapturado instanceof ErroRequisicaoApi &&
          [401, 403].includes(erroCapturado.situacao)
        )
          navegar('/login', { replace: true });
        else
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível carregar os clientes.',
          );
      })
      .finally(() => {
        if (atualizacaoContinua) setCarregando(false);
      });
    return () => {
      atualizacaoContinua = false;
    };
  }, [autorizado, perfilId, navegar]);
  useEffect(() => {
    setPagina(1);
    setAcao(null);
  }, [busca, filtro, ordenacao, modelo]);
  useEffect(() => {
    if (!avisoTemporario) return;
    const temporizador = setTimeout(() => setAvisoTemporario(''), 3500);
    return () => clearTimeout(temporizador);
  }, [avisoTemporario]);
  useEffect(() => {
    if (acao === null) return;
    const fora = (evento: PointerEvent) => {
      if (
        !(evento.target instanceof Element) ||
        !evento.target.closest('.clients-action-menu,.clients-more')
      )
        setAcao(null);
    };
    const fechar = () => setAcao(null);
    const teclaPressionada = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') fechar();
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', teclaPressionada);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', teclaPressionada);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [acao]);

  useDadosVivos(
    async (valido) => {
      try {
        if (perfilId) {
          const resultado = await buscarPerfilCliente(perfilId);
          if (valido()) setPerfil(resultado);
        } else {
          const resultado = await buscarClientes();
          if (valido()) setDados(resultado);
        }
      } catch (erroCapturado) {
        if (valido())
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível atualizar os clientes.',
          );
      }
    },
    autorizado && !carregandoLocal,
    String(perfilId),
  );
  const filtrado = useMemo(() => {
    const resultado = dados.items.filter((cliente) => {
      const correspondencias =
        filtro === 'all' ||
        (filtro === 'active' && cliente.active) ||
        (filtro === 'return' && cliente.awaitingReturn) ||
        (filtro === 'new' && cliente.newThisMonth) ||
        cliente.situation === filtro;
      return (
        correspondencias &&
        (modelo === 'all' ||
          cliente.motorcycles.some((motocicleta) => motocicleta.model === modelo)) &&
        correspondeBusca(
          busca,
          `${cliente.name} ${cliente.phone ?? ''} ${cliente.motorcycles.map((motocicleta) => `${motocicleta.model} ${motocicleta.plate ?? ''}`).join(' ')}`,
        )
      );
    });
    if (ordenacao === 'none') return resultado.filter((cliente) => !cliente.lastAttendance);
    return resultado.sort((primeiroElemento, segundoElemento) =>
      ordenacao === 'recent'
        ? (segundoElemento.lastAttendance ?? '').localeCompare(
            primeiroElemento.lastAttendance ?? '',
          ) || primeiroElemento.name.localeCompare(segundoElemento.name, 'pt-BR')
        : (primeiroElemento.lastAttendance ?? '9999').localeCompare(
            segundoElemento.lastAttendance ?? '9999',
          ) || primeiroElemento.name.localeCompare(segundoElemento.name, 'pt-BR'),
    );
  }, [dados, busca, filtro, ordenacao, modelo]);
  const quantidadePaginas = Math.max(1, Math.ceil(filtrado.length / tamanhoPagina));
  const visivel = filtrado.slice((pagina - 1) * tamanhoPagina, pagina * tamanhoPagina);
  const inicio = filtrado.length ? (pagina - 1) * tamanhoPagina + 1 : 0;
  const fim = Math.min(pagina * tamanhoPagina, filtrado.length);
  const restaurar = () => {
    setBusca('');
    setFiltro('all');
    setOrdenacao('recent');
    setModelo('all');
  };
  const visitar = (cliente: ItemCliente) => {
    setAcao(null);
    navegar(`/clientes/${cliente.id}`);
  };
  function alternarAcoes(cliente: ItemCliente, botao: HTMLButtonElement) {
    if (acao === cliente.id) {
      setAcao(null);
      return;
    }
    const retangulo = botao.getBoundingClientRect();
    const menuLargura = 184 * escalaAtual();
    const alturaMenu = 130 * escalaAtual();
    const esquerda = Math.max(
      8,
      Math.min(window.innerWidth - menuLargura - 8, retangulo.right - menuLargura),
    );
    const acima = retangulo.bottom + alturaMenu + 10 >= window.innerHeight;
    setAcaoPosicao({
      left: esquerda,
      top: acima ? Math.max(8, retangulo.top - alturaMenu - 10) : retangulo.bottom + 10,
      arrowLeft: Math.max(
        15,
        Math.min(menuLargura - 15, retangulo.left + retangulo.width / 2 - esquerda),
      ),
      above: acima,
    });
    setAcao(cliente.id);
  }
  async function editarDeLista(cliente: ItemCliente) {
    setAcao(null);
    try {
      setEditandoCliente(await buscarPerfilCliente(cliente.id));
    } catch (erroCapturado) {
      setAvisoTemporario(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível abrir o cliente.',
      );
    }
  }
  function visualizacaoClienteOrdens(cliente: ItemCliente) {
    setAcao(null);
    const parametros = new URLSearchParams({
      clientId: String(cliente.id),
      clientName: cliente.name,
    });
    navegar(`/ordens-de-servico?${parametros}`);
  }
  async function confirmarExcluir() {
    if (!excluindoCliente || excluindoOcupado) return;
    if (excluindoMotivo.trim().length < 5) {
      setExcluindoErro('Descreva o motivo da exclusão com pelo menos 5 caracteres.');
      return;
    }
    setExcluindoOcupado(true);
    setExcluindoErro('');
    try {
      await excluirCliente(excluindoCliente.id, excluindoMotivo.trim());
      setDados(await buscarClientes());
      setPagina(1);
      setExcluindoCliente(null);
      limparRascunho(escopoExclusao);
      setAvisoTemporario('Cliente removido da lista. Motos e histórico de OS foram preservados.');
    } catch (erroCapturado) {
      setExcluindoErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível excluir o cliente.',
      );
    } finally {
      setExcluindoOcupado(false);
    }
  }

  return (
    <div className="orders-viewport clients-viewport">
      <div className="orders-main">
        {perfilId ? (
          <main className="clients-content clients-profile-content">
            <ConteudoCarregando carregando={carregandoLocal && !erro}>
              <div className="client-crumb">
                <button onClick={() => navegar('/dashboard')}>Dashboard</button>
                <span>/</span>
                <button onClick={() => navegar('/clientes')}>Clientes</button>
                <span>/</span>
                <strong>{perfil?.name || 'Perfil'}</strong>
              </div>
              {primeiraCarga ? (
                <SkeletonPagina caminho={`/clientes/${perfilId}`} />
              ) : erro ? (
                <p role="alert" className="clients-inline-state">
                  {erro} <button onClick={() => navegar('/clientes')}>Voltar aos clientes</button>
                </p>
              ) : (
                perfil && (
                  <>
                    <PerfilCliente
                      profile={perfil}
                      onToast={setAvisoTemporario}
                      onUpdated={async () => {
                        setPerfil(await buscarPerfilCliente(perfil.id));
                      }}
                    />
                  </>
                )
              )}
            </ConteudoCarregando>
          </main>
        ) : (
          <main className="clients-content">
            <ConteudoCarregando carregando={carregandoLocal && !erro}>
              <div className="client-crumb">
                <span>Dashboard</span>
                <span>/</span>
                <strong>Clientes</strong>
              </div>
              <div className="clients-heading">
                <h1>Clientes</h1>
                <p>Gerencie relacionamentos, motocicletas e históricos de atendimento.</p>
              </div>
              <div
                className="clients-stats indicadores-grid"
                data-indicadores
                data-workspace-custom-cards={cartoesVisiveis.length !== cartaoInformacao.length}
              >
                {cartoesVisiveis.map((cartao) => (
                  <CartaoIndicador
                    key={cartao.key}
                    editorId={`clientes:${cartao.key}`}
                    oculto={!exibirCartao(cartao.key)}
                    titulo={cartao.label}
                    valor={dados.counts[cartao.key]}
                    descricao={
                      cartao.key === 'all'
                        ? 'Todos os clientes cadastrados'
                        : cartao.key === 'active'
                          ? 'Com atendimento em aberto'
                          : cartao.key === 'return'
                            ? 'Há 90 dias sem retornar'
                            : 'Primeiro atendimento no mês'
                    }
                    icone={cartao.icon}
                    tom={cartao.tone}
                    ajuda={cartao.tip}
                    total={dados.counts.all}
                    ativo={filtro === cartao.key}
                    aoClicar={() =>
                      setFiltro(filtro === cartao.key && cartao.key !== 'all' ? 'all' : cartao.key)
                    }
                  />
                ))}
              </div>
              <section className="clients-panel" aria-label="Lista de clientes">
                <div className="clients-filters">
                  <label className="clients-query">
                    <Icone name="search" size={14} />
                    <input
                      aria-label="Buscar clientes"
                      placeholder="Buscar por nome, telefone ou placa"
                      value={busca}
                      onChange={(evento) => setBusca(evento.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Situação"
                    value={['all', 'active', 'return', 'new'].includes(filtro) ? filtro : filtro}
                    onChange={(evento) => setFiltro(evento.target.value as Filtro)}
                  >
                    <option value="all">Situação</option>
                    <option value="active">Com OS ativa</option>
                    <option value="return">Aguardando retorno</option>
                    <option value="new">Novos este mês</option>
                    <option value="em andamento">OS em andamento</option>
                    <option value="aguardando">OS aberta</option>
                    <option value="aguardando peça">Aguardando peça</option>
                    <option value="pronto">OS pronta</option>
                    <option value="entregue">Serviço finalizado</option>
                    <option value="sem-os">Sem OS ativa</option>
                  </select>
                  <select
                    aria-label="Ordenar por último atendimento"
                    value={ordenacao}
                    onChange={(evento) => setOrdenacao(evento.target.value as Ordenacao)}
                  >
                    <option value="recent">Último atendimento</option>
                    <option value="oldest">Mais antigo primeiro</option>
                    <option value="none">Sem atendimento</option>
                  </select>
                  <select
                    aria-label="Motocicleta"
                    value={modelo}
                    onChange={(evento) => setModelo(evento.target.value)}
                  >
                    <option value="all">Motocicleta</option>
                    {dados.models.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <button className="clients-clear" onClick={restaurar}>
                    Limpar filtros
                  </button>
                </div>
                <div className="clients-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>CLIENTE</th>
                        <th>CONTATO</th>
                        <th>MOTOCICLETA</th>
                        <th>ÚLTIMO ATENDIMENTO</th>
                        <th>SITUAÇÃO</th>
                        <th>AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visivel.map((cliente) => (
                        <tr key={cliente.id}>
                          <td>
                            <div className="client-name-cell">
                              <ClienteAvatar
                                id={cliente.id}
                                name={cliente.name}
                                hasPhoto={cliente.hasPhoto}
                                photoUrl={cliente.photoUrl}
                              />
                              <span>
                                <b>{cliente.name}</b>
                                <small>
                                  {cliente.firstAttendance
                                    ? `Primeira OS em ${dadosOnly(cliente.firstAttendance)}`
                                    : 'Sem atendimento registrado'}
                                </small>
                              </span>
                            </div>
                          </td>
                          <td>
                            {cliente.phone ? (
                              <a
                                className="clients-phone"
                                href={whatsappLigacao(cliente.phone)}
                                target="_blank"
                                rel="noreferrer"
                                title="Conversar pelo WhatsApp"
                              >
                                <Icone name="phone" size={12} />
                                {cliente.phone}
                              </a>
                            ) : (
                              <span className="clients-muted">Não informado</span>
                            )}
                          </td>
                          <td>
                            <div className="client-bike-cell">
                              <Icone name="bike" size={15} />
                              <span>
                                {cliente.motorcycle ? (
                                  <>
                                    <b>{cliente.motorcycle}</b>
                                    <small>
                                      {cliente.plate || 'Sem placa'}
                                      {cliente.motorcycleCount > 1
                                        ? ` · +${cliente.motorcycleCount - 1} ${cliente.motorcycleCount === 2 ? 'moto' : 'motos'}`
                                        : ''}
                                    </small>
                                  </>
                                ) : (
                                  <span className="clients-muted">Não cadastrada</span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td>{dadosOnly(cliente.lastAttendance)}</td>
                          <td>
                            <span
                              className={`clients-badge situation-${cliente.situation.replaceAll(' ', '-')}`}
                            >
                              {rotulosSituacao[cliente.situation]}
                            </span>
                          </td>
                          <td>
                            <div className="clients-row-actions">
                              <button className="clients-view" onClick={() => visitar(cliente)}>
                                Ver perfil
                              </button>
                              <button
                                className="clients-more"
                                aria-label={`Mais ações de ${cliente.name}`}
                                aria-expanded={acao === cliente.id}
                                aria-haspopup="menu"
                                onClick={(evento) => alternarAcoes(cliente, evento.currentTarget)}
                              >
                                <Icone name="more" size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!primeiraCarga && (erro || !visivel.length) && (
                        <tr>
                          <td
                            colSpan={6}
                            className="clients-empty"
                            role={erro ? 'alert' : undefined}
                          >
                            {erro || 'Nenhum cliente encontrado para esses filtros.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {primeiraCarga && <SkeletonLinhasTabela colunas={6} />}
                </div>
                <div className="clients-panel-footer">
                  <span>
                    Mostrando {inicio} a {fim} de {filtrado.length} clientes
                  </span>
                  <nav className="clients-pagination" aria-label="Páginas de clientes">
                    <button
                      aria-label="Página anterior"
                      disabled={pagina <= 1 || carregandoLocal}
                      onClick={() => setPagina(pagina - 1)}
                    >
                      <Icone name="left" size={13} />
                    </button>
                    {paginasExibidas(pagina, quantidadePaginas).map((item, numero) =>
                      item === '…' ? (
                        <span key={`gap-${numero}`}>…</span>
                      ) : (
                        <button
                          key={item}
                          className={pagina === item ? 'current' : ''}
                          aria-current={pagina === item ? 'page' : undefined}
                          onClick={() => setPagina(item)}
                        >
                          {item}
                        </button>
                      ),
                    )}
                    <button
                      aria-label="Próxima página"
                      disabled={pagina >= quantidadePaginas || carregandoLocal}
                      onClick={() => setPagina(pagina + 1)}
                    >
                      <Icone name="right" size={13} />
                    </button>
                  </nav>
                </div>
              </section>
            </ConteudoCarregando>
          </main>
        )}
      </div>
      {acao !== null &&
        acaoPosicao &&
        dados.items.find((cliente) => cliente.id === acao) &&
        createPortal(
          <div
            className={`clients-action-menu${acaoPosicao.above ? ' menu-above' : ''}`}
            role="menu"
            aria-label={`Ações de ${dados.items.find((cliente) => cliente.id === acao)?.name}`}
            style={
              {
                left: acaoPosicao.left / escalaAtual(),
                top: acaoPosicao.top / escalaAtual(),
                '--arrow-left': `${acaoPosicao.arrowLeft / escalaAtual()}px`,
              } as CSSProperties
            }
          >
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                void editarDeLista(dados.items.find((cliente) => cliente.id === acao)!)
              }
            >
              <span className="clients-menu-icon edit">
                <Icone name="pencil" size={16} />
              </span>
              Editar cliente
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                visualizacaoClienteOrdens(dados.items.find((cliente) => cliente.id === acao)!)
              }
            >
              <span className="clients-menu-icon orders">
                <Icone name="clipboard" size={16} />
              </span>
              Ver ordens
            </button>
            <button
              type="button"
              role="menuitem"
              className="clients-menu-delete"
              onClick={() => {
                setExcluindoErro('');
                setExcluindoCliente(dados.items.find((cliente) => cliente.id === acao)!);
                setAcao(null);
              }}
            >
              <span className="clients-menu-icon delete">
                <Icone name="trash" size={16} />
              </span>
              Excluir cliente
            </button>
          </div>,
          document.body,
        )}
      {editandoCliente && (
        <ModalEditarCliente
          client={editandoCliente}
          onClose={() => setEditandoCliente(null)}
          onSaved={async () => {
            setDados(await buscarClientes());
            setAvisoTemporario('Cliente atualizado.');
          }}
        />
      )}
      {excluindoCliente && (
        <div
          className="clients-delete-backdrop"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget && !excluindoOcupado)
              setExcluindoCliente(null);
          }}
        >
          <section
            className="clients-delete-dialog"
            ref={focoExclusao}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clients-delete-title"
          >
            <span className="clients-delete-icon">
              <Icone name="trash" size={22} />
            </span>
            <h2 id="clients-delete-title">Excluir cliente?</h2>
            <p>
              <strong>{excluindoCliente.name}</strong> deixará de aparecer na lista de clientes. As
              motos e o histórico de ordens de serviço serão preservados.
            </p>
            <label className="clients-delete-reason">
              Motivo da exclusão <span>(obrigatório)</span>
              <textarea
                autoFocus
                maxLength={500}
                value={excluindoMotivo}
                onChange={(evento) => {
                  setExcluindoMotivo(evento.target.value);
                  setExcluindoErro('');
                }}
                placeholder="Explique por que este cliente deve ser removido da lista..."
              />
              <small>{excluindoMotivo.length}/500</small>
            </label>
            {excluindoErro && (
              <p className="clients-delete-error" role="alert">
                {excluindoErro}
              </p>
            )}
            <div>
              <button
                type="button"
                onClick={() => setExcluindoCliente(null)}
                disabled={excluindoOcupado}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="clients-delete-confirm"
                onClick={() => void confirmarExcluir()}
                disabled={excluindoOcupado || excluindoMotivo.trim().length < 5}
              >
                {excluindoOcupado ? 'Excluindo…' : 'Excluir cliente'}
              </button>
            </div>
          </section>
        </div>
      )}
      {avisoTemporario && (
        <div className="orders-toast" role="status">
          {avisoTemporario}
        </div>
      )}
    </div>
  );
}
