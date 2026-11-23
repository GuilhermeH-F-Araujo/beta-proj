import { useEffect, useState } from 'react';
import { useDadosVivos } from '../hooks/useDadosVivos';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import {
  buscarResumoPagamento,
  registrarPagamentoOrdem,
  type ResumoPagamento,
} from '../services/apiAutenticacao';
import { limparRascunho } from '../services/rascunhos';
import Skeleton from './Skeleton';
import './modal-pagamento.css';

type Forma = 'pix' | 'credito' | 'debito';
type Maquininha = 'rede' | 'stone';
const moeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

function MiniMaquininha({ type: tipoLocal }: { type: Maquininha }) {
  return (
    <span className={`terminal-illustration ${tipoLocal}`} aria-hidden="true">
      <img
        src={`/assets/${tipoLocal === 'rede' ? 'terminal-rede.png' : 'terminal-stone.png'}`}
        alt=""
      />
    </span>
  );
}

function FormaIcone({ type: tipoLocal }: { type: Forma }) {
  if (tipoLocal === 'pix')
    return (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        aria-hidden="true"
      >
        <path d="m10 2 3 3-3 3-3-3 3-3Zm0 10 3 3-3 3-3-3 3-3ZM2 10l3-3 3 3-3 3-3-3Zm10 0 3-3 3 3-3 3-3-3Z" />
        <path d="M10 8v4M8 10h4" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="10" rx="1.5" />
      <path d="M2.5 8.5h15" />
      {tipoLocal === 'credito' && <path d="M5 12h4" />}
    </svg>
  );
}

