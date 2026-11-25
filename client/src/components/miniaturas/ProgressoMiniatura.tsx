import { useEffect, useState } from 'react';
import { nomesSituacao, type PedidoMiniatura } from '../../services/centralMiniaturas';
import { montarLogMiniatura } from '../../services/logMiniaturas';
const duracao = (ms: number) =>
  ms < 60_000
    ? `${(Math.max(0, ms) / 1000).toFixed(1)} s`
    : `${Math.floor(ms / 60_000)} min ${Math.floor((ms % 60_000) / 1000)} s`;
function IconeLog({ etapa }: { etapa: string }) {
  const busca = /pesquisa|fontes|busca/.test(etapa),
    foto = /referencia|foto/.test(etapa),
    erro = /erro|falhou|moderacao/.test(etapa);
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {busca ? (
        <>
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 6 6" />
        </>
      ) : foto ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="m3 16 5-5 5 5 3-3 5 5" />
          <circle cx="16" cy="8" r="1" />
        </>
      ) : erro ? (
        <>
          <path d="m12 3 10 18H2Z" />
          <path d="M12 9v5m0 3v1" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m7 12 3 3 7-7" />
        </>
      )}
    </svg>
  );
}
export default function ProgressoMiniatura({ pedido }: { pedido: PedidoMiniatura }) {
  const [agora, setAgora] = useState(Date.now),
    ativo = pedido.status === 'processando';
  const detalhado = !!pedido.pesquisa?.progresso?.length;
  useEffect(() => {
    if (!ativo || !detalhado) return;
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ativo, detalhado]);
  const eventos = montarLogMiniatura(pedido);
  const total = eventos.reduce(
    (s, e) =>
      s +
      (e.duracao_ms ??
        (ativo && !e.concluido_em && e.iniciado_em
          ? Math.max(0, agora - Date.parse(e.iniciado_em))
          : 0)),
    0,
  );
  const temTempo =
    detalhado &&
    (eventos.some((e) => e.duracao_ms !== undefined) ||
      (ativo && eventos.some((e) => e.iniciado_em && !e.concluido_em)));
  return (
    <section className="mini-progress-log" aria-label="Log da miniatura">
      <header>
        <h3>Log</h3>
        <span className={`mini-status ${pedido.status}`}>{nomesSituacao[pedido.status]}</span>
      </header>
      {temTempo && (
        <p className="mini-progress-total">
          Tempo registrado: <strong>{duracao(total)}</strong> · Tentativa {pedido.tentativas}
        </p>
      )}
      <ol>
        {eventos.map((evento, i) => (
          <li
            key={`${evento.iniciado_em || 'registro'}-${i}`}
            data-active={ativo && i === eventos.length - 1 && !evento.concluido_em}
          >
            <span className="mini-log-mark">
              <IconeLog etapa={evento.etapa} />
            </span>
            <div>
              <time dateTime={evento.iniciado_em}>
                {evento.iniciado_em
                  ? new Date(evento.iniciado_em).toLocaleTimeString('pt-BR')
                  : 'Horário não registrado'}
              </time>
              {evento.duracao_ms !== undefined && <span>{duracao(evento.duracao_ms)}</span>}
            </div>
            <strong>{evento.descricao}</strong>
            {evento.detalhes && <p>{evento.detalhes}</p>}
            {evento.fontes && (
              <ul className="mini-log-fontes">
                {evento.fontes.map((fonte) => (
                  <li key={fonte.url}>
                    <a href={fonte.url} target="_blank" rel="noreferrer">
                      {fonte.titulo}
                      <small>{new URL(fonte.url).hostname}</small>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
