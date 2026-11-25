import PopupErroMiniatura from '../components/miniaturas/PopupErroMiniatura';
import CartaoIndicador from '../components/CartaoIndicador';
import { SkeletonTabela } from '../components/SkeletonPagina';
import LoteMiniaturas from '../components/miniaturas/LoteMiniaturas';
import { useEffect, useState } from 'react';
import { Icone } from '../components/MenuAdmin';
import ModalPreviaModelo from '../components/ModalPreviaModelo';
import {
  listarMiniaturas,
  miniaturaEmAberto,
  nomesSituacao,
  requisitarMiniaturas,
  type ConfiguracaoMiniaturas,
  type PedidoMiniatura,
} from '../services/centralMiniaturas';
import '../components/miniaturas/miniaturas.css';
import { correspondeBusca } from '../utils/buscaAproximada';
import { useDadosVivos } from '../hooks/useDadosVivos';
export default function Miniaturas() {
  const [pedidos, setPedidos] = useState<PedidoMiniatura[]>([]);
  const [configuracao, setConfiguracao] = useState<ConfiguracaoMiniaturas | null>(null);
  const [selecionado, setSelecionado] = useState<PedidoMiniatura | null>();
  const [escopoNovo, setEscopoNovo] = useState('');
  const abrirNovo = () => {
    setEscopoNovo(`nova-miniatura-${crypto.randomUUID()}`);
    setSelecionado(null);
  };
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const atualizar = async () => {
    const resultado = await listarMiniaturas();
    setPedidos(resultado.pedidos);
    setConfiguracao(resultado.configuracao);
    setErro('');
  };
  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        const dados = await listarMiniaturas();
        if (ativo) {
          setPedidos(dados.pedidos);
          setConfiguracao(dados.configuracao);
        }
      } catch (falha) {
        if (ativo) setErro(falha instanceof Error ? falha.message : 'Falha ao carregar.');
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, []);
  useDadosVivos(async (valido) => {
    try {
      const dados = await listarMiniaturas();
      if (!valido()) return;
      setPedidos(dados.pedidos);
      setConfiguracao(dados.configuracao);
      setErro('');
    } catch (falha) {
      if (valido()) setErro(falha instanceof Error ? falha.message : 'Falha ao atualizar.');
    }
  });
  const abertos = pedidos.filter((pedido) => miniaturaEmAberto(pedido.status));
  const visiveis = abertos.filter(
    (pedido) =>
      (filtro === 'todos' ||
        pedido.status === filtro ||
        (filtro === 'preparo' && ['pendente', 'processando'].includes(pedido.status)) ||
        (filtro === 'atencao' && ['informacao', 'falhou'].includes(pedido.status))) &&
      correspondeBusca(
        busca,
        `${pedido.catalogo.modelo} ${pedido.catalogo.variante} ${pedido.catalogo.ano || ''}`,
      ),
  );
  return (
    <main className="mini-page">
      <header className="mini-page-title">
        <div>
          <span className="mini-eyebrow">CATÁLOGO INTELIGENTE</span>
          <h1>Miniaturas de motocicletas</h1>
          <p>Da referência à aprovação. Um padrão compartilhado para cada modelo.</p>
        </div>
        <button type="button" className="mini-primary" onClick={abrirNovo}>
          <Icone name="plus" size={18} /> Nova miniatura
        </button>
      </header>
      <div className="indicadores-grid mini-page-indicators" data-indicadores>
        {[
          {
            titulo: 'Prontas para revisar',
            valor: pedidos.filter((p) => p.status === 'revisao').length,
            icone: 'eye',
          },
          {
            titulo: 'Na fila e em preparo',
            valor: pedidos.filter((p) => ['pendente', 'processando'].includes(p.status)).length,
            icone: 'clock',
          },
          {
            titulo: 'Precisam de atenção',
            valor: pedidos.filter((p) => ['informacao', 'falhou'].includes(p.status)).length,
            icone: 'info',
          },
          {
            titulo: 'Tentativas hoje',
            valor: `${configuracao?.consumo || 0} / ${configuracao?.limite || '—'}`,
            icone: 'activity',
          },
        ].map((item) => (
          <CartaoIndicador
            key={item.titulo}
            titulo={item.titulo}
            valor={carregando ? '—' : item.valor}
            icone={item.icone}
            tom={
              item.icone === 'eye'
                ? 'green'
                : item.icone === 'info'
                  ? 'red'
                  : item.icone === 'clock'
                    ? 'amber'
                    : 'blue'
            }
            ativo={
              item.icone !== 'activity' &&
              filtro ===
                (item.icone === 'eye' ? 'revisao' : item.icone === 'clock' ? 'preparo' : 'atencao')
            }
            aoClicar={
              item.icone === 'activity'
                ? undefined
                : () => {
                    setFiltro(
                      item.icone === 'eye'
                        ? 'revisao'
                        : item.icone === 'clock'
                          ? 'preparo'
                          : 'atencao',
                    );
                  }
            }
            descricao={
              item.icone === 'eye'
                ? 'Aguardando sua aprovação'
                : item.icone === 'info'
                  ? 'Revise os pedidos sinalizados'
                  : item.icone === 'clock'
                    ? 'Processamento do catálogo'
                    : 'Uso da cota diária'
            }
          />
        ))}
      </div>
      {configuracao && !configuracao.geracao && (
        <div className="mini-feedback error">
          Geração aguardando credenciais do Cloudflare. Rascunhos, referências e revisão continuam
          disponíveis.
        </div>
      )}
      {configuracao?.retomaEm && (
        <div className="mini-feedback" role="status">
          Cota gratuita em pausa. A fila retoma após{' '}
          {new Date(configuracao.retomaEm).toLocaleString('pt-BR')}. As miniaturas aprovadas
          continuam disponíveis.
        </div>
      )}
      <nav className="mini-tabs" aria-label="Central de miniaturas">
        <button type="button" aria-current="page" onClick={() => setFiltro('todos')}>
          Central de trabalho
        </button>
        <button type="button" onClick={abrirNovo}>
          Estúdio de miniaturas
        </button>
      </nav>
      {erro && <PopupErroMiniatura mensagem={erro} aoFechar={() => setErro('')} />}
      <LoteMiniaturas pedidos={abertos} atualizar={atualizar} aoEditar={setSelecionado} />
      {selecionado !== undefined && (
        <ModalPreviaModelo
          key={selecionado?.id || 'nova-miniatura'}
          currentModel={selecionado?.catalogo.modelo || ''}
          motorcycleId={selecionado?.catalogo.moto_id || undefined}
          pedidoId={selecionado?.id}
          escopoRascunho={selecionado ? undefined : escopoNovo}
          onClose={() => {
            setSelecionado(undefined);
            void atualizar().catch((falha) => setErro(falha.message));
          }}
          onChanged={() => {
            void atualizar().catch((falha) => setErro(falha.message));
          }}
        />
      )}
      <section className="mini-card mini-workspace">
        <header>
          <div>
            <h2>Sua fila de miniaturas</h2>
            <p>O processamento continua ao sair da tela. A publicação depende da sua aprovação.</p>
          </div>
          <button
            type="button"
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              try {
                await requisitarMiniaturas(
                  '/api/admin/miniaturas/preparar-cadastradas',
                  'POST',
                  {},
                );
                await atualizar();
              } catch (falha) {
                setErro(falha instanceof Error ? falha.message : 'Falha ao preparar.');
              } finally {
                setOcupado(false);
              }
            }}
          >
            <Icone name="bike" size={17} />
            {ocupado ? 'Preparando…' : 'Preparar modelos cadastrados'}
          </button>
        </header>
        <div className="mini-filters">
          <label>
            <span>Buscar modelo</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Marca, modelo ou versão"
            />
          </label>
          <label>
            <span>Situação</span>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="preparo">Na fila e em preparo</option>
              <option value="atencao">Precisam de atenção</option>
              <option value="todos">Todas em aberto</option>
              {Object.entries(nomesSituacao)
                .filter(([valor]) => miniaturaEmAberto(valor))
                .map(([valor, nome]) => (
                  <option value={valor} key={valor}>
                    {nome}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {carregando ? (
          <div role="status" aria-label="Carregando miniaturas">
            <SkeletonTabela colunas={5} />
          </div>
        ) : !visiveis.length ? (
          <div className="mini-empty">
            <Icone name="bike" size={48} />
            <h3>Nenhuma solicitação em aberto</h3>
            <p>As miniaturas foram concluídas ou não há pedidos neste filtro.</p>
          </div>
        ) : (
          <div className="mini-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Modelo e versão</th>
                  <th>Situação</th>
                  <th>Tentativas</th>
                  <th>Atualização</th>
                  <th>
                    <span className="mini-sr">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((pedido) => (
                  <tr key={pedido.id}>
                    <td>
                      <strong>{pedido.catalogo.modelo}</strong>
                      <small>
                        {[
                          pedido.catalogo.variante,
                          pedido.catalogo.ano,
                          pedido.catalogo.moto_id
                            ? 'Exclusiva desta moto'
                            : 'Catálogo compartilhado',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </td>
                    <td>
                      <span className={`mini-status ${pedido.status}`}>
                        {nomesSituacao[pedido.status]}
                      </span>
                    </td>
                    <td>{pedido.tentativas}/6</td>
                    <td>
                      {new Date(pedido.atualizado_em).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Editar miniatura de ${pedido.catalogo.modelo}`}
                        onClick={() => {
                          setSelecionado(pedido);
                        }}
                      >
                        <Icone name="pencil" size={16} /> Corrigir / conferir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
