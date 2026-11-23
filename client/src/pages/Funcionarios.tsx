import { useCartaoVisivel } from '../hooks/useCartoesPagina';
import { useCargaInicial } from '../hooks/useCargaInicial';
import { usePesquisaPagina } from '../hooks/usePesquisaPagina';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import ConteudoCarregando from '../components/ConteudoCarregando';
import SkeletonPagina from '../components/SkeletonPagina';
import {
  AvatarFuncionario,
  baixarRegistro,
  dadosCurta,
  IconeFuncionario,
  MetricaFuncionario,
  PaginacaoFuncionario,
  Situacao,
} from '../components/ElementosFuncionario';
import { Icone } from '../components/MenuAdmin';
import SeletorFiltro from '../components/SeletorFiltro';
import SeletorPeriodo from '../components/SeletorPeriodo';
import { useDadosVivos } from '../hooks/useDadosVivos';
import {
  buscarFuncionario,
  buscarFuncionarios,
  type Funcionario,
  type PerfilFuncionario,
  type SituacaoFuncionario,
} from '../services/funcionarios';
import './funcionarios.css';
import './ordens-servico.css';
import { correspondeBusca } from '../utils/buscaAproximada';

const Perfil = lazy(() => import('../components/PerfilFuncionario'));
const NovoFuncionario = lazy(() => import('../components/ModalAdicionarFuncionario'));
const mesInicial = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
const abas: { id: 'todos' | SituacaoFuncionario; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'ativo', label: 'Ativos' },
  { id: 'ferias', label: 'Férias' },
  { id: 'afastado', label: 'Afastados' },
  { id: 'desligado', label: 'Desligados' },
];

