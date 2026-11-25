import ComparadorMiniaturas from './ComparadorMiniaturas';
import ProgressoMiniatura from './ProgressoMiniatura';
import { motivoBloqueioPublicacao, type PedidoMiniatura } from '../../services/centralMiniaturas';

import { itensConferencia, type ConferenciasMiniatura } from '../../services/conferenciaMiniatura';

type Props = {
  pedido: PedidoMiniatura;
  ocupado: boolean;
  conferencias: ConferenciasMiniatura;
  aoConferir: (valor: ConferenciasMiniatura) => void;
  indice: number;
  aoSelecionar: (indice: number) => void;
  correcao: string;
  aoCorrigir: (texto: string) => void;
  aoEditar: () => void;
  aoAprovar: () => void;
  aoRestaurar: (id: string) => void;
  imagemCarregada: boolean;
  aoCarregarImagem: (carregada: boolean) => void;
};
export default function RevisaoMiniatura({
  pedido,
  ocupado,
  conferencias,
  aoConferir,
  indice,
  aoSelecionar,
  correcao,
  aoCorrigir,
  aoEditar,
  aoAprovar,
  aoRestaurar,
  imagemCarregada,
  aoCarregarImagem,
}: Props) {
  const revisao = pedido.status === 'revisao';
  const aprovada = pedido.status === 'aprovada';
  const bloqueio = motivoBloqueioPublicacao(pedido);
  const tudoConferido = itensConferencia.every(([chave]) => conferencias[chave]);
  const referencia = pedido.referencias[indice]?.imagem;
  return (
    <section className="mini-studio-result mini-review" aria-label="Conferência e publicação">
      <header className="mini-review-heading">
        <div>
          <p className="mini-review-eyebrow">CONFERIR E PUBLICAR</p>
          <h2>{pedido.catalogo.modelo}</h2>
          <p>
            {[pedido.catalogo.ano, pedido.catalogo.variante].filter(Boolean).join(' · ') ||
              'Confira os detalhes antes de disponibilizar a miniatura.'}
          </p>
        </div>
        <span className={`mini-review-status ${aprovada ? 'is-approved' : ''}`}>
          {aprovada ? 'Publicada' : revisao ? 'Aguardando sua conferência' : 'Geração em andamento'}
        </span>
      </header>
      <div className="mini-review-layout">
        <div className="mini-review-art">
          <figure className="mini-studio-full-result">
            <img
              key={pedido.candidato || pedido.id}
              src={pedido.imagem || ''}
              alt="Miniatura gerada completa para conferência"
              onLoad={() => aoCarregarImagem(true)}
              onError={() => aoCarregarImagem(false)}
            />
            <figcaption>Resultado gerado · fundo quadriculado indica transparência</figcaption>
          </figure>
          <section className="mini-review-reference-section" aria-label="Referências utilizadas">
            <div className="mini-review-section-heading">
              <h3>Referências utilizadas</h3>
              <span>{pedido.referencias.length} fotos</span>
            </div>
            {pedido.referencias.length ? (
              <div
                className="mini-review-references"
                aria-label="Escolha uma referência para comparar"
              >
                {pedido.referencias.map((ref, i) => (
                  <button
                    key={ref.caminho}
                    type="button"
                    aria-pressed={indice === i}
                    onClick={() => aoSelecionar(i)}
                  >
                    <img src={ref.imagem} alt={`Foto de referência ${i + 1}`} />
                    <span>Foto {i + 1}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mini-review-muted">
                Nenhuma foto foi anexada. Adicione uma referência se os detalhes estiverem
                incorretos.
              </p>
            )}
            {referencia && pedido.imagem && (
              <ComparadorMiniaturas referencia={referencia} candidata={pedido.imagem} />
            )}
          </section>
          <details className="mini-review-technical">
            <summary>Conferência da IA e histórico</summary>
            <p>
              {pedido.verificacao?.automatica
                ? 'Análise automática disponível. Sua conferência visual continua necessária.'
                : 'Análise automática indisponível ou inconclusiva. Confira os quatro itens ao lado.'}
            </p>
            {(pedido.verificacao?.problemas || []).map((problema) => (
              <p key={problema}>{problema}</p>
            ))}
            <ProgressoMiniatura pedido={pedido} />
            {pedido.atual && (
              <figure className="mini-current">
                <figcaption>Miniatura publicada atualmente</figcaption>
                <img src={pedido.atual} alt="Miniatura publicada atualmente" />
              </figure>
            )}
            {!!pedido.historico?.length && (
              <div className="mini-history">
                {pedido.historico.map((item) => (
                  <div key={item.id}>
                    <span>{new Date(item.criado_em).toLocaleString('pt-BR')}</span>
                    <button
                      type="button"
                      disabled={ocupado || item.id === pedido.catalogo.publicada}
                      onClick={() => aoRestaurar(item.id)}
                    >
                      Restaurar publicação
                    </button>
                  </div>
                ))}
              </div>
            )}
          </details>
        </div>
        <aside className="mini-review-decision" aria-label="Publicar miniatura">
          <div className="mini-review-publish">
            <h3>{aprovada ? 'Miniatura publicada' : 'Está tudo certo com a imagem?'}</h3>
            <p>
              {aprovada
                ? 'Esta miniatura já está disponível no destino escolhido.'
                : 'Olhe a imagem com calma. Confira os pontos abaixo e aprove.'}
            </p>
            {bloqueio && (
              <div className="mini-review-warning" role="status">
                <strong>A conferência automática apontou um possível problema</strong>
                <p>{bloqueio}</p>
                <p>Se você olhou e a imagem está certa, pode aprovar mesmo assim.</p>
                <button type="button" disabled={ocupado} onClick={aoEditar}>
                  Gerar outra versão
                </button>
              </div>
            )}
            {!revisao && !aprovada && (
              <div className="mini-review-warning" role="status">
                Aguarde a geração terminar. A imagem anterior não pode ser aprovada durante o
                processamento.
              </div>
            )}
            {revisao && (
              <>
                <ul className="mini-review-checks-list">
                  {itensConferencia.map(([chave, titulo]) => (
                    <li key={chave}>{titulo}</li>
                  ))}
                </ul>
                <label className="mini-confirm mini-confirm-unico">
                  <input
                    type="checkbox"
                    checked={tudoConferido}
                    disabled={ocupado}
                    onChange={(e) =>
                      aoConferir(
                        Object.fromEntries(
                          itensConferencia.map(([chave]) => [chave, e.target.checked]),
                        ) as ConferenciasMiniatura,
                      )
                    }
                  />
                  <span>
                    <strong>Conferi a imagem: está tudo certo</strong>
                    <small>Marque para liberar o botão de aprovar.</small>
                  </span>
                </label>
                <p className="mini-review-readiness" aria-live="polite">
                  {!imagemCarregada
                    ? 'Aguarde a imagem carregar.'
                    : tudoConferido
                      ? 'Pronto. Ao aprovar, ela passa a valer para todas as motos deste modelo.'
                      : 'Marque a confirmação acima para aprovar.'}
                </p>
                <button
                  type="button"
                  className="mini-primary mini-approve"
                  disabled={ocupado || !tudoConferido || !imagemCarregada}
                  onClick={aoAprovar}
                >
                  {ocupado ? 'Salvando…' : 'Aprovar e usar esta miniatura'}
                </button>
                <p className="mini-review-muted">A publicação só acontece após sua aprovação.</p>
              </>
            )}
          </div>
          {!aprovada && (
            <div className="mini-review-adjust">
              <h3>Quer melhorar o resultado?</h3>
              <p>Volte para incluir fotos ou descreva um ajuste e use “Gerar novamente”.</p>
              <button type="button" disabled={ocupado || !revisao} onClick={aoEditar}>
                Editar dados e referências
              </button>
              <label>
                Correção para a próxima tentativa <span>(opcional)</span>
                <textarea
                  value={correcao}
                  disabled={ocupado || !revisao}
                  onChange={(e) => aoCorrigir(e.target.value)}
                  rows={3}
                  maxLength={650}
                  placeholder="Ex.: corrigir o farol ou preservar os adesivos originais."
                />
              </label>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
