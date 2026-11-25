import { useEffect, useMemo, useState } from 'react';
import { useDadosVivos } from '../../hooks/useDadosVivos';
import {
  buscarAtividadesSistema,
  type AtividadeSistema,
} from '../../services/configuracoesSistema';
import { Icone } from '../MenuAdmin';
import SeletorFiltro from '../SeletorFiltro';
import SeletorPeriodo, { type DadosIntervalo } from '../SeletorPeriodo';
import Skeleton from '../Skeleton';
import { CfgDialog, baixarArquivo } from './ElementosConfiguracoes';
import { correspondeBusca } from '../../utils/buscaAproximada';
function intervaloInicial(): DadosIntervalo {
  const formatar = (dadosLocal: Date) =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dadosLocal);
  return {
    from: formatar(new Date(Date.now() - 29 * 86400000)),
    to: formatar(new Date()),
  };
}
const acao = (item: AtividadeSistema) => item.action;
const cor = (item: AtividadeSistema) => (item.kind === 'seguranca' ? 'blue' : 'amber');
const dia = (valor: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
  }).format(new Date(valor));
const hora = (valor: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(valor));
function nomeNavegador(userAgent?: string | null) {
  if (!userAgent) return 'Não registrado';
  const browser = /Edg\//.test(userAgent)
    ? 'Microsoft Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Google Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Navegador não identificado';
  const sistema = /Windows/i.test(userAgent)
    ? 'Windows'
    : /iPhone|iPad/i.test(userAgent)
      ? 'iOS'
      : /Android/i.test(userAgent)
        ? 'Android'
        : /Mac OS/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : null;
  return sistema ? `${browser} · ${sistema}` : browser;
}
function NavegadorMarca({ userAgent }: { userAgent?: string | null }) {
  const navegador = !userAgent
    ? 'unknown'
    : /Edg\//.test(userAgent)
      ? 'edge'
      : /OPR\//.test(userAgent)
        ? 'opera'
        : /Firefox\//.test(userAgent)
          ? 'firefox'
          : /Chrome\//.test(userAgent)
            ? 'chrome'
            : /Safari\//.test(userAgent)
              ? 'safari'
              : 'unknown';
  return (
    <span className={`cfg-browser-mark ${navegador}`} aria-hidden="true">
      {navegador === 'edge' ? (
        <img className="cfg-edge-symbol" src="/assets/microsoft-edge-mark.png" alt="" />
      ) : (
      <svg viewBox="0 0 32 32" fill="none">
        {navegador === 'chrome' ? (
          <>
            <path fill="#EA4335" d="M16 2a14 14 0 0 1 12.1 7H16a7 7 0 0 0-6.06 3.5L6 5.3A13.9 13.9 0 0 1 16 2Z" />
            <path fill="#34A853" d="M3.9 9A14 14 0 0 0 16 30l6.1-10.6A7 7 0 0 1 9.9 12.5L3.9 9Z" />
            <path fill="#FBBC04" d="M16 2A14 14 0 0 1 28.1 9H16a7 7 0 0 1 6.06 10.5L16 30l-6.1-10.6A7 7 0 0 1 16 9h12.1" />
            <circle cx="16" cy="16" r="5.2" fill="#4285F4" stroke="#fff" strokeWidth="1.8" />
          </>
        ) : navegador === 'firefox' ? (
          <path fill="url(#firefox-gradient)" d="M26.8 10.2c1.1 1.6 1.7 3.5 1.7 5.7 0 7.2-5.6 12.2-12.5 12.2-6.9 0-12.4-5-12.4-12 0-4.2 1.9-7.9 5.1-10.1l-.2 4.1c1.8-2.6 4.4-4.8 8-6.3-.4 1.7-1.2 3.2-2.2 4.4 3.5-.7 6.8-.2 9.2 2.1-.1-1.9-.7-3.8-1.7-5.3 2.2 1 4 2.8 5 5.2Z" />
        ) : navegador === 'safari' ? (
          <>
            <circle cx="16" cy="16" r="13" fill="#1684E8" />
            <circle cx="16" cy="16" r="10.4" stroke="#fff" strokeOpacity=".7" />
            <path d="m20.8 10.5-3.2 7.1-6.4 3.9 3.2-7.1 6.4-3.9Z" fill="#fff" />
            <path d="m14.4 14.4 3.2 3.2" stroke="#E94B4B" strokeWidth="1.6" />
          </>
        ) : navegador === 'opera' ? (
          <path d="M16 3.5c-6.3 0-10.3 4.8-10.3 12.5S9.7 28.5 16 28.5 26.3 23.7 26.3 16 22.3 3.5 16 3.5Zm0 5c2.9 0 4.5 2.7 4.5 7.5s-1.6 7.5-4.5 7.5-4.5-2.7-4.5-7.5S13.1 8.5 16 8.5Z" fill="#F23B4D" />
        ) : (
          <path d="M5 8h22v16H5zM5 12h22" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        )}
        {navegador === 'firefox' && (
          <defs>
            <linearGradient id="firefox-gradient" x1="5" y1="25" x2="27" y2="5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF6B00" />
              <stop offset="1" stopColor="#7B35D2" />
            </linearGradient>
          </defs>
        )}
      </svg>
      )}
    </span>
  );
}
export default function VisualizarLogs({ onClose: aoFechar }: { onClose: () => void }) {
  const [intervalo, setIntervalo] = useState<DadosIntervalo | null>(intervaloInicial);
  const [itens, setItens] = useState<AtividadeSistema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [tentarNovamente, setTentarNovamente] = useState(0);
  const [usuario, setUsuario] = useState('all');
  const [acaoLocal, setAcao] = useState('all');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [detalheAberto, setDetalheAberto] = useState<string | null>(null);
  const [ordenacao, setOrdenacao] = useState<{
    field: 'at' | 'actor' | 'action' | 'module';
    ascending: boolean;
  }>({ field: 'at', ascending: false });
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    buscarAtividadesSistema(30, 'all', intervalo)
      .then((resultado) => {
        if (ativo) setItens(resultado.items);
      })
      .catch((eventoRecebido) => {
        if (ativo)
          setErro(
            eventoRecebido instanceof Error
              ? eventoRecebido.message
              : 'Não foi possível consultar os registros.',
          );
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [intervalo, tentarNovamente]);
  useDadosVivos(
    async (valido) => {
      try {
        const resultado = await buscarAtividadesSistema(30, 'all', intervalo);
        if (valido()) {
          setItens(resultado.items);
          setErro('');
        }
      } catch (erroCapturado) {
        if (valido())
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível atualizar os registros.',
          );
      }
    },
    !carregando,
    JSON.stringify(intervalo),
  );
  const usuarios = useMemo(
    () => [
      { value: 'all', label: 'Todos' },
      ...Array.from(new Set(itens.map((indice) => indice.actor)))
        .sort((primeiroElemento, segundoElemento) =>
          primeiroElemento.localeCompare(segundoElemento, 'pt-BR'),
        )
        .map((nome) => ({ value: nome, label: nome })),
    ],
    [itens],
  );
  const filtrado = useMemo(() => {
    return itens
      .filter(
        (item) =>
          (usuario === 'all' || item.actor === usuario) &&
          (acaoLocal === 'all' || acao(item) === acaoLocal) &&
          correspondeBusca(
            busca,
            `${item.id} ${item.targetId || ''} ${item.ip || ''} ${item.userAgent || ''} ${item.requestId || ''} ${item.actor} ${item.actorRole || ''} ${acao(item)} ${item.title} ${item.detail}`,
          ),
      )
      .sort((primeiroElemento, segundoElemento) => {
        const primeiroValor =
          ordenacao.field === 'action'
            ? acao(primeiroElemento)
            : String(primeiroElemento[ordenacao.field] || '');
        const segundoValor =
          ordenacao.field === 'action'
            ? acao(segundoElemento)
            : String(segundoElemento[ordenacao.field] || '');
        const resultado =
          primeiroValor.localeCompare(segundoValor, 'pt-BR', { numeric: true }) ||
          primeiroElemento.id.localeCompare(segundoElemento.id, 'pt-BR', { numeric: true });
        return ordenacao.ascending ? resultado : -resultado;
      });
  }, [itens, usuario, acaoLocal, busca, ordenacao]);
  const quantidade = Math.max(1, Math.ceil(filtrado.length / 8));
  const atual = Math.min(pagina, quantidade);
  const linhas = filtrado.slice((atual - 1) * 8, atual * 8);
  const itemDetalhe = detalheAberto ? itens.find((item) => item.id === detalheAberto) : undefined;
  function ordenar(campo: typeof ordenacao.field) {
    setOrdenacao((anterior) => ({
      field: campo,
      ascending: anterior.field === campo ? !anterior.ascending : true,
    }));
    setPagina(1);
  }
  function exportar() {
    const escapar = (valor: string) =>
      `"${(/^[\s\u0000-\u001f]*[=+@-]/.test(valor) ? "'" : '') + valor.replaceAll('"', '""')}"`;
    const dados = [
      ['Data', 'Hora', 'Pessoa', 'Função', 'Ação', 'Área', 'O que aconteceu', 'ID', 'ID relacionado', 'IP', 'Navegador', 'Referência'],
      ...filtrado.map((indice) => [
        dia(indice.at),
        hora(indice.at),
        indice.actor,
        indice.actorRole || '',
        acao(indice),
        indice.module,
        `${indice.title} · ${indice.detail}`,
        indice.id,
        indice.targetId || '',
        indice.ip || '',
        indice.userAgent || '',
        indice.requestId || '',
      ]),
    ];
    baixarArquivo(
      'estacao-motos-logs.csv',
      '\uFEFF' + dados.map((linha) => linha.map(escapar).join(';')).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  }
  const paginas = Array.from({ length: quantidade }, (_, indice) => indice + 1).filter(
    (numero) => numero === 1 || numero === quantidade || Math.abs(numero - atual) <= 2,
  );
  const cabecalho = (rotulo: string, campo: typeof ordenacao.field) => (
    <button onClick={() => ordenar(campo)} title={`Ordenar por ${rotulo}`}>
      {rotulo}
      <Icone name="chevron" size={11} />
    </button>
  );
  return (
    <CfgDialog
      className="cfg-logs-dialog"
      title="Atividades do sistema"
      description="Acompanhe as ações importantes feitas pela equipe."
      icon="clipboard"
      onClose={aoFechar}
      footer={
        <div className="cfg-logs-footer">
          <span className="cfg-logs-total">
            <Icone name="info" size={16} />
            Total de registros: <b>{carregando ? '—' : filtrado.length}</b>
          </span>
          <div className="cfg-logs-pagination">
            <button
              className="cfg-log-page arrow"
              aria-label="Página anterior"
              disabled={atual === 1 || carregando}
              onClick={() => setPagina(atual - 1)}
            >
              <Icone name="left" size={15} />
            </button>
            {paginas.map((numero, indiceLocal) => (
              <span key={numero}>
                {indiceLocal > 0 && numero - paginas[indiceLocal - 1] > 1 && <i>…</i>}
                <button
                  className={`cfg-log-page ${numero === atual ? 'active' : ''}`}
                  aria-label={`Página ${numero}`}
                  aria-current={numero === atual ? 'page' : undefined}
                  onClick={() => setPagina(numero)}
                >
                  {numero}
                </button>
              </span>
            ))}
            <button
              className="cfg-log-page arrow"
              aria-label="Próxima página"
              disabled={atual === quantidade || carregando}
              onClick={() => setPagina(atual + 1)}
            >
              <Icone name="right" size={15} />
            </button>
          </div>
          <button
            className="cfg-logs-export"
            disabled={carregando || !!erro || !filtrado.length}
            onClick={exportar}
          >
            <Icone name="download" size={16} />
            Exportar atividades
          </button>
        </div>
      }
    >
      <div className="cfg-logs-filters">
        <div className="cfg-logs-period">
          <span>
            <Icone name="calendar" size={15} />
            Período
          </span>
          <SeletorPeriodo
            value={intervalo}
            onApply={(valor) => {
              setIntervalo(valor);
              setPagina(1);
            }}
            label="Período dos logs"
            placeholder="Últimos 30 dias"
          />
        </div>
        <div>
          <span>
            <Icone name="user" size={15} />
            Usuário
          </span>
          <SeletorFiltro
            variant="staff"
            label="Usuário dos logs"
            value={usuario}
            options={usuarios}
            onChange={(valor) => {
              setUsuario(valor);
              setPagina(1);
            }}
          />
        </div>
        <div>
          <span>
            <Icone name="settings" size={15} />
            Ação
          </span>
          <SeletorFiltro
            variant="staff"
            label="Ação dos logs"
            value={acaoLocal}
            options={[
              'all',
              ...Array.from(new Set(itens.map((item) => acao(item)))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
            ].map((valor) => ({
              value: valor,
              label: valor === 'all' ? 'Todas' : valor,
            }))}
            onChange={(valor) => {
              setAcao(valor);
              setPagina(1);
            }}
          />
        </div>
        <label className="cfg-logs-search">
          <Icone name="search" size={16} />
          <input
            value={busca}
            onChange={(eventoRecebido) => {
              setBusca(eventoRecebido.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por usuário, ação ou descrição..."
            aria-label="Buscar logs"
          />
        </label>
      </div>
      <div className="cfg-logs-table-wrap">
        <table className="cfg-logs-table">
          <thead>
            <tr>
              <th aria-label="Tipo de atividade" />
              <th>{cabecalho('Data e hora', 'at')}</th>
              <th>{cabecalho('Pessoa', 'actor')}</th>
              <th>{cabecalho('Ação', 'action')}</th>
              <th>{cabecalho('Área', 'module')}</th>
              <th>O que aconteceu</th>
              <th>Contexto</th>
            </tr>
          </thead>
          <tbody>
            {!carregando &&
              !erro &&
              linhas.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className={`cfg-log-icon ${cor(item)}`}>
                      <Icone
                        name={
                          item.kind === 'clients'
                            ? 'users'
                            : item.kind === 'seguranca'
                              ? 'lock'
                          : /remov|exclu|arquiv/i.test(item.action)
                              ? 'trash'
                              : 'clipboard'
                        }
                        size={20}
                      />
                    </span>
                  </td>
                  <td className="cfg-log-date">
                    <b>{dia(item.at)}</b>
                    <span>{hora(item.at)}</span>
                  </td>
                  <td>
                    <div className="cfg-log-user">
                      <span>
                        <Icone name="user" size={18} />
                      </span>
                      <div>
                        <b>{item.actor}</b>
                        {item.actorRole && <small>{item.actorRole}</small>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`cfg-log-action ${cor(item)}`}>{acao(item)}</span>
                  </td>
                  <td>{item.module}</td>
                  <td className="cfg-log-description">
                    <b>{item.title}</b>
                    <span>{item.detail}</span>
                  </td>
                  <td className="cfg-log-context">
                    <div className="cfg-log-more">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-expanded={detalheAberto === item.id}
                        aria-label={`Mais dados técnicos da atividade ${item.id}`}
                        onClick={() => setDetalheAberto(item.id)}
                      >
                        <Icone name="info" size={15} />
                        Mais dados
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {carregando ? (
          <Skeleton tipo="tabela" />
        ) : erro ? (
          <div className="cfg-logs-empty">
            <p role="alert">{erro}</p>
            <button
              className="cfg-button"
              onClick={() => setTentarNovamente((valorAtual) => valorAtual + 1)}
            >
              Tentar novamente
            </button>
          </div>
        ) : !linhas.length ? (
          <div className="cfg-logs-empty">
            <Icone name="search" size={29} />
            <b>Nenhum registro encontrado</b>
            <p>Altere o período ou os filtros para consultar outras atividades.</p>
          </div>
        ) : null}
      </div>
      {itemDetalhe && (
        <CfgDialog
          className="cfg-log-detail-dialog"
          title="Detalhes da atividade"
          description={`${dia(itemDetalhe.at)} às ${hora(itemDetalhe.at)} · ${itemDetalhe.actor}`}
          icon="info"
          onClose={() => setDetalheAberto(null)}
        >
          <div className="cfg-log-detail-summary">
            <span className={`cfg-log-icon ${cor(itemDetalhe)}`}>
              <Icone name={itemDetalhe.kind === 'seguranca' ? 'lock' : 'clipboard'} size={20} />
            </span>
            <div>
              <b>{itemDetalhe.title}</b>
              <p>{itemDetalhe.detail}</p>
              <small>{itemDetalhe.module} · {itemDetalhe.actorRole || 'Função não registrada'}</small>
            </div>
          </div>
          <div className="cfg-log-detail-grid">
            <section className="cfg-log-browser-card">
              <NavegadorMarca userAgent={itemDetalhe.userAgent} />
              <div>
                <small>Navegador e dispositivo</small>
                <b>{nomeNavegador(itemDetalhe.userAgent)}</b>
                <span>{itemDetalhe.userAgent || 'Identificação do dispositivo não registrada.'}</span>
              </div>
            </section>
            <div className="cfg-log-detail-field"><Icone name="hash" size={16} /><div><small>ID da atividade</small><b>{itemDetalhe.id}</b></div></div>
            <div className="cfg-log-detail-field"><Icone name="file-lines" size={16} /><div><small>ID relacionado</small><b>{itemDetalhe.targetId || 'Não informado'}</b></div></div>
            <div className="cfg-log-detail-field"><Icone name="pin" size={16} /><div><small>Endereço IP</small><b>{itemDetalhe.ip || 'Não registrado'}</b></div></div>
            <div className="cfg-log-detail-field"><Icone name="activity" size={16} /><div><small>Referência técnica</small><b>{itemDetalhe.requestId || 'Não registrada'}</b></div></div>
          </div>
        </CfgDialog>
      )}
    </CfgDialog>
  );
}
