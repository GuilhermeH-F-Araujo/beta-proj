import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ConteudoCarregando from '../components/ConteudoCarregando';
import SkeletonPagina from '../components/SkeletonPagina';
import Skeleton from '../components/Skeleton';
import { Icone } from '../components/MenuAdmin';
import ModalAcoesOrdem from '../components/ModalAcoesOrdem';
import ModalPreviaModelo from '../components/ModalPreviaModelo';
import { useDadosVivos } from '../hooks/useDadosVivos';
import {
  ErroRequisicaoApi,
  buscarDetalhesOrdem,
  buscarFotoCliente,
  buscarHistoricoObservacoes,
  type DetalhesOrdem as Details,
  type RegistroHistoricoObservacao,
} from '../services/apiAutenticacao';
import { useMiniaturaMotocicleta } from '../services/miniaturasMotocicletas';
import { rotulosSituacaoOrdem } from '../services/statusOrdem';
import './detalhes-ordem.css';
import './ordens-servico.css';

const moeda = (numero: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
const dadosLocal = (valor: string | null) =>
  valor
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(valor))
    : '—';
const etapas = [
  { title: 'Em aberto', icon: 'clipboard' },
  { title: 'Aguardando peça', icon: 'package' },
  { title: 'Em andamento', icon: 'wrench' },
  { title: 'Pronta', icon: 'check' },
  { title: 'Finalizada', icon: 'check' },
  { title: 'Cancelada', icon: 'close' },
];