export default function ModalPagamento({
  orderId: idOrdem,
  onClose: aoFechar,
  onPaid: aoPago,
}: {
  orderId: number;
  onClose: () => void;
  onPaid: (id: number) => void;
}) {
  const [resumo, setResumo] = useState<ResumoPagamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [metodo, setForma] = useEstadoRascunho<Forma>(`pagamento-${idOrdem}`, 'method', 'credito');
  const [maquininha, setMaquininha] = useEstadoRascunho<Maquininha>(
    `pagamento-${idOrdem}`,
    'terminal',
    'rede',
  );
  const [parcelas, setParcelas] = useEstadoRascunho(`pagamento-${idOrdem}`, 'installments', 1);
  const [moreOpcoes, setMoreOpcoes] = useEstadoRascunho(
    `pagamento-${idOrdem}`,
    'moreOptions',
    false,
  );
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    let ativo = true;
    buscarResumoPagamento(idOrdem)
      .then((resultado) => {
        if (ativo) setResumo(resultado);
      })
      .catch((erroCapturado) => {
        if (ativo)
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível carregar a OS.',
          );
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [idOrdem]);
  useEffect(() => {
    if (!sucesso) return;
    const temporizador = window.setTimeout(aoFechar, 2800);
    return () => window.clearTimeout(temporizador);
  }, [sucesso, aoFechar]);
  useEffect(() => {
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !salvando) aoFechar();
    };
    window.addEventListener('keydown', escapar);
    return () => window.removeEventListener('keydown', escapar);
  }, [aoFechar, salvando]);

  useDadosVivos(
    async (valido) => {
      const dados = await buscarResumoPagamento(idOrdem);
      if (valido()) setResumo(dados);
    },
    !carregando && !salvando && !sucesso,
    String(idOrdem),
  );
  async function finalizar() {
    if (!resumo || resumo.amount <= 0 || salvando) return;
    setSalvando(true);
    setErro('');
    try {
      await registrarPagamentoOrdem(idOrdem, true, {
        method: metodo,
        terminal: metodo === 'pix' ? null : maquininha,
        installments: metodo === 'credito' ? parcelas : 1,
      });
      aoPago(idOrdem);
      limparRascunho(`pagamento-${idOrdem}`);
      setSucesso(true);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível finalizar o registro.',
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className={`payment-backdrop${sucesso ? ' payment-done' : ''}`}
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !salvando) aoFechar();
      }}
    >
      {sucesso ? (
        <section
          className="payment-success"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-success-title"
          aria-live="polite"
        >
          <div className="success-check">
            <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
              <path d="M8 28h12v29H8a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4Zm18 29V27l8-14V7a6 6 0 0 1 10-4c5 5 4 13 1 20h11a7 7 0 0 1 6 10l-7 20a7 7 0 0 1-7 4H26Z" />
            </svg>
          </div>
          <h2 id="payment-success-title">Pagamento Efetuado com sucesso</h2>
          <p>Pagamento da OS concluído com sucesso!</p>
          <small>Você será direcionado de volta em instantes.</small>
        </section>
      ) : (
        <section
          className="payment-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-title"
        >
          <div className="payment-dialog-head">
            <h2 id="payment-title">Pagamento da OS #{idOrdem}</h2>
            <button
              type="button"
              aria-label="Fechar pagamento"
              onClick={aoFechar}
              disabled={salvando}
            >
              ×
            </button>
          </div>
          {carregando ? (
            <Skeleton tipo="formulario" linhas={4} />
          ) : !resumo ? (
            <div className="payment-loading">
              <p>{erro}</p>
              <button type="button" onClick={aoFechar}>
                Voltar
              </button>
            </div>
          ) : (
            <>
              <div className="payment-scroll-content">
                <div className="payment-facts">
                  <div>
                    <small>♙ Cliente</small>
                    <strong>{resumo.client}</strong>
                    <span>{resumo.phone || 'Telefone não informado'}</span>
                  </div>
                  <div>
                    <small>◇ Veículo</small>
                    <strong>{resumo.motorcycle}</strong>
                    <span>{resumo.plate || 'Placa não informada'}</span>
                  </div>
                  <div className="payment-value">
                    <small>▤ Valor da OS</small>
                    <strong>{moeda(resumo.amount)}</strong>
                  </div>
                </div>
                <div className="payment-breakdown">
                  <h3>Resumo do pagamento</h3>
                  <div>
                    <span>Peças e acessórios</span>
                    <b>{moeda(resumo.partsTotal)}</b>
                  </div>
                  <div>
                    <span>Serviços</span>
                    <b>{moeda(resumo.servicesTotal)}</b>
                  </div>
                  <div className="discount">
                    <span>Descontos</span>
                    <b>- {moeda(resumo.discount)}</b>
                  </div>
                  <div className="payment-total">
                    <strong>Total a pagar</strong>
                    <strong>{moeda(resumo.amount)}</strong>
                  </div>
                </div>
                <h3 className="payment-section-title">Forma de pagamento</h3>
                <div className="payment-methods">
                  {(['pix', 'credito', 'debito'] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={metodo === item ? 'selected' : ''}
                      onClick={() => {
                        setForma(item);
                        setErro('');
                      }}
                    >
                      <FormaIcone type={item} />
                      {item === 'pix' ? 'Pix' : item === 'credito' ? 'Crédito' : 'Débito'}
                    </button>
                  ))}
                </div>
                {metodo === 'pix' && (
                  <div className="pix-section">
                    <h3 className="payment-section-title">Pix</h3>
                    <div className="pix-info">
                      <div>
                        <strong>Pagamento via PIX</strong>
                        <p>Confira o pagamento no seu provedor antes de confirmar nesta tela.</p>
                        <small>
                          A chave Pix e o QR Code precisam ser gerados pelo provedor da oficina.
                        </small>
                      </div>
                      <div className="pix-value">
                        <small>Valor a pagar</small>
                        <strong>{moeda(resumo.amount)}</strong>
                      </div>
                    </div>
                  </div>
                )}
                <h3 className="payment-section-title">Maquininha</h3>
                <div className="payment-terminals">
                  {(['rede', 'stone'] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={maquininha === item ? 'selected' : ''}
                      onClick={() => setMaquininha(item)}
                    >
                      <MiniMaquininha type={item} />
                      <span className="terminal-copy">
                        <strong>{item === 'rede' ? 'Rede' : 'Stone'}</strong>
                        <small>{item === 'rede' ? 'Modelo: L210' : 'Modelo: S920'}</small>
                        <small>Selecione a maquininha</small>
                      </span>
                      <span className="terminal-radio" />
                    </button>
                  ))}
                </div>
                {metodo === 'credito' && (
                  <div className="payment-installments">
                    <div>
                      {[1, 2, 3].map((quantidade) => (
                        <button
                          type="button"
                          key={quantidade}
                          className={parcelas === quantidade ? 'selected' : ''}
                          onClick={() => setParcelas(quantidade)}
                        >
                          <strong>
                            {quantidade}x de {moeda(resumo.amount / quantidade)}
                          </strong>
                          <small>sem juros</small>
                          <span className="installment-check" />
                        </button>
                      ))}
                      <button
                        type="button"
                        className="more-installments"
                        onClick={() => setMoreOpcoes(!moreOpcoes)}
                        aria-expanded={moreOpcoes}
                      >
                        Mais opções⌄
                      </button>
                    </div>
                    {moreOpcoes && (
                      <select
                        aria-label="Outras parcelas"
                        value={parcelas > 3 ? parcelas : ''}
                        onChange={(evento) => setParcelas(Number(evento.target.value))}
                      >
                        <option value="" disabled>
                          Selecione as parcelas
                        </option>
                        {Array.from({ length: 9 }, (_, indice) => indice + 4).map((quantidade) => (
                          <option value={quantidade} key={quantidade}>
                            {quantidade}x de {moeda(resumo.amount / quantidade)} sem juros
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                {metodo !== 'pix' && (
                  <div className="payment-terminal-notice">
                    <MiniMaquininha type={maquininha} />
                    <div>
                      <strong>Pronto para confirmar o pagamento</strong>
                      <p>
                        Confira a aprovação na maquininha selecionada antes de finalizar o registro.
                      </p>
                    </div>
                  </div>
                )}
                <div className="payment-hint">
                  ⓘ &nbsp;{' '}
                  {metodo === 'pix'
                    ? 'Confirme o recebimento do Pix antes de registrar o pagamento.'
                    : 'O cliente deve inserir o cartão na maquininha para realizar o pagamento.'}
                </div>
                {resumo.amount <= 0 && (
                  <p className="payment-error">
                    Esta OS ainda não tem valor informado. Adicione os itens ou o total antes de
                    finalizar.
                  </p>
                )}
                {erro && (
                  <p className="payment-error" role="alert">
                    {erro}
                  </p>
                )}
              </div>
              <div className="payment-footer">
                <button type="button" onClick={aoFechar} disabled={salvando}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="payment-finish"
                  onClick={finalizar}
                  disabled={salvando || resumo.amount <= 0}
                >
                  <img src="/assets/enviar.svg" alt="" />
                  {salvando ? 'Registrando…' : 'Finalizar pagamento'}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
