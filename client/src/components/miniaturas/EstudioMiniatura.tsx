import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import ComparadorMiniaturas from './ComparadorMiniaturas';
import { Icone } from '../MenuAdmin';
import { useEstadoRascunho } from '../../hooks/useEstadoRascunho';
import { useDadosVivos } from '../../hooks/useDadosVivos';
import {
  buscarPedidoMiniatura,
  nomesSituacao,
  prepararFotoMiniatura,
  requisitarMiniaturas,
  type PedidoMiniatura,
} from '../../services/centralMiniaturas';

type Props = {
  modeloInicial?: string;
  motoId?: number;
  pedidoId?: string;
  aoPublicar?: () => void;
};
export default function EstudioMiniatura({
  modeloInicial = '',
  motoId,
  pedidoId,
  aoPublicar,
}: Props) {
  const escopo = `estudio-miniatura-${motoId || modeloInicial || 'novo'}`;
  const [modelo, setModelo] = useEstadoRascunho(escopo, 'modelo', modeloInicial);
  const [ano, setAno] = useEstadoRascunho(escopo, 'ano', '');
  const [variante, setVariante] = useEstadoRascunho(escopo, 'variante', '');
  const [observacoes, setObservacoes] = useEstadoRascunho(escopo, 'observacoes', '');
  const [modo, setModo] = useEstadoRascunho<'referencia' | 'preservar'>(
    escopo,
    'modo',
    'referencia',
  );
  const [destino, setDestino] = useEstadoRascunho(escopo, 'destino', 'modelo');
  const [idSalvo, setIdSalvo] = useEstadoRascunho<string | null>(escopo, 'pedido', null);
  const [pedido, setPedido] = useState<PedidoMiniatura | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [correcao, setCorrecao] = useState('');
  const [regiao, setRegiao] = useState('');
  const [confirmou, setConfirmou] = useState(false);
  const [fonte, setFonte] = useState('');
  const [autorizouFonte, setAutorizouFonte] = useState(false);
  const [qr, setQr] = useState<{ imagem: string; url: string; expira: string } | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const id = pedidoId || idSalvo;
  const editavel =
    !pedido || ['rascunho', 'informacao', 'falhou', 'revisao'].includes(pedido.status);
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
    setConfirmou(false);
  }, [pedido?.candidato]);
  useEffect(() => {
    if (
      !id ||
      !pedido ||
      ocupado ||
      !editavel ||
      (observacoes === pedido.observacoes && modo === pedido.modo)
    )
      return;
    const temporizador = window.setTimeout(() => {
      void requisitarMiniaturas(`/api/admin/miniaturas/${id}`, 'PATCH', {
        observacoes,
        modo,
      }).catch(() => {});
    }, 800);
    return () => window.clearTimeout(temporizador);
  }, [id, observacoes, modo, ocupado, pedido?.status]);
  const carregar = async (atualId = id) => {
    if (atualId) {
      const atual = await buscarPedidoMiniatura(atualId);
      setPedido(atual);
      return atual;
    }
    return null;
  };
  useEffect(() => {
    setPedido(null);
    setQr(null);
    setConfirmou(false);
    setErro('');
    if (!id) return;
    let ativo = true;
    const atualizar = () => {
      if (document.visibilityState === 'hidden') return;
      buscarPedidoMiniatura(id)
        .then((atual) => {
          if (!ativo) return;
          setPedido(atual);
        })
        .catch((falha) => {
          if (ativo) setErro(falha.message);
        });
    };
    atualizar();
    return () => {
      ativo = false;
    };
  }, [id]);
  useDadosVivos(async (valido) => {
    if (!id || document.visibilityState === 'hidden') return;
    try {
      const atual = await buscarPedidoMiniatura(id);
      if (valido()) setPedido(atual);
    } catch (falha) {
      if (valido()) setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar.');
    }
  }, Boolean(id), id ?? '');
  const executar = async (acao: () => Promise<void>) => {
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      await acao();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  };
  const salvar = async () => {
    if (id) return id;
    const resultado = await requisitarMiniaturas<{ id: string }>('/api/admin/miniaturas', 'POST', {
      modelo,
      ano: ano ? Number(ano) : null,
      variante,
      observacoes,
      modo,
      motoId: destino === 'moto' ? motoId : null,
    });
    setIdSalvo(resultado.id);
    await carregar(resultado.id);
    return resultado.id;
  };
  const enviar = async (files: FileList | null) =>
    executar(async () => {
      if (!files?.length) return;
      const atualId = await salvar();
      for (const file of Array.from(files))
        await requisitarMiniaturas(
          `/api/admin/miniaturas/${atualId}/referencias`,
          'POST',
          await prepararFotoMiniatura(file),
        );
      await carregar(atualId);
      setAviso('Fotos recebidas. Confira as referências antes de gerar.');
    });
  const novo = () => {
    hidratado.current = null;
    setIdSalvo(null);
    setPedido(null);
    setQr(null);
    setConfirmou(false);
    setAviso('Nova solicitação. A imagem aprovada continua disponível.');
  };
  return (
    <div className="mini-estudio">
      <div className="mini-editor">
        <section className="mini-card">
          <header>
            <span className="mini-icon">
              <Icone name="bike" size={22} />
            </span>
            <div>
              <h2>Qual moto vamos representar?</h2>
              <p>Identifique o modelo. Versões diferentes ficam separadas.</p>
            </div>
          </header>
          <fieldset disabled={ocupado || !!id} className="mini-fields">
            <label className="mini-wide">
              Marca e modelo
              <input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                maxLength={100}
                placeholder="Ex.: Honda CG 150"
              />
            </label>
            <label>
              Ano do modelo <small>opcional</small>
              <input
                type="number"
                min="1900"
                max={new Date().getFullYear() + 2}
                value={ano}
                onChange={(e) => setAno(e.target.value)}
                placeholder="Todos os anos compatíveis"
              />
            </label>
            <label>
              Versão <small>opcional</small>
              <input
                value={variante}
                onChange={(e) => setVariante(e.target.value)}
                maxLength={80}
                placeholder="Ex.: Titan, Sport, Spyder"
              />
            </label>
            {motoId && (
              <label className="mini-wide">
                Onde usar a aprovação
                <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                  <option value="modelo">Padrão compartilhado deste modelo</option>
                  <option value="moto">Somente nesta motocicleta</option>
                </select>
              </label>
            )}
          </fieldset>
          {id && (
            <div className="mini-inline">
              <span className={`mini-status ${pedido?.status || ''}`}>
                {nomesSituacao[pedido?.status || 'rascunho']}
              </span>
              <span>
                {pedido?.catalogo.modelo} {pedido?.catalogo.variante} {pedido?.catalogo.ano || ''}
              </span>
              {!pedidoId && (
                <button type="button" className="mini-link" onClick={novo}>
                  Outra solicitação
                </button>
              )}
            </div>
          )}
        </section>
        <section className="mini-card">
          <header>
            <span className="mini-icon">
              <Icone name="upload" size={22} />
            </span>
            <div>
              <h2>Referências da moto</h2>
              <p>Envie até quatro fotos ou deixe o sistema pesquisar.</p>
            </div>
            <span className="mini-count">{pedido?.referencias.length || 0}/4</span>
          </header>
          <div className="mini-upload-actions">
            <button
              type="button"
              disabled={ocupado || !editavel}
              onClick={() => arquivo.current?.click()}
            >
              <Icone name="upload" size={18} /> Escolher fotos
            </button>
            <button
              type="button"
              disabled={ocupado || !editavel}
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
                  });
                })
              }
            >
              <Icone name="camera" size={18} /> Usar celular com QR Code
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
          <p className="mini-help">
            Moto inteira, boa iluminação e frente para a direita. Fotos particulares não entram
            automaticamente em um catálogo público.
          </p>
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
                <button
                  type="button"
                  onClick={() =>
                    executar(async () => {
                      await requisitarMiniaturas(`/api/admin/miniaturas/${id}/celular`, 'DELETE');
                      setQr(null);
                    })
                  }
                >
                  Cancelar link
                </button>
              </div>
            </div>
          )}
          <details className="mini-source-import">
            <summary>Tenho um link de foto no site do fabricante</summary>
            <p className="mini-help">
              Cole a página oficial que contém a foto. Se o site impedir a importação, você pode
              enviar o arquivo autorizado.
            </p>
            <label className="mini-source-field">
              Link da página
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
              Importar referência autorizada
            </button>
          </details>
          {!!pedido?.referencias.length && (
            <div className="mini-references">
              {pedido.referencias.map((ref, i) => (
                <figure key={ref.caminho}>
                  <img src={ref.imagem} alt={`Referência ${i + 1}`} />
                  <figcaption>
                    Foto {i + 1} · {ref.origem === 'celular' ? 'Celular' : 'Computador'}
                  </figcaption>
                  <button
                    type="button"
                    disabled={ocupado || !editavel}
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
        </section>
        <section className="mini-card">
          <header>
            <span className="mini-icon">
              <Icone name="settings" size={21} />
            </span>
            <div>
              <h2>Como preparar a miniatura</h2>
              <p>A frente para a direita faz parte do padrão obrigatório.</p>
            </div>
          </header>
          <fieldset disabled={ocupado || !editavel} className="mini-options">
            {(['referencia', 'preservar'] as const).map((opcao) => (
              <label className={`mini-choice ${modo === opcao ? 'selected' : ''}`} key={opcao}>
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
                      ? 'Combina pesquisa, fotos e detalhes informados.'
                      : 'Orienta a edição a manter pintura, adesivos e acessórios.'}
                  </small>
                </span>
              </label>
            ))}
            <label>
              Observações <small>opcional</small>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                maxLength={1500}
                rows={3}
                placeholder="Detalhes da versão, acessórios ou características que devem ser preservadas."
              />
            </label>
          </fieldset>
          <div className="mini-inline">
            <p className="mini-help">
              {pedido?.tentativas || 0} de 6 tentativas utilizadas. Você pode sair enquanto o
              sistema trabalha.
            </p>
            <button
              type="button"
              className="mini-primary"
              disabled={
                ocupado || !editavel || (pedido?.tentativas || 0) >= 6 || modelo.trim().length < 3
              }
              onClick={() =>
                executar(async () => {
                  const atualId = await salvar();
                  await requisitarMiniaturas(`/api/admin/miniaturas/${atualId}`, 'PATCH', {
                    observacoes,
                    modo,
                  });
                  await requisitarMiniaturas(`/api/admin/miniaturas/${atualId}/gerar`, 'POST', {
                    correcao: [regiao, correcao].filter(Boolean).join(': '),
                  });
                  await carregar(atualId);
                  setConfirmou(false);
                  setAviso('Solicitação na fila. Você pode continuar usando o painel.');
                })
              }
            >
              <Icone name="plus" size={17} />
              {ocupado ? 'Preparando…' : pedido?.imagem ? 'Gerar outra opção' : 'Gerar miniatura'}
            </button>
          </div>
        </section>
        {pedido?.pesquisa && (
          <details className="mini-card mini-sources">
            <summary>
              Pesquisa e referências consultadas <span>{pedido.pesquisa.fontes.length} fontes</span>
            </summary>
            {pedido.pesquisa.avisos.map((texto) => (
              <p key={texto}>{texto}</p>
            ))}
            {pedido.pesquisa.fontes.map((fonte) => (
              <a key={fonte.url} href={fonte.url} target="_blank" rel="noreferrer">
                {fonte.titulo}
                <small>
                  {fonte.licenca || 'Fonte de identificação; não autoriza reutilizar a foto.'}
                </small>
              </a>
            ))}
          </details>
        )}
      </div>
      <aside className="mini-card mini-preview">
        <header>
          <span className="mini-icon">
            <Icone name="eye" size={22} />
          </span>
          <div>
            <h2>Conferência e aprovação</h2>
            <p>Somente a imagem aprovada aparece nos outros percursos.</p>
          </div>
        </header>
        {pedido?.atual && (
          <figure className="mini-current">
            <figcaption>Padrão publicado</figcaption>
            <img src={pedido.atual} alt="Miniatura aprovada atualmente" />
          </figure>
        )}
        <figure className="mini-candidate">
          {pedido?.imagem ? (
            <img
              src={pedido.imagem}
              alt="Candidata à aprovação. Confira a frente para a direita."
            />
          ) : (
            <div className="mini-placeholder">
              <Icone name="bike" size={72} />
              <h3>
                {pedido?.status === 'processando'
                  ? 'Preparando sua miniatura'
                  : pedido?.status === 'pendente'
                    ? 'Sua solicitação está na fila'
                    : 'Sua próxima miniatura começa aqui'}
              </h3>
              <p>Uma moto inteira, em alta resolução, com a frente para a direita.</p>
            </div>
          )}
          <figcaption>
            <span>Candidata</span>
            <span>Frente para a direita →</span>
          </figcaption>
        </figure>
        {pedido?.imagem && pedido.referencias[0]?.imagem && (
          <ComparadorMiniaturas
            referencia={pedido.referencias[0].imagem}
            candidata={pedido.imagem}
          />
        )}
        {pedido?.verificacao && (
          <div className="mini-inspection">
            <strong>
              Conferência {pedido.verificacao.automatica ? 'automática' : 'manual necessária'}
            </strong>
            <p>
              Direção: {pedido.verificacao.direcao}. Moto inteira:{' '}
              {pedido.verificacao.inteira ? 'sim' : 'não confirmada'}.
            </p>
            {pedido.verificacao.problemas.map((problema) => (
              <p key={problema}>{problema}</p>
            ))}
          </div>
        )}
        {pedido?.status === 'revisao' && (
          <>
            <div className="mini-fields">
              <label>
                O que precisa mudar?
                <select value={regiao} onChange={(e) => setRegiao(e.target.value)}>
                  <option value="">Selecione uma região</option>
                  {[
                    'Farol e direção',
                    'Tanque e pintura',
                    'Carenagem e adesivos',
                    'Motor e escapamento',
                    'Rodas',
                    'Enquadramento',
                    'Identidade do modelo',
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Correção desejada
                <textarea
                  value={correcao}
                  onChange={(e) => setCorrecao(e.target.value)}
                  maxLength={650}
                  rows={2}
                  placeholder="Descreva o ajuste para a próxima tentativa."
                />
              </label>
            </div>
            <label className="mini-confirm">
              <input
                type="checkbox"
                checked={confirmou}
                onChange={(e) => setConfirmou(e.target.checked)}
              />
              <span>
                Conferi o modelo e a versão, a moto está inteira e com a frente para a direita.
                Tenho autorização para usar as referências neste destino.
              </span>
            </label>
            <button
              type="button"
              className="mini-primary mini-approve"
              disabled={!confirmou || ocupado}
              onClick={() =>
                executar(async () => {
                  await requisitarMiniaturas(`/api/admin/miniaturas/${id}/aprovar`, 'POST', {
                    revisao: pedido.catalogo.revisao,
                    confirmouIdentidade: true,
                    confirmouDireita: true,
                    confirmouInteira: true,
                    confirmouUso: true,
                  });
                  await carregar();
                  window.dispatchEvent(new Event('miniaturas-publicadas'));
                  aoPublicar?.();
                  setAviso('Miniatura aprovada. O catálogo compartilhado foi atualizado.');
                })
              }
            >
              <Icone name="check" size={18} /> Aprovar e publicar
            </button>
          </>
        )}
        {pedido && editavel && (
          <button
            type="button"
            className="mini-link mini-discard"
            disabled={ocupado}
            onClick={() =>
              executar(async () => {
                await requisitarMiniaturas(`/api/admin/miniaturas/${id}/descartar`, 'POST', {});
                await carregar();
              })
            }
          >
            Descartar esta solicitação
          </button>
        )}
        {!!pedido?.historico?.length && (
          <details className="mini-history">
            <summary>Histórico de publicações</summary>
            {pedido.historico.map((item) => (
              <div key={item.id}>
                <span>{new Date(item.criado_em).toLocaleString('pt-BR')}</span>
                <button
                  type="button"
                  disabled={ocupado || item.id === pedido.catalogo.publicada}
                  onClick={() =>
                    executar(async () => {
                      await requisitarMiniaturas(
                        `/api/admin/miniaturas/publicacoes/${item.id}/restaurar`,
                        'POST',
                        { revisao: pedido.catalogo.revisao },
                      );
                      await carregar();
                      window.dispatchEvent(new Event('miniaturas-publicadas'));
                      aoPublicar?.();
                      setAviso('Publicação anterior restaurada.');
                    })
                  }
                >
                  Restaurar
                </button>
              </div>
            ))}
          </details>
        )}
      </aside>
      {(erro || pedido?.erro) && (
        <div role="alert" className="mini-feedback error">
          {erro || pedido?.erro}
        </div>
      )}
      {aviso && (
        <div role="status" className="mini-feedback success">
          {aviso}
        </div>
      )}
    </div>
  );
}
