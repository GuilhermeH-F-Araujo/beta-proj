import PopupErroMiniatura from './PopupErroMiniatura';
import { useEffect, useState } from 'react';
import { useEstadoRascunho } from '../../hooks/useEstadoRascunho';
import {
  candidataPublicavel,
  requisitarMiniaturas,
  type PedidoMiniatura,
} from '../../services/centralMiniaturas';
import { Icone } from '../MenuAdmin';
export default function LoteMiniaturas({
  pedidos,
  atualizar,
  aoEditar,
}: {
  pedidos: PedidoMiniatura[];
  atualizar: () => Promise<void>;
  aoEditar?: (pedido: PedidoMiniatura) => void;
}) {
  const [modelos, setModelos] = useEstadoRascunho('lote-miniaturas', 'modelos', '');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  // Ids aguardando confirmacao de remocao (um cartao ou a selecao inteira).
  const [removendo, setRemovendo] = useState<string[] | null>(null);
  const lista = [
    ...new Set(
      modelos
        .split(/\r?\n/)
        .map((modelo) => modelo.trim())
        .filter(Boolean),
    ),
  ];
  const prontas = pedidos
    .filter((pedido) => pedido.status === 'revisao' && pedido.imagem)
    .slice(0, 12);
  const candidatas = prontas
    .map(
      (pedido) =>
        `${pedido.id}:${pedido.candidato || ''}:${pedido.catalogo.revisao}:${candidataPublicavel(pedido)}`,
    )
    .join('|');
  useEffect(() => {
    setSelecionados([]);
  }, [candidatas]);
  async function remover(ids: string[]) {
    setOcupado(true);
    setErro('');
    setAviso('');
    let removidas = 0;
    for (const id of ids) {
      try {
        await requisitarMiniaturas(`/api/admin/miniaturas/${id}/descartar`, 'POST', {});
        removidas++;
      } catch {
        setErro('Algumas miniaturas já tinham mudado e não foram removidas. Atualize a tela.');
      }
    }
    setRemovendo(null);
    setSelecionados((atual) => atual.filter((id) => !ids.includes(id)));
    if (removidas)
      setAviso(removidas === 1 ? 'Miniatura removida.' : `${removidas} miniaturas removidas.`);
    try {
      await atualizar();
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="mini-batch">
      <details className="mini-card">
        <summary>
          Gerar vários modelos de uma vez <span>Até 100 modelos</span>
        </summary>
        <p>
          Um modelo por linha. A IA cuida da pesquisa, geração e conferência. As imagens já
          aprovadas são reaproveitadas.
        </p>
        <label>
          Modelos
          <textarea
            value={modelos}
            onChange={(e) => setModelos(e.target.value)}
            rows={5}
            maxLength={11000}
            placeholder={'Honda CG 150 Titan\nYamaha Fazer 250\nBMW R 1200 GS'}
          />
        </label>
        <div className="mini-inline">
          <span>{lista.length} de 100 modelos</span>
          <button
            type="button"
            className="mini-primary"
            disabled={ocupado || !lista.length || lista.length > 100}
            onClick={async () => {
              setOcupado(true);
              setErro('');
              try {
                const resultado = await requisitarMiniaturas<{ pedidos: { status: string }[] }>(
                  '/api/admin/miniaturas/lote',
                  'POST',
                  { modelos: lista },
                );
                const reutilizadas = resultado.pedidos.filter(
                  (item) => item.status === 'pronta',
                ).length;
                setAviso(
                  `${resultado.pedidos.length} modelos recebidos. ${reutilizadas} já possuem miniatura aprovada. Você pode continuar trabalhando.`,
                );
                setModelos('');
                await atualizar();
              } catch (falha) {
                setErro(
                  falha instanceof Error
                    ? falha.message
                    : 'Não foi possível colocar o lote na fila.',
                );
              } finally {
                setOcupado(false);
              }
            }}
          >
            <Icone name="plus" size={18} />
            {ocupado ? 'Preparando…' : 'Colocar modelos na fila'}
          </button>
        </div>
      </details>
      {!!prontas.length && (
        <section className="mini-card">
          <header>
            <div>
              <h2>Prontas para sua aprovação</h2>
              <p>Confira as motos, selecione as corretas e aprove ou remova de uma vez.</p>
            </div>
            <div className="mini-ready-actions">
              <button
                type="button"
                className="mini-ready-remove-selected"
                disabled={ocupado || !selecionados.length}
                onClick={() => setRemovendo(selecionados)}
              >
                <Icone name="trash" size={16} />
                Remover selecionadas ({selecionados.length})
              </button>
              <button
                type="button"
                className="mini-primary"
                disabled={ocupado || !selecionados.length}
                onClick={async () => {
                  setOcupado(true);
                  setErro('');
                  let aprovadas = 0;
                  try {
                    for (const pedido of prontas.filter(
                      (item) => selecionados.includes(item.id) && candidataPublicavel(item),
                    )) {
                      try {
                        await requisitarMiniaturas(
                          `/api/admin/miniaturas/${pedido.id}/aprovar`,
                          'POST',
                          {
                            revisao: pedido.catalogo.revisao,
                            candidato: pedido.candidato,
                            confirmouIdentidade: true,
                            confirmouDireita: true,
                            confirmouInteira: true,
                            confirmouUso: true,
                          },
                        );
                        aprovadas++;
                      } catch {
                        setErro(
                          'Algumas imagens mudaram ou precisam de correção. Elas continuam aguardando revisão.',
                        );
                      }
                    }
                    setSelecionados([]);
                    setAviso(`${aprovadas} miniaturas aprovadas.`);
                    window.dispatchEvent(new Event('miniaturas-publicadas'));
                    await atualizar();
                  } catch {
                    setErro(
                      'As aprovações foram enviadas. Não foi possível atualizar a lista agora.',
                    );
                  } finally {
                    setOcupado(false);
                  }
                }}
              >
                Aprovar selecionadas ({selecionados.length})
              </button>
            </div>
          </header>
          <div className="mini-ready-grid">
            {prontas.map((pedido) => (
              <article
                key={pedido.id}
                className={`mini-ready ${selecionados.includes(pedido.id) ? 'selected' : ''}`}
              >
                <label className="mini-ready-check">
                  <span className="mini-sr">Selecionar {pedido.catalogo.modelo}</span>
                  <input
                    type="checkbox"
                    checked={selecionados.includes(pedido.id)}
                    disabled={ocupado}
                    onChange={(e) =>
                      setSelecionados((atual) =>
                        e.target.checked
                          ? [...atual, pedido.id]
                          : atual.filter((id) => id !== pedido.id),
                      )
                    }
                  />
                </label>
                {aoEditar && (
                  <button
                    className="mini-ready-edit"
                    type="button"
                    disabled={ocupado}
                    aria-label={`Corrigir miniatura de ${pedido.catalogo.modelo}`}
                    title="Corrigir ou conferir no estúdio"
                    onClick={() => aoEditar(pedido)}
                  >
                    <Icone name="pencil" size={17} />
                  </button>
                )}
                <button
                  className={`mini-ready-remove${aoEditar ? '' : ' sozinho'}`}
                  type="button"
                  disabled={ocupado}
                  aria-label={`Remover miniatura de ${pedido.catalogo.modelo}`}
                  title="Remover esta miniatura"
                  onClick={() => setRemovendo([pedido.id])}
                >
                  <Icone name="trash" size={16} />
                </button>
                <img src={pedido.imagem || ''} alt={`Prévia de ${pedido.catalogo.modelo}`} />
                <strong>
                  {pedido.catalogo.modelo} {pedido.catalogo.variante}
                </strong>
                <small>{pedido.catalogo.ano || 'Padrão do modelo'}</small>
                {!candidataPublicavel(pedido) && (
                  <small className="mini-ready-warning">Precisa de correção</small>
                )}
              </article>
            ))}
          </div>
          <p className="mini-help">
            Ao aprovar, você confirma que as motos selecionadas correspondem aos modelos, estão
            inteiras e com a frente para a direita.
          </p>
        </section>
      )}
      {removendo && (
        <div
          className="mini-remove-backdrop"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget && !ocupado) setRemovendo(null);
          }}
        >
          <div
            className="mini-remove-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mini-remove-title"
          >
            <span className="mini-remove-icon" aria-hidden="true">
              <Icone name="trash" size={20} />
            </span>
            <h3 id="mini-remove-title">
              {removendo.length === 1
                ? `Remover a miniatura de ${prontas.find((item) => item.id === removendo[0])?.catalogo.modelo ?? 'este modelo'}?`
                : `Remover ${removendo.length} miniaturas?`}
            </h3>
            <p>
              A imagem gerada é apagada e o pedido sai da fila. Nada que já esteja publicado é
              alterado. Se precisar, gere o modelo de novo depois.
            </p>
            <div className="mini-remove-buttons">
              <button type="button" disabled={ocupado} onClick={() => setRemovendo(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="danger"
                disabled={ocupado}
                autoFocus
                onClick={() => void remover(removendo)}
              >
                {ocupado ? 'Removendo…' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}
      {aviso && (
        <p role="status" className="mini-feedback success">
          {aviso}
        </p>
      )}
      {erro && <PopupErroMiniatura mensagem={erro} aoFechar={() => setErro('')} />}
    </div>
  );
}