export default function DetalhesOrdem() {
  const navegar = useNavigate();
  const { id } = useParams();
  const idOrdem = Number(id);
  const [dados, setDados] = useState<Details | null>(null);
  const [erro, setErro] = useState('');
  const [avisoTemporario, setAvisoTemporario] = useState('');
  const [editando, setEditando] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [historicoCarregando, setHistoricoCarregando] = useState(false);
  const [historicoErro, setHistoricoErro] = useState('');
  const [observacaoHistorico, setObservacaoHistorico] = useState<RegistroHistoricoObservacao[]>([]);
  const [correctingImagem, setCorrectingImagem] = useState(false);
  const [revisaoImagem, setImagemRevisao] = useState(0);
  const [falhouMotoImagem, setFalhouMotoImagem] = useState('');
  const [clienteFotoUrl, setClienteFotoUrl] = useState('');
  const motocicletaMiniatura = useMiniaturaMotocicleta(
    idOrdem,
    dados?.motorcycle.model,
    dados?.motorcycle.color,
    revisaoImagem,
  );
  const imagemMoto =
    motocicletaMiniatura.url !== falhouMotoImagem ? motocicletaMiniatura.url : null;
  const iniciaisCliente = (dados?.client.name ?? 'Cliente')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palavra) => palavra.charAt(0))
    .join('')
    .toUpperCase();

  useEffect(() => {
    if (!dados?.client.photo) {
      setClienteFotoUrl('');
      return;
    }
    if (/^https:\/\//i.test(dados.client.photo)) {
      setClienteFotoUrl(dados.client.photo);
      return;
    }
    let ativo = true;
    let url = '';
    void buscarFotoCliente(idOrdem)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (ativo) setClienteFotoUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {
        if (ativo) setClienteFotoUrl('');
      });
    return () => {
      ativo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [dados?.client.photo, idOrdem]);

  useEffect(() => {
    if (!Number.isSafeInteger(idOrdem) || idOrdem < 1) {
      setErro('Número da OS inválido.');
      return;
    }
    let ativo = true;
    buscarDetalhesOrdem(idOrdem)
      .then((detalhes) => {
        if (ativo) {
          setDados(detalhes);
          setErro('');
        }
      })
      .catch((erroCapturado) => {
        if (!ativo) return;
        if (
          erroCapturado instanceof ErroRequisicaoApi &&
          (erroCapturado.situacao === 401 || erroCapturado.situacao === 403)
        )
          navegar('/login', { replace: true });
        else
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível carregar a OS.',
          );
      });
    return () => {
      ativo = false;
    };
  }, [idOrdem, navegar]);
  useDadosVivos(
    async (valido) => {
      try {
        const resultado = await buscarDetalhesOrdem(idOrdem);
        if (valido()) {
          setDados(resultado);
          setErro('');
        }
      } catch (erroCapturado) {
        if (valido())
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível atualizar a OS.',
          );
      }
    },
    !!dados,
    String(idOrdem),
  );
  async function abertoObservacaoHistorico() {
    setHistoricoAberto(true);
    setHistoricoCarregando(true);
    setHistoricoErro('');
    try {
      setObservacaoHistorico((await buscarHistoricoObservacoes(idOrdem)).entries);
    } catch (erroCapturado) {
      setHistoricoErro(
        erroCapturado instanceof Error ? erroCapturado.message : 'Falha ao carregar histórico.',
      );
    } finally {
      setHistoricoCarregando(false);
    }
  }
  function atualizarDetalhes() {
    void buscarDetalhesOrdem(idOrdem)
      .then((detalhes) => {
        setDados(detalhes);
        setErro('');
      })
      .catch((erroCapturado) =>
        setAvisoTemporario(
          erroCapturado instanceof Error
            ? erroCapturado.message
            : 'Não foi possível atualizar a OS.',
        ),
      );
  }
  const etapaIndice =
    dados?.status === 'aguardando'
      ? 0
      : dados?.status === 'aguardando peça'
        ? 1
        : dados?.status === 'em andamento'
          ? 2
          : dados?.status === 'pronto'
            ? 3
            : dados?.status === 'entregue'
              ? 4
              : 5;
  const valorLocal = dados ? (dados.total ?? dados.serviceTotal + dados.partsTotal) : 0;
  const eventos = dados
    ? [
        ...dados.movements.map((item) => ({
          title:
            item.action === 'edicao'
              ? 'Informações corrigidas'
              : item.after === 'cancelada'
                ? 'OS cancelada'
                : `Status alterado para ${rotulosSituacaoOrdem[item.after!] ?? item.after}`,
          body:
            item.action === 'edicao'
              ? `Dados corrigidos por ${item.actor}`
              : `${rotulosSituacaoOrdem[item.before!] ?? item.before} → ${rotulosSituacaoOrdem[item.after!] ?? item.after} · ${item.actor}`,
          at: item.at,
          color: item.after === 'cancelada' ? 'red' : item.action === 'edicao' ? 'orange' : 'green',
        })),
        { title: 'OS criada', body: 'Ordem de serviço registrada', at: dados.entry, color: 'blue' },
      ].filter((item) => item.at)
    : [];

  return (
    <div className="orders-viewport details-viewport">
      <div className="orders-main">
        <main className="details-scroll">
          <ConteudoCarregando carregando={!dados && !erro}>
            {erro ? (
              <div className="details-error">
                <p>{erro}</p>
                <button onClick={() => navegar('/ordens-de-servico')}>Voltar à lista</button>
              </div>
            ) : !dados ? (
              <SkeletonPagina caminho={`/ordens-de-servico/${id}`} />
            ) : (
              <div className="details-body">
                <button
                  type="button"
                  className="detail-return"
                  onClick={() => navegar('/ordens-de-servico')}
                >
                  <Icone name="left" size={14} /> Voltar às ordens
                </button>
                <div className="details-title-row">
                  <div>
                    <h1>Detalhes da Ordem de Serviço</h1>
                    <span className="details-number">OS #{dados.id}</span>
                  </div>
                  <div className="details-title-actions">
                    <button
                      className="white-btn"
                      onClick={() => navegar(`/ordens-de-servico/${dados.id}/historico`)}
                    >
                      <Icone name="clock" size={14} /> Histórico
                    </button>
                    <button className="red-btn" onClick={() => setEditando(true)}>
                      <Icone name="pencil" size={14} /> Editar
                    </button>
                  </div>
                </div>
                <section className="details-summary" aria-label="Resumo da ordem">
                  <div>
                    <span className={`summary-dot status-${dados.status.replaceAll(' ', '-')}`} />
                    <span>
                      <small>STATUS ATUAL</small>
                      <b>{rotulosSituacaoOrdem[dados.status]}</b>
                    </span>
                  </div>
                  <div>
                    <Icone name="calendar" size={18} />
                    <span>
                      <small>DATA DE ABERTURA</small>
                      <b>{dadosLocal(dados.entry)}</b>
                    </span>
                  </div>
                  <div>
                    <Icone name="calendar" size={18} />
                    <span>
                      <small>PREVISÃO DE ENTREGA</small>
                      <b>{dadosLocal(dados.forecast)}</b>
                    </span>
                  </div>
                  <div>
                    <Icone name="clock" size={18} />
                    <span>
                      <small>ÚLTIMA ATUALIZAÇÃO</small>
                      <b>{dadosLocal(dados.lastUpdated)}</b>
                    </span>
                  </div>
                  <div>
                    <span className="mechanic-avatar">{dados.mechanic.charAt(0)}</span>
                    <span>
                      <small>RESPONSÁVEL TÉCNICO</small>
                      <b>{dados.mechanic}</b>
                    </span>
                  </div>
                </section>
                <section className="details-panel details-progress">
                  <h2>
                    <Icone name="activity" size={14} /> Andamento da Ordem
                  </h2>
                  <div className={`progress-track progress-${dados.status.replaceAll(' ', '-')}`}>
                    {etapas.map((etapa, indice) => (
                      <div
                        className={`progress-stage${(dados.status === 'cancelada' ? indice === 0 || indice === 5 : indice <= etapaIndice && indice !== 5) ? ' reached' : ''}${indice === etapaIndice ? ' current' : ''}`}
                        key={etapa.title}
                      >
                        <div className="progress-circle">
                          <Icone name={etapa.icon} size={18} />
                        </div>
                        <b>{etapa.title}</b>
                        <small>
                          {indice === 0
                            ? dadosLocal(dados.entry)
                            : (indice === 4 || indice === 5) && dados.exit
                              ? dadosLocal(dados.exit)
                              : '—'}
                        </small>
                      </div>
                    ))}
                  </div>
                  {dados.status === 'cancelada' && (
                    <div className="progress-cancellation-reason" role="note">
                      <Icone name="info" size={14} />
                      <span>
                        <b>Motivo do cancelamento</b>
                        {dados.cancellationReason || 'Motivo não registrado nesta OS antiga.'}
                      </span>
                    </div>
                  )}
                </section>
                <div className="details-grid-three">
                  <section className="details-panel">
                    <h2>
                      <span className="details-section-icon icon-user" aria-hidden="true" /> Cliente
                    </h2>
                    <div className="details-client">
                      <div className="details-client-avatar">
                        {clienteFotoUrl ? (
                          <img
                            src={clienteFotoUrl}
                            alt={`Foto de ${dados.client.name}`}
                            onError={() => setClienteFotoUrl('')}
                          />
                        ) : (
                          <span aria-label="Foto não cadastrada">{iniciaisCliente}</span>
                        )}
                      </div>
                      <div>
                        <strong className="details-main-text">{dados.client.name}</strong>
                        <p>
                          <Icone name="phone" size={14} />
                          {dados.client.phone || 'Telefone não informado'}
                        </p>
                        <p>
                          <Icone name="mail" size={14} />
                          {dados.client.email || 'E-mail não informado'}
                        </p>
                        <p>
                          <Icone name="pin" size={14} />
                          Endereço não informado
                        </p>
                      </div>
                    </div>
                  </section>
                  <section className="details-panel">
                    <h2>
                      <Icone name="bike" size={14} /> Motocicleta
                    </h2>
                    <div className="details-bike">
                      <div className="bike-image">
                        {imagemMoto ? (
                          <img
                            src={imagemMoto}
                            alt={`Miniatura ilustrativa de ${dados.motorcycle.model} na cor ${dados.motorcycle.color || 'padrão'}`}
                            onError={() => setFalhouMotoImagem(imagemMoto)}
                          />
                        ) : (
                          <Icone name="bike" size={35} />
                        )}
                      </div>
                      <div>
                        <strong className="details-main-text">{dados.motorcycle.model}</strong>
                        <p>Placa: {dados.motorcycle.plate || '—'}</p>
                        <p>Ano: {dados.motorcycle.year || '—'}</p>
                        <p>Cor: {dados.motorcycle.color || '—'}</p>
                        <p>KM de entrada: {dados.motorcycle.kmEntry ?? '—'}</p>
                      </div>
                    </div>
                    {(motocicletaMiniatura.origin === 'catalog' ||
                      motocicletaMiniatura.origin === 'generated') && (
                      <small className="model-credit">
                        Miniatura ilustrativa · cor {dados.motorcycle.color || 'padrão'}
                      </small>
                    )}
                    {motocicletaMiniatura.loading && !motocicletaMiniatura.error && (
                      <small className="model-credit">Preparando miniatura…</small>
                    )}
                    {motocicletaMiniatura.error && (
                      <small className="model-credit error" role="status">
                        {motocicletaMiniatura.error}
                      </small>
                    )}
                    <button
                      className="model-correction-link"
                      onClick={() => setCorrectingImagem(true)}
                    >
                      <Icone name="pencil" size={12} /> Corrigir miniatura
                    </button>
                  </section>
                  <section className="details-panel finance-panel">
                    <h2>
                      <span className="details-section-icon icon-dollar" aria-hidden="true" />{' '}
                      Resumo Financeiro
                    </h2>
                    <p>
                      <span>Total dos Serviços</span>
                      <b>{moeda(dados.serviceTotal)}</b>
                    </p>
                    <p>
                      <span>Total das Peças</span>
                      <b>{moeda(dados.partsTotal)}</b>
                    </p>
                    <div className="finance-total">
                      <b>Valor Final</b>
                      <strong>{moeda(valorLocal)}</strong>
                    </div>
                    <small>Pagamento: {dados.paymentStatus === 'pago' ? 'Pago' : 'Pendente'}</small>
                  </section>
                </div>
                <div className="details-grid-two">
                  <section className="details-panel details-table">
                    <h2>
                      <span className="details-section-icon icon-wrench" aria-hidden="true" />{' '}
                      Serviços Registrados
                    </h2>
                    <table>
                      <thead>
                        <tr>
                          <th>SERVIÇO</th>
                          <th>DESCRIÇÃO</th>
                          <th>VALOR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.services.map((servico, indiceLocal) => (
                          <tr key={indiceLocal}>
                            <td>{servico.description}</td>
                            <td>{servico.description}</td>
                            <td>{moeda(servico.price)}</td>
                          </tr>
                        ))}
                        {!dados.services.length && (
                          <tr>
                            <td colSpan={3}>Nenhum serviço registrado.</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2}>Total dos Serviços</td>
                          <td>{moeda(dados.serviceTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </section>
                  <section className="details-panel details-table">
                    <h2>
                      <Icone name="package" size={14} /> Peças Utilizadas
                    </h2>
                    <table>
                      <thead>
                        <tr>
                          <th>PEÇA</th>
                          <th>QUANTIDADE</th>
                          <th>VALOR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.parts.map((parte, indiceLocal) => (
                          <tr key={indiceLocal}>
                            <td>{parte.name}</td>
                            <td>{parte.quantity}</td>
                            <td>{moeda(parte.quantity * parte.unitPrice)}</td>
                          </tr>
                        ))}
                        {!dados.parts.length && (
                          <tr>
                            <td colSpan={3}>Nenhuma peça registrada.</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={2}>Total das Peças</td>
                          <td>{moeda(dados.partsTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </section>
                </div>
                <div className="details-grid-two">
                  <section className="details-panel">
                    <h2>
                      <span className="details-section-icon icon-camera" aria-hidden="true" /> Fotos
                      da Entrada
                    </h2>
                    {dados.photos.length ? (
                      <div className="entry-photos">
                        {dados.photos.map((foto, indiceLocal) => (
                          <a
                            key={foto.id}
                            href={foto.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Abrir foto ${indiceLocal + 1} da OS #${dados.id}`}
                          >
                            <img
                              src={foto.url}
                              alt={`Foto de entrada ${indiceLocal + 1} da OS #${dados.id}`}
                              loading="lazy"
                            />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="details-empty">Nenhuma foto de entrada cadastrada nesta OS.</p>
                    )}
                  </section>
                  <section className="details-panel">
                    <h2>
                      <span className="details-section-icon icon-clock" aria-hidden="true" />{' '}
                      Últimas Movimentações
                    </h2>
                    <div className="details-activity">
                      {eventos.map((item, indiceLocal) => (
                        <div key={indiceLocal}>
                          <i className={item.color} />
                          <span>
                            <b>{item.title}</b>
                            <small>{item.body}</small>
                          </span>
                          <time>{dadosLocal(item.at)}</time>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <section className="details-panel observations">
                  <div className="observations-heading">
                    <h2>
                      <span className="details-section-icon icon-file" aria-hidden="true" />{' '}
                      Observação atual
                    </h2>
                    <button type="button" onClick={() => void abertoObservacaoHistorico()}>
                      <Icone name="clock" size={13} /> Ver histórico de observações
                    </button>
                  </div>
                  <p>{dados.observations || 'Nenhuma observação atual cadastrada.'}</p>
                </section>
              </div>
            )}
          </ConteudoCarregando>
        </main>
      </div>
      {historicoAberto && (
        <div
          className="observation-history-backdrop"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) setHistoricoAberto(false);
          }}
        >
          <section
            className="observation-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="observation-history-title"
          >
            <header>
              <div>
                <small>REGISTROS ANTERIORES</small>
                <h2 id="observation-history-title">Histórico de observações</h2>
              </div>
              <button aria-label="Fechar histórico" onClick={() => setHistoricoAberto(false)}>
                ✕
              </button>
            </header>
            <p className="observation-history-warning">
              Estes registros são históricos e não representam a observação atual da OS.
            </p>
            {historicoCarregando ? (
              <Skeleton tipo="tabela" linhas={4} />
            ) : historicoErro ? (
              <div className="observation-history-error" role="alert">
                <p>{historicoErro}</p>
                <button
                  type="button"
                  className="observation-history-retry"
                  onClick={() => void abertoObservacaoHistorico()}
                >
                  <Icone name="clock" size={14} /> Tentar novamente
                </button>
              </div>
            ) : observacaoHistorico.length ? (
              <ol>
                {observacaoHistorico.map((registro) => (
                  <li key={registro.id}>
                    <div>
                      <b>
                        {registro.kind === 'nota_status'
                          ? 'Nota da mudança de status'
                          : 'Observação anterior'}
                      </b>
                      <time>{dadosLocal(registro.at)}</time>
                    </div>
                    {registro.context && <small>{registro.context}</small>}
                    <p>{registro.body}</p>
                    <small>Registrado por {registro.actor} · Histórico, não atual</small>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Nenhuma observação anterior registrada.</p>
            )}
          </section>
        </div>
      )}
      {avisoTemporario && (
        <div className="orders-toast" role="status" onClick={() => setAvisoTemporario('')}>
          {avisoTemporario}
        </div>
      )}
      {editando && (
        <ModalAcoesOrdem
          orderId={idOrdem}
          initialTab="edit"
          onClose={() => setEditando(false)}
          onChanged={atualizarDetalhes}
          onDeleted={() => navegar('/ordens-de-servico')}
        />
      )}
      {correctingImagem && dados && (
        <ModalPreviaModelo
          orderId={idOrdem}
          currentModel={dados.motorcycle.model}
          onClose={() => setCorrectingImagem(false)}
          onChanged={() => {
            atualizarDetalhes();
            setFalhouMotoImagem('');
            setImagemRevisao((valor) => valor + 1);
            setAvisoTemporario('Miniatura aprovada e salva para este modelo.');
          }}
        />
      )}
    </div>
  );
}
