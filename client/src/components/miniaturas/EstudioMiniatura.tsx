import './miniaturas.css';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import MotoMiniaturaIcone from './MotoMiniaturaIcone';
import './estudioMiniatura.css';
import RevisaoMiniatura from './RevisaoMiniatura';
import PopupErroMiniatura from './PopupErroMiniatura';
import { conferenciaVazia } from '../../services/conferenciaMiniatura';
import ProgressoMiniatura from './ProgressoMiniatura';
import { Icone } from '../MenuAdmin';
import { useEstadoRascunho } from '../../hooks/useEstadoRascunho';
import { useDadosVivos } from '../../hooks/useDadosVivos';
import {
  buscarPedidoMiniatura,
  prepararFotoMiniatura,
  requisitarMiniaturas,
  type PedidoMiniatura,
  type SituacaoGeracao,
} from '../../services/centralMiniaturas';

type Props = {
  modeloInicial?: string;
  motoId?: number;
  pedidoId?: string;
  escopoRascunho?: string;
  aoPublicar?: () => void;
  aoCancelar?: () => void;
};
export default function EstudioMiniatura({
  modeloInicial = '',
  motoId,
  pedidoId,
  escopoRascunho,
  aoPublicar,
  aoCancelar,
}: Props) {
  const escopo =
    escopoRascunho || `estudio-miniatura-${pedidoId || motoId || modeloInicial || 'novo'}`;
  const [modelo, setModelo] = useEstadoRascunho(escopo, 'modelo', modeloInicial);
  const [ano, setAno] = useEstadoRascunho(escopo, 'ano', '');
  const [variante, setVariante] = useEstadoRascunho(escopo, 'variante', '');
  const [observacoes, setObservacoes] = useEstadoRascunho(escopo, 'observacoes', '');
  const [modo, setModo] = useEstadoRascunho<'referencia' | 'preservar'>(
    escopo,
    'modo',
    'referencia',
  );

  const [idSalvo, setIdSalvo] = useEstadoRascunho<string | null>(escopo, 'pedido', null);
  const [pedido, setPedido] = useState<PedidoMiniatura | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [erroDispensado, setErroDispensado] = useState('');
  const [aviso, setAviso] = useState('');
  const [correcao, setCorrecao] = useState('');
  const [indiceReferencia, setIndiceReferencia] = useState(0);
  const [conferencias, setConferencias] = useState(conferenciaVazia);
  const [imagemCarregada, setImagemCarregada] = useState<string | null>(null);
  const travaAcao = useRef(false);
  const sequenciaLeitura = useRef(0);
  const [etapaTela, setEtapaTela] = useState<'preparar' | 'conferir'>('preparar');
  const [fonte, setFonte] = useState('');
  const [autorizouFonte, setAutorizouFonte] = useState(false);
  const [qr, setQr] = useState<{
    imagem: string;
    url: string;
    expira: string;
    pedidoId: string;
  } | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialogo = painel.current?.closest('dialog');
    if (dialogo) dialogo.scrollTop = 0;
  }, [etapaTela]);
  useEffect(() => {
    if (!aviso.startsWith('Solicitação na fila.')) return;
    if (pedido?.status === 'revisao' && pedido.imagem)
      setAviso('Miniatura pronta para conferência.');
    else if (pedido && !['pendente', 'processando'].includes(pedido.status)) setAviso('');
  }, [pedido?.status, pedido?.candidato, pedido?.imagem, aviso]);
  const [pedidoEncerrado, setPedidoEncerrado] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<SituacaoGeracao | null>(null);
  const id = (pedidoId !== pedidoEncerrado ? pedidoId : null) || idSalvo;
  const emProcessamento = !!pedido && ['pendente', 'processando'].includes(pedido.status);
  // Trocar modelo, ano ou versao cria um pedido novo; o atual continua salvo na Central.
  const identidadeMudou =
    !!pedido &&
    (modelo.trim() !== pedido.catalogo.modelo ||
      (ano || '') !== (pedido.catalogo.ano ? String(pedido.catalogo.ano) : '') ||
      variante.trim() !== (pedido.catalogo.variante || ''));
  const mensagemErro = erro || pedido?.erro || '';
  const candidataAtual = pedido?.candidato || (pedido?.imagem ? pedido.id : null);
  const imagemPronta = Boolean(candidataAtual && imagemCarregada === candidataAtual);
  useEffect(() => {
    if (candidataAtual) setEtapaTela('conferir');
  }, [candidataAtual]);
  const editavel =
    !id || (!!pedido && ['rascunho', 'informacao', 'falhou', 'revisao', 'aprovada', 'descartada'].includes(pedido.status));
  const hidratado = useRef<string | null>(null);
  useEffect(() => {
    if (!pedido || hidratado.current === pedido.id) return;
    hidratado.current = pedido.id;
    setModelo(pedido.catalogo.modelo);
    setAno(pedido.catalogo.ano ? String(pedido.catalogo.ano) : '');
    setVariante(pedido.catalogo.variante);
    if (pedidoId) {
      setObservacoes(pedido.observacoes);
      setModo(pedido.modo);
    }
  }, [pedido?.id]);
  useEffect(() => {
    setConferencias(conferenciaVazia());
    setIndiceReferencia(0);
  }, [pedido?.id, pedido?.candidato, pedido?.catalogo.revisao]);
  const carregar = async (atualId = id) => {
    if (atualId) {
      const leitura = ++sequenciaLeitura.current;
      const atual = await buscarPedidoMiniatura(atualId);
      if (leitura === sequenciaLeitura.current) setPedido(atual);
      return atual;
    }
    return null;
  };
  useEffect(() => {
    setPedido((atual) => (atual?.id === id ? atual : null));
    setConferencias(conferenciaVazia());
    setErro('');
    setErroDispensado('');
    if (!id) return;
    let ativo = true;
    const atualizar = () => {
      if (document.visibilityState === 'hidden' || travaAcao.current) return;
      const leitura = ++sequenciaLeitura.current;
      buscarPedidoMiniatura(id)
        .then((atual) => {
          if (!ativo || leitura !== sequenciaLeitura.current || travaAcao.current) return;
          setPedido(atual);
        })
        .catch((falha) => {
          if (ativo && leitura === sequenciaLeitura.current && !travaAcao.current)
            setErro(falha.message);
        });
    };
    atualizar();
    return () => {
      ativo = false;
    };
  }, [id]);
  useEffect(() => {
    setQr(null);
  }, [pedidoId]);
  useDadosVivos(async (valido) => {
    const atual = await requisitarMiniaturas<SituacaoGeracao>('/api/admin/miniaturas/situacao').catch(
      () => null,
    );
    if (valido() && atual) setSituacao(atual);
  }, true, 'situacao-geracao');
  useDadosVivos(
    async (valido) => {
      if (!id || document.visibilityState === 'hidden' || travaAcao.current) return;
      const leitura = ++sequenciaLeitura.current;
      try {
        const atual = await buscarPedidoMiniatura(id);
        if (valido() && leitura === sequenciaLeitura.current && !travaAcao.current)
          setPedido(atual);
      } catch (falha) {
        if (valido() && leitura === sequenciaLeitura.current && !travaAcao.current)
          setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar.');
      }
    },
    Boolean(id) && !ocupado,
    id ?? '',
  );
  const executar = async (acao: () => Promise<void>) => {
    if (travaAcao.current) return;
    travaAcao.current = true;
    sequenciaLeitura.current++;
    setOcupado(true);
    setErro('');
    setErroDispensado('');
    setAviso('');
    try {
      await acao();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir.');
    } finally {
      travaAcao.current = false;
      setOcupado(false);
    }
  };
  const anoMaximo = new Date().getFullYear() + 2;
  const anoValido =
    !ano || (/^\d{4}$/.test(ano) && Number(ano) >= 1900 && Number(ano) <= anoMaximo);
  const salvar = async () => {
    const reaproveitavel =
      id && !identidadeMudou && !['aprovada', 'descartada'].includes(pedido?.status || '');
    if (reaproveitavel) return id;
    if (id) setPedidoEncerrado(id);
    if (modelo.trim().length < 2) throw new Error('Informe a marca e o modelo da moto.');
    if (!anoValido) throw new Error(`Informe um ano entre 1900 e ${anoMaximo}.`);
    const resultado = await requisitarMiniaturas<{ id: string }>('/api/admin/miniaturas', 'POST', {
      modelo: modelo.trim(),
      ano: ano ? Number(ano) : null,
      variante,
      observacoes,
      modo,
      motoId: null,
    });
    setIdSalvo(resultado.id);
    await carregar(resultado.id);
    return resultado.id;
  };
  const enviar = async (files: FileList | null) =>
    executar(async () => {
      if (!files?.length) return;
      if (files.length + (pedido?.referencias.length || 0) > 4)
        throw new Error('Envie no maximo quatro fotos de referencia.');
      const atualId = await salvar();
      try {
        for (const file of Array.from(files))
          await requisitarMiniaturas(
            `/api/admin/miniaturas/${atualId}/referencias`,
            'POST',
            await prepararFotoMiniatura(file),
          );
      } finally {
        await carregar(atualId);
      }
      setAviso('Fotos recebidas. Confira as referências antes de gerar.');
    });
  const novo = () => {
    if (id) setPedidoEncerrado(id);
    setErro('');
    setErroDispensado('');
    setCorrecao('');
    sequenciaLeitura.current++;
    hidratado.current = null;
    setIdSalvo(null);
    setPedido(null);
    setQr(null);
    setConferencias(conferenciaVazia());
    setEtapaTela('preparar');
    setAviso('Nova solicitação. A imagem aprovada continua disponível.');
  };
  const gerar = () =>
    executar(async () => {
      const atualId = await salvar();
      let resposta: { jaNaFila?: boolean; aviso?: string };
      try {
        resposta = await requisitarMiniaturas(`/api/admin/miniaturas/${atualId}/gerar`, 'POST', {
          correcao,
          observacoes,
          modo,
        });
      } catch (falha) {
        await carregar(atualId).catch(() => {});
        throw falha;
      }
      if (resposta.aviso) setErro(resposta.aviso);
      if (resposta.jaNaFila) {
        await carregar(atualId);
        setAviso(
          'Esta solicitação já está na fila. Suas alterações locais foram mantidas. Aguarde ou cancele a solicitação para editar.',
        );
        return;
      }
      const atual = await carregar(atualId);
      setConferencias(conferenciaVazia());
      setEtapaTela(atual?.imagem && atual.status === 'revisao' ? 'conferir' : 'preparar');
      setAviso('Solicitação na fila. Você pode continuar usando o painel.');
    });
  const descartar = () =>
    executar(async () => {
      if (id) {
        await requisitarMiniaturas(`/api/admin/miniaturas/${id}/descartar`, 'POST', {});
        await carregar();
      } else {
        setModelo('');
        setAno('');
        setVariante('');
        setObservacoes('');
        setModo('referencia');
        setFonte('');
        setAutorizouFonte(false);
        setQr(null);
      }
      setPedidoEncerrado(pedidoId || null);
      novo();
      setCorrecao('');
      setAviso(
        'Solicitação cancelada. Edite os dados e adicione as referências para gerar uma nova miniatura.',
      );
    });
  const cancelarQr = () =>
    executar(async () => {
      const pedidoDoQr = qr?.pedidoId || pedido?.id || id;
      if (!pedidoDoQr) throw new Error('Nao foi possivel identificar o link. Gere outro QR Code.');
      await requisitarMiniaturas(`/api/admin/miniaturas/${pedidoDoQr}/celular`, 'DELETE');
      setQr(null);
      setAviso('Link cancelado. Este QR Code nao aceita novos envios.');
    });
  return (
    <div className="mini-estudio mini-studio" ref={painel}>
      {situacao && !situacao.disponivel && (
        <div className={`mini-situacao mini-situacao-${situacao.motivo}`} role="status">
          <strong>
            {situacao.motivo === 'sem_tokens'
              ? 'Sem tokens da Cloudflare no momento'
              : 'Geração de miniaturas indisponível'}
          </strong>
          <span>{situacao.mensagem}</span>
        </div>
      )}
      <nav className="mini-studio-steps" aria-label="Etapas da miniatura">
        <button
          type="button"
          aria-current={etapaTela === 'preparar' ? 'step' : undefined}
          onClick={() => setEtapaTela('preparar')}
        >
          <span>1</span> Preparar miniatura
        </button>
        <button
          type="button"
          disabled={!pedido?.imagem}
          aria-current={etapaTela === 'conferir' ? 'step' : undefined}
          onClick={() => setEtapaTela('conferir')}
        >
          <span>2</span> Conferir e publicar
        </button>
      </nav>
      <div className="mini-studio-grid" hidden={etapaTela !== 'preparar'}>
        <form
          id={`mini-form-${escopo}`}
          className="mini-studio-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ocupado && !emProcessamento) void gerar();
          }}
        >
          <fieldset className="mini-studio-identity" disabled={ocupado || emProcessamento}>
            <label className="mini-studio-model">
              Marca e modelo
              <input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                maxLength={100}
                placeholder="Ex.: Honda XRE 300"
                required
                minLength={2}
              />
            </label>
            <div className="mini-studio-years">
              <label>
                Ano do modelo <span>(opcional)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={ano}
                  onChange={(e) => setAno(e.target.value)}
                  placeholder="Ex.: 2023"
                  aria-invalid={!anoValido}
                />
              </label>
              <label>
                Versão <span>(opcional)</span>
                <input
                  value={variante}
                  onChange={(e) => setVariante(e.target.value)}
                  maxLength={80}
                  placeholder="Ex.: ABS, Rally, Adventure"
                />
              </label>
            </div>
            <p className="mini-universal-note">
              A miniatura aprovada passa a valer para todas as motos e ordens de serviço deste
              modelo, substituindo a anterior (que fica guardada no histórico). A cor de cada moto é
              aplicada automaticamente, sem gerar de novo.
            </p>
            {identidadeMudou && (
              <p className="mini-universal-note mini-note-strong">
                Você mudou o modelo. Ao gerar, uma nova miniatura será criada para ele.
              </p>
            )}
          </fieldset>
          <section className="mini-studio-references" aria-label="Fotos de referência">
            <div className="mini-studio-section-title">
              <h2>Fotos de referência</h2>
              <span>{pedido?.referencias.length || 0}/4</span>
            </div>
            <div className="mini-studio-photo-actions">
              <button
                type="button"
                disabled={ocupado || !editavel || (pedido?.referencias.length || 0) >= 4}
                onClick={() => arquivo.current?.click()}
              >
                <svg
                  width="29"
                  height="25"
                  viewBox="0 0 28 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 19H6a5 5 0 0 1-1-10 8 8 0 0 1 15-2 6 6 0 0 1 2 12h-2M14 21V9m-5 5 5-5 5 5" />
                </svg>{' '}
                Enviar fotos
              </button>
              <button
                type="button"
                disabled={ocupado || !editavel || (pedido?.referencias.length || 0) >= 4}
                onClick={() =>
                  executar(async () => {
                    const atualId = await salvar();
                    const envio = await requisitarMiniaturas<{ token: string; expira: string }>(
                      `/api/admin/miniaturas/${atualId}/celular`,
                      'POST',
                      {},
                    );
                    const url = `${window.location.origin}/enviar-referencia#${envio.token}`;
                    setQr({
                      imagem: await QRCode.toDataURL(url, {
                        width: 240,
                        margin: 2,
                        color: { dark: '#172b45', light: '#ffffff' },
                      }),
                      url,
                      expira: envio.expira,
                      pedidoId: atualId,
                    });
                  })
                }
              >
                <svg
                  width="25"
                  height="25"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 19h2v2h-2zM15 21v-2h2M21 15h-2v2M12 3v3m0 3v3H3m9 3v6M15 12h6" />
                </svg>{' '}
                Usar QR Code
              </button>
              <input
                ref={arquivo}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  void enviar(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            {qr && (
              <div className="mini-qr">
                <img src={qr.imagem} alt="QR Code para enviar fotos pelo celular" />
                <div>
                  <h3>Continue pelo celular</h3>
                  <p>
                    Leia o código, fotografe ou escolha na galeria. A foto aparece aqui
                    automaticamente.
                  </p>
                  <p>
                    Válido até{' '}
                    {new Date(qr.expira).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    .
                  </p>
                  <button type="button" disabled={ocupado} onClick={() => void cancelarQr()}>
                    Cancelar link
                  </button>
                </div>
              </div>
            )}
            {!!pedido?.referencias.length && (
              <div className="mini-references">
                {pedido.referencias.map((ref, i) => (
                  <figure key={ref.caminho}>
                    <img src={ref.imagem} alt={`Referência ${i + 1}`} />
                    <figcaption>
                      Foto {i + 1} ·{' '}
                      {ref.origem === 'celular'
                        ? 'Celular'
                        : ref.origem === 'web'
                          ? 'Web'
                          : 'Computador'}
                    </figcaption>
                    <button
                      type="button"
                      disabled={ocupado || !editavel || ['aprovada', 'descartada'].includes(pedido.status)}
                      aria-label={`Remover foto ${i + 1}`}
                      onClick={() =>
                        executar(async () => {
                          await requisitarMiniaturas(
                            `/api/admin/miniaturas/${id}/referencias/${i}`,
                            'DELETE',
                          );
                          await carregar();
                        })
                      }
                    >
                      <Icone name="close" />
                    </button>
                  </figure>
                ))}
              </div>
            )}
            <details className="mini-source-import">
              <summary>Importar imagem da web</summary>
              <p className="mini-help">
                Cole o link direto de uma imagem ou de uma página com a foto da moto. O sistema
                baixa a imagem e adiciona às referências.
              </p>
              <label className="mini-source-field">
                Link da imagem ou página
                <input
                  type="url"
                  value={fonte}
                  onChange={(e) => setFonte(e.target.value)}
                  placeholder="https://…"
                  disabled={ocupado || !editavel}
                />
              </label>
              <label className="mini-confirm">
                <input
                  type="checkbox"
                  checked={autorizouFonte}
                  onChange={(e) => setAutorizouFonte(e.target.checked)}
                />
                <span>
                  Tenho autorização para utilizar esta fotografia como referência neste destino.
                </span>
              </label>
              <button
                type="button"
                disabled={ocupado || !editavel || !autorizouFonte || !fonte.startsWith('https://')}
                onClick={() =>
                  executar(async () => {
                    const atualId = await salvar();
                    await requisitarMiniaturas(`/api/admin/miniaturas/${atualId}/fonte`, 'POST', {
                      url: fonte,
                      confirmouUso: true,
                    });
                    await carregar(atualId);
                    setFonte('');
                    setAutorizouFonte(false);
                    setAviso('Referência importada. Confira a foto antes de gerar.');
                  })
                }
              >
                Baixar e adicionar referência
              </button>
            </details>
          </section>
          <details className="mini-studio-advanced">
            <summary>
              Opções avançadas <span className="mini-studio-chevron" aria-hidden="true" />
            </summary>
            <fieldset disabled={ocupado || !editavel}>
              <legend>Como preparar a miniatura</legend>
              <div className="mini-studio-modes">
                {(['referencia', 'preservar'] as const).map((opcao) => (
                  <label
                    className={`mini-studio-choice ${modo === opcao ? 'selected' : ''}`}
                    key={opcao}
                  >
                    <input
                      type="radio"
                      name={`modo-${escopo}`}
                      checked={modo === opcao}
                      onChange={() => setModo(opcao)}
                    />
                    <span>
                      <strong>
                        {opcao === 'referencia'
                          ? 'Criar a partir das referências'
                          : 'Preservar a moto fotografada'}
                      </strong>
                      <small>
                        {opcao === 'referencia'
                          ? 'Gera uma miniatura limpa e padronizada da moto, com base nas fotos ou no link informado.'
                          : 'Usa a própria moto das fotos, mantendo o desenho, os acessórios e os detalhes. A pintura recebe a cor cadastrada.'}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <label className="mini-studio-notes">
                Observações <span>(opcional)</span>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  maxLength={1500}
                  rows={3}
                  placeholder="Detalhes da versão, acessórios e características a preservar"
                />
              </label>
            </fieldset>
          </details>
        </form>
        <aside className="mini-studio-preview" aria-label="Prévia da miniatura">
          <h2>Prévia da miniatura</h2>
          <div className="mini-studio-checker">
            {pedido?.imagem ? (
              <img
                src={pedido.imagem}
                alt="Candidata à aprovação. Confira a frente para a direita."
              />
            ) : (
              <div className="mini-studio-placeholder">
                <MotoMiniaturaIcone />
                <h3>
                  {pedido?.status === 'processando'
                    ? 'Preparando sua miniatura'
                    : pedido?.status === 'pendente'
                      ? 'Sua solicitação está na fila'
                      : 'A prévia aparece aqui'}
                </h3>
                <p>Moto inteira, com a frente para a direita.</p>
              </div>
            )}
          </div>
          <p className="mini-studio-preview-help">Confira a imagem antes de publicar.</p>
          {pedido && <ProgressoMiniatura pedido={pedido} />}
          {pedido && !pedidoId && ['aprovada', 'descartada'].includes(pedido.status) && (
            <button type="button" onClick={novo}>
              Nova solicitação
            </button>
          )}
        </aside>
      </div>
      {mensagemErro && mensagemErro !== erroDispensado && (
        <PopupErroMiniatura
          titulo={pedido?.status === 'informacao' && !erro ? 'Precisamos de uma foto' : undefined}
          mensagem={mensagemErro}
          aoFechar={() => {
            setErroDispensado(mensagemErro);
            setErro('');
          }}
          acao={
            pedido?.status === 'informacao' && !erro
              ? {
                  rotulo: 'Enviar foto da moto',
                  executar: () => {
                    setEtapaTela('preparar');
                    arquivo.current?.click();
                  },
                }
              : undefined
          }
        />
      )}
      {mensagemErro && mensagemErro === erroDispensado && (
        <div role="alert" className="mini-feedback error">
          {mensagemErro}
        </div>
      )}
      {aviso && (
        <div role="status" className="mini-feedback success">
          {aviso}
        </div>
      )}
      {pedido?.imagem && etapaTela === 'conferir' && (
        <RevisaoMiniatura
          pedido={pedido}
          ocupado={ocupado}
          conferencias={conferencias}
          aoConferir={setConferencias}
          indice={Math.min(indiceReferencia, Math.max(0, pedido.referencias.length - 1))}
          aoSelecionar={setIndiceReferencia}
          correcao={correcao}
          aoCorrigir={setCorrecao}
          aoEditar={() => setEtapaTela('preparar')}
          imagemCarregada={imagemPronta}
          aoCarregarImagem={(carregada) => setImagemCarregada(carregada ? candidataAtual : null)}
          aoAprovar={() =>
            void executar(async () => {
              if (!Object.values(conferencias).every(Boolean) || !imagemPronta)
                throw new Error('Marque a confirmação "Conferi a imagem" antes de aprovar.');
              try {
                await requisitarMiniaturas(`/api/admin/miniaturas/${id}/aprovar`, 'POST', {
                  revisao: pedido.catalogo.revisao,
                  candidato: pedido.candidato,
                  confirmouIdentidade: true,
                  confirmouDireita: true,
                  confirmouInteira: true,
                  confirmouUso: true,
                });
              } catch (falha) {
                await carregar().catch(() => {});
                throw falha;
              }
              setPedido((atual) => (atual ? { ...atual, status: 'aprovada', erro: null } : atual));
              setAviso('Miniatura aprovada e publicada.');
              setIdSalvo(null);
              if (id) setPedidoEncerrado(id);
              window.dispatchEvent(new Event('miniaturas-publicadas'));
              try {
                aoPublicar?.();
              } catch {
                /* A publicacao ja foi concluida. */
              }
            })
          }
          aoRestaurar={(publicacaoId) =>
            void executar(async () => {
              await requisitarMiniaturas(
                `/api/admin/miniaturas/publicacoes/${publicacaoId}/restaurar`,
                'POST',
                { revisao: pedido.catalogo.revisao },
              );
              setAviso('Publicação anterior restaurada.');
              await carregar().catch(() => {});
              window.dispatchEvent(new Event('miniaturas-publicadas'));
              aoPublicar?.();
            })
          }
        />
      )}
      <div className="mini-studio-research" hidden={etapaTela !== 'conferir'}>
        {pedido?.pesquisa && (
          <details className="mini-card mini-sources">
            <summary>
              Pesquisa e referências consultadas{' '}
              <span>{(pedido.pesquisa.fontes || []).length} fontes</span>
            </summary>
            {(pedido.pesquisa.avisos || []).map((texto) => (
              <p key={texto}>{texto}</p>
            ))}
            {(pedido.pesquisa.fontes || []).map((fonte) => (
              <a key={fonte.url} href={fonte.url} target="_blank" rel="noreferrer">
                {fonte.titulo}
                <small>
                  {fonte.correspondencia === 'familia' && 'Referência da família · '}
                  {fonte.licenca || 'Fonte de identificação; não autoriza reutilizar a foto.'}
                </small>
              </a>
            ))}
          </details>
        )}
      </div>
      <footer className="mini-studio-footer">
        <div className="mini-studio-attempts">
          <strong>{pedido?.status === 'pendente' || pedido?.status === 'processando' ? 'Processamento em andamento' : 'Você pode fechar e voltar depois'}</strong>
          <span aria-hidden="true">|</span>
          {pedido && editavel && <button type="button" className="mini-link" onClick={novo}>Nova miniatura</button>}
          <button
            type="button"
            className="mini-link"
            disabled={ocupado || (!!pedido && ['aprovada', 'descartada'].includes(pedido.status))}
            onClick={() => void descartar()}
          >
            Cancelar solicitação
          </button>
        </div>
        <div className="mini-studio-footer-actions">
          {etapaTela === 'conferir' && (
            <button
              type="button"
              disabled={ocupado || !editavel}
              onClick={() => setEtapaTela('preparar')}
            >
              Editar referências
            </button>
          )}
          {aoCancelar && (
            <button type="button" className="mini-studio-cancel" onClick={aoCancelar}>
              Fechar
            </button>
          )}
          <button
            type="button"
            onClick={() => void gerar()}
            className="mini-primary"
            disabled={ocupado || emProcessamento || modelo.trim().length < 2 || !anoValido}
          >
            {ocupado
              ? 'Enviando…'
              : emProcessamento
                ? 'Gerando… (pode fechar)'
                : pedido?.imagem && !identidadeMudou
                  ? 'Gerar outra versão'
                  : 'Gerar miniatura'}
          </button>
        </div>
      </footer>
    </div>
  );
}