export default function Funcionarios() {
  const exibirCartao = useCartaoVisivel('funcionarios');
  const { id } = useParams();
  const [parametros, setParametros] = useSearchParams();
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(parametros.get('mes') ?? '')
    ? parametros.get('mes')!
    : mesInicial();
  const [itensLocal, setItens] = useState<Funcionario[]>([]);
  const [perfil, setPerfil] = useState<PerfilFuncionario | null>(null);
  const [carregandoLocal, setCarregando] = useState(true);
  const primeiraCarga = useCargaInicial(carregandoLocal);
  const [erro, setErro] = useState('');
  const [revisao, setRevisao] = useState(0);
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  usePesquisaPagina(setBusca);
  const [filtro, setFiltro] = useState('todos');
  const [departamentoLocal, setDepartamento] = useState('todos');
  const [cargoLocal, setCargo] = useState('todos');
  const [pagina, setPagina] = useState(1);
  const [avancado, setAvancado] = useState(false);
  const [onlyAberto, setOnlyAberto] = useState(false);
  const [novo, setNovo] = useState(false);
  useEffect(() => {
    const controlador = new AbortController();
    setCarregando(true);
    setErro('');
    if (id) {
      setPerfil(null);
      const funcionarioId = Number(id);
      if (!Number.isSafeInteger(funcionarioId) || funcionarioId < 1) {
        setErro('Funcionário inválido.');
        setCarregando(false);
        return;
      }
      buscarFuncionario(funcionarioId, mes, controlador.signal)
        .then(setPerfil)
        .catch((eventoRecebido) => {
          if (!controlador.signal.aborted) setErro(eventoRecebido.message);
        })
        .finally(() => {
          if (!controlador.signal.aborted) setCarregando(false);
        });
    } else
      buscarFuncionarios(mes, controlador.signal)
        .then((resultadoAtual) => setItens(resultadoAtual.itens))
        .catch((eventoRecebido) => {
          if (!controlador.signal.aborted) setErro(eventoRecebido.message);
        })
        .finally(() => {
          if (!controlador.signal.aborted) setCarregando(false);
        });
    return () => controlador.abort();
  }, [id, mes, revisao]);
  useEffect(() => {
    setPagina(1);
  }, [busca, filtro, departamentoLocal, cargoLocal, onlyAberto]);
  useEffect(() => {
    if (!aviso) return;
    const temporizador = setTimeout(() => setAviso(''), 4500);
    return () => clearTimeout(temporizador);
  }, [aviso]);
  useDadosVivos(
    async (valido) => {
      try {
        if (id) {
          const resultado = await buscarFuncionario(Number(id), mes);
          if (valido()) setPerfil(resultado);
        } else {
          const resultado = await buscarFuncionarios(mes);
          if (valido()) setItens(resultado.itens);
        }
      } catch (erroCapturado) {
        if (valido())
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível atualizar a equipe.',
          );
      }
    },
    !carregandoLocal,
    `${id ?? ''}:${mes}`,
  );
  const filtrado = useMemo(
    () =>
      itensLocal
        .filter(
          (registroAtual) =>
            (filtro === 'todos' || registroAtual.situacao === filtro) &&
            (departamentoLocal === 'todos' || registroAtual.departamento === departamentoLocal) &&
            (cargoLocal === 'todos' || registroAtual.cargo === cargoLocal) &&
            (!onlyAberto || registroAtual.resumo.totalAbertas > 0) &&
            correspondeBusca(
              busca,
              `${registroAtual.nome} ${registroAtual.email ?? ''} ${registroAtual.cargo}`,
            ),
        )
        .sort((primeiroElemento, segundoElemento) =>
          primeiroElemento.nome.localeCompare(segundoElemento.nome, 'pt-BR'),
        ),
    [itensLocal, filtro, departamentoLocal, cargoLocal, onlyAberto, busca],
  );
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(filtrado.length / 8)));
  const linhas = filtrado.slice((paginaAtual - 1) * 8, paginaAtual * 8);
  const quantidade = (textoAtual: SituacaoFuncionario) =>
    itensLocal.filter((registroAtual) => registroAtual.situacao === textoAtual).length;
  const equipeOrdenada = [...itensLocal].sort((primeiroElemento, segundoElemento) =>
    primeiroElemento.nome.localeCompare(segundoElemento.nome, 'pt-BR'),
  );
  const atividadeEquipe = equipeOrdenada.map(
    (registroAtual) => registroAtual.resumo.concluidas + registroAtual.resumo.totalAbertas,
  );
  const ativosEquipe = equipeOrdenada.map((registroAtual) =>
    registroAtual.situacao === 'ativo' ? 1 : 0,
  );
  const feriasEquipe = equipeOrdenada.map((registroAtual) =>
    registroAtual.situacao === 'ferias' ? 1 : 0,
  );
  const abertasEquipe = equipeOrdenada.map((registroAtual) => registroAtual.resumo.totalAbertas);
  const filtroCartao = (situacaoLocal: 'todos' | 'ativo' | 'ferias' | 'open') => {
    if (situacaoLocal === 'todos') {
      setFiltro('todos');
      setOnlyAberto(false);
      setDepartamento('todos');
      setCargo('todos');
      setBusca('');
      return;
    }
    if (situacaoLocal === 'open') {
      setFiltro('todos');
      setOnlyAberto(true);
      return;
    }
    setOnlyAberto(false);
    setFiltro(situacaoLocal);
  };
  const atualizar = () => setRevisao((valorAtual) => valorAtual + 1);
  const setMes = (valor: string) => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) {
      const registroAtual = new URLSearchParams(parametros);
      registroAtual.set('mes', valor);
      setParametros(registroAtual, { replace: true });
    }
  };
  return (
    <div className={`orders-viewport staff-app${id ? ' staff-detail' : ''}`}>
      <div className="orders-main">
        <main className="staff-content">
          <ConteudoCarregando carregando={carregandoLocal && !erro}>
            {id && (
              <nav className="staff-breadcrumb" aria-label="Localização">
                <Link to="/ordens-de-servico">Home</Link>
                <Icone name="right" size={12} />
                <Link to="/funcionarios">Funcionários</Link>
                <Icone name="right" size={12} />
                <span>{perfil?.pessoa.nome ?? 'Perfil'}</span>
              </nav>
            )}
            {!id && (
              <>
                <section className="staff-heading">
                  <div className="staff-heading-title">
                    <span>
                      <IconeFuncionario name="equipe" />
                    </span>
                    <div>
                      <h1>Funcionários</h1>
                      <p>Gerencie os colaboradores da oficina</p>
                    </div>
                  </div>
                  <div className="staff-heading-actions">
                    <label className="staff-search">
                      <input
                        aria-label="Buscar funcionário"
                        placeholder="Buscar funcionário..."
                        value={busca}
                        onChange={(eventoRecebido) => setBusca(eventoRecebido.target.value)}
                      />
                      <Icone name="search" size={17} />
                    </label>
                    <button className="staff-primary" onClick={() => setNovo(true)}>
                      <Icone name="plus" size={17} />
                      Novo Funcionário
                    </button>
                  </div>
                </section>
                <div className="staff-metrics indicadores-grid" data-indicadores>
                  <MetricaFuncionario
                    editorId="todos"
                    hidden={!exibirCartao('todos')}
                    title="Total de Funcionários"
                    tone="blue"
                    value={itensLocal.length}
                    description="Todos os colaboradores"
                    icon="equipe"
                    trend={atividadeEquipe}
                    trendLabel="Ordens por funcionário"
                    onClick={() => filtroCartao('todos')}
                    active={
                      filtro === 'todos' &&
                      !onlyAberto &&
                      departamentoLocal === 'todos' &&
                      cargoLocal === 'todos' &&
                      !busca
                    }
                  />
                  <MetricaFuncionario
                    editorId="ativo"
                    hidden={!exibirCartao('ativo')}
                    title="Funcionários Ativos"
                    value={quantidade('ativo')}
                    description={`${itensLocal.length ? Math.round((quantidade('ativo') / itensLocal.length) * 100) : 0}% do total`}
                    icon="ativos"
                    tone="green"
                    trend={ativosEquipe}
                    trendLabel="Situação por funcionário"
                    onClick={() => filtroCartao('ativo')}
                    active={filtro === 'ativo' && !onlyAberto}
                  />
                  <MetricaFuncionario
                    editorId="ferias"
                    hidden={!exibirCartao('ferias')}
                    title="Em Férias"
                    value={quantidade('ferias')}
                    description="Aproveitando o descanso"
                    icon="ferias"
                    tone="amber"
                    trend={feriasEquipe}
                    trendLabel="Situação por funcionário"
                    onClick={() => filtroCartao('ferias')}
                    active={filtro === 'ferias' && !onlyAberto}
                  />
                  <MetricaFuncionario
                    editorId="open"
                    hidden={!exibirCartao('open')}
                    title="Ordens Abertas"
                    value={itensLocal.reduce(
                      (numero, registroAtual) => numero + registroAtual.resumo.totalAbertas,
                      0,
                    )}
                    description="Em andamento"
                    icon="abertas"
                    tone="red"
                    trend={abertasEquipe}
                    trendLabel="Ordens abertas por funcionário"
                    onClick={() => filtroCartao('open')}
                    active={onlyAberto}
                  />
                </div>
              </>
            )}
            {erro ? (
              <section className="staff-feedback" role="alert">
                <Icone name="info" size={25} />
                <h2>Não foi possível carregar {id ? 'o perfil' : 'os funcionários'}</h2>
                <p>{erro}</p>
                <button className="staff-outline" onClick={atualizar}>
                  Tentar novamente
                </button>
              </section>
            ) : primeiraCarga ? (
              <SkeletonPagina caminho={id ? `/funcionarios/${id}` : '/funcionarios'} />
            ) : id && perfil ? (
              <Suspense
                fallback={
                  <SkeletonPagina caminho={`/funcionarios/${id}`} />
                }
              >
                <Perfil
                  profile={perfil}
                  onRefresh={atualizar}
                  onNotice={setAviso}
                  onMonth={setMes}
                />
              </Suspense>
            ) : (
              !id && (
                <section className="staff-directory">
                  <div className="staff-directory-toolbar">
                    <div
                      className="staff-filter-tabs"
                      role="tablist"
                      aria-label="Situação do funcionário"
                    >
                      {abas.map((instanteAtual) => (
                        <button
                          role="tab"
                          aria-selected={filtro === instanteAtual.id}
                          className={filtro === instanteAtual.id ? 'active' : ''}
                          key={instanteAtual.id}
                          onClick={() => setFiltro(instanteAtual.id)}
                        >
                          {instanteAtual.label}
                        </button>
                      ))}
                    </div>
                    <div className="staff-selects">
                      <SeletorFiltro
                        label="Departamento"
                        value={departamentoLocal}
                        onChange={setDepartamento}
                        variant="staff"
                        options={[
                          { value: 'todos', label: 'Todos os departamentos' },
                          ...[
                            ...new Set(
                              itensLocal
                                .map((registroAtual) => registroAtual.departamento)
                                .filter((valorAtual): valorAtual is string => !!valorAtual),
                            ),
                          ]
                            .sort()
                            .map((valor) => ({ value: valor, label: valor })),
                        ]}
                      />
                      <SeletorFiltro
                        label="Cargo"
                        value={cargoLocal}
                        onChange={setCargo}
                        variant="staff"
                        options={[
                          { value: 'todos', label: 'Todos os cargos', icon: 'users' },
                          ...[...new Set(itensLocal.map((registroAtual) => registroAtual.cargo))]
                            .sort()
                            .map((valor) => ({
                              value: valor,
                              label: valor,
                              icon: /admin/i.test(valor)
                                ? 'user'
                                : /mec/i.test(valor)
                                  ? 'wrench'
                                  : 'staff',
                            })),
                        ]}
                      />
                      <button
                        className={`staff-outline${avancado ? ' selected' : ''}`}
                        aria-expanded={avancado}
                        onClick={() => setAvancado((valorAtual) => !valorAtual)}
                      >
                        <Icone name="filter" size={15} />
                        Filtros{onlyAberto && <b className="staff-filter-count">1</b>}
                      </button>
                    </div>
                  </div>
                  {avancado && (
                    <div className="staff-advanced">
                      <label>
                        <input
                          type="checkbox"
                          checked={onlyAberto}
                          onChange={(eventoRecebido) =>
                            setOnlyAberto(eventoRecebido.target.checked)
                          }
                        />
                        Somente com ordens em aberto
                      </label>
                      <div className="staff-period-control">
                        <span>Período dos indicadores</span>
                        <SeletorPeriodo
                          mode="month"
                          label="Mês dos indicadores"
                          value={mes}
                          onApply={setMes}
                        />
                      </div>
                      <button
                        onClick={() => {
                          setFiltro('todos');
                          setCargo('todos');
                          setDepartamento('todos');
                          setBusca('');
                          setOnlyAberto(false);
                        }}
                      >
                        Limpar filtros
                      </button>
                      <button
                        onClick={() =>
                          baixarRegistro('funcionarios.csv', [
                            [
                              'Funcionário',
                              'E-mail',
                              'Cargo',
                              'Departamento',
                              'Situação',
                              'Admissão',
                            ],
                            ...filtrado.map((registroAtual) => [
                              registroAtual.nome,
                              registroAtual.email,
                              registroAtual.cargo,
                              registroAtual.departamento,
                              registroAtual.situacao,
                              dadosCurta(registroAtual.admissao),
                            ]),
                          ])
                        }
                      >
                        <Icone name="download" size={14} />
                        Exportar lista
                      </button>
                    </div>
                  )}
                  <div className="staff-table-scroll">
                    <table className="staff-table">
                      <thead>
                        <tr>
                          {[
                            'Funcionário',
                            'Cargo',
                            'Departamento',
                            'Ordens Concluídas no Mês',
                            'Ordens em Aberto',
                            'Status',
                            'Data de Admissão',
                            'Ações',
                          ].map((alturaAtual) => (
                            <th key={alturaAtual}>{alturaAtual}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map((registroAtual) => (
                          <tr key={registroAtual.id}>
                            <td>
                              <Link
                                className="staff-person-cell"
                                to={`/funcionarios/${registroAtual.id}?mes=${mes}`}
                              >
                                <AvatarFuncionario
                                  id={registroAtual.id}
                                  nome={registroAtual.nome}
                                />
                                <span>
                                  <strong>{registroAtual.nome}</strong>
                                  <small>{registroAtual.email ?? 'E-mail não informado'}</small>
                                </span>
                              </Link>
                            </td>
                            <td>{registroAtual.cargo}</td>
                            <td>{registroAtual.departamento ?? '—'}</td>
                            <td className="staff-count green">{registroAtual.resumo.concluidas}</td>
                            <td className="staff-count red">{registroAtual.resumo.totalAbertas}</td>
                            <td>
                              <Situacao value={registroAtual.situacao} />
                            </td>
                            <td>{dadosCurta(registroAtual.admissao)}</td>
                            <td>
                              <div className="staff-row-actions">
                                <Link
                                  className="staff-square"
                                  aria-label={`Ver perfil de ${registroAtual.nome}`}
                                  to={`/funcionarios/${registroAtual.id}?mes=${mes}`}
                                >
                                  <Icone name="eye" size={16} />
                                </Link>
                                <details>
                                  <summary aria-label={`Mais ações para ${registroAtual.nome}`}>
                                    <Icone name="more" size={16} />
                                  </summary>
                                  <div>
                                    <Link to={`/funcionarios/${registroAtual.id}/dados?mes=${mes}`}>
                                      <Icone name="pencil" size={14} />
                                      Editar dados
                                    </Link>
                                    <Link
                                      to={`/funcionarios/${registroAtual.id}/ordens?mes=${mes}`}
                                    >
                                      <Icone name="clipboard" size={14} />
                                      Ver ordens
                                    </Link>
                                    {registroAtual.email && (
                                      <a href={`mailto:${registroAtual.email}`}>
                                        <Icone name="mail" size={14} />
                                        Enviar e-mail
                                      </a>
                                    )}
                                  </div>
                                </details>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!linhas.length && (
                          <tr>
                            <td colSpan={8}>
                              <div className="staff-empty">
                                <Icone name="users" size={30} />
                                <strong>
                                  {itensLocal.length
                                    ? 'Nenhum funcionário encontrado'
                                    : 'Sua equipe começa aqui'}
                                </strong>
                                <p>
                                  {itensLocal.length
                                    ? 'Experimente outro nome ou ajuste os filtros.'
                                    : 'Cadastre o primeiro colaborador para acompanhar sua equipe.'}
                                </p>
                                <button
                                  className="staff-outline"
                                  onClick={() => {
                                    if (itensLocal.length) {
                                      setFiltro('todos');
                                      setBusca('');
                                      setDepartamento('todos');
                                      setCargo('todos');
                                      setOnlyAberto(false);
                                    } else setNovo(true);
                                  }}
                                >
                                  {itensLocal.length ? 'Limpar filtros' : 'Novo funcionário'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <PaginacaoFuncionario
                    page={paginaAtual}
                    total={filtrado.length}
                    count={linhas.length}
                    size={8}
                    onChange={setPagina}
                    label="funcionários"
                  />
                </section>
              )
            )}
          </ConteudoCarregando>
        </main>
      </div>
      {aviso && (
        <div className="staff-toast" role="status">
          <Icone name="check" size={18} />
          {aviso}
          <button aria-label="Fechar aviso" onClick={() => setAviso('')}>
            <Icone name="close" size={14} />
          </button>
        </div>
      )}
      {novo && (
        <Suspense fallback={null}>
          <NovoFuncionario
            initialRole="Administrador"
            onClose={() => setNovo(false)}
            onSubmitted={() => {
              atualizar();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
