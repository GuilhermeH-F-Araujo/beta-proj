import { useFocoModal } from '../hooks/useFocoModal';
import MiniaturaModelo from './miniaturas/MiniaturaModelo';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEstadoRascunho } from '../hooks/useEstadoRascunho';
import {
  buscarDetalhesAcaoOrdem,
  excluirOrdem,
  salvarDetalhesAcaoOrdem,
  setSituacaoOrdem,
  type DetalhesAcaoOrdem,
  type SituacaoOrdem,
} from '../services/apiAutenticacao';
import { limparRascunho, temRascunho } from '../services/rascunhos';
import { useAcessoConta } from '../services/acessoConta';
import LogoEstacao from './LogoEstacao';
import { Icone } from './MenuAdmin';
import './modal-acoes-ordem.css';
import Skeleton from './Skeleton';

type Aba = 'status' | 'edit' | 'cancel';
type Confirmacao = 'status' | 'edit' | 'cancel' | 'delete' | null;
const situacoes: { value: SituacaoOrdem; label: string; caption: string }[] = [
  { value: 'aguardando', label: 'Aberta', caption: 'Ordem registrada e aguardando início' },
  { value: 'em andamento', label: 'Em andamento', caption: 'Serviço em execução' },
  {
    value: 'aguardando peça',
    label: 'Aguardando peça',
    caption: 'Aguardando chegada de peça necessária',
  },
  { value: 'pronto', label: 'Pronta', caption: 'Serviço pronto para entrega' },
  { value: 'entregue', label: 'Finalizada', caption: 'Serviço concluído' },
  { value: 'cancelada', label: 'Cancelada', caption: 'Ordem encerrada sem execução' },
];
const rotuloSituacao = (situacao: SituacaoOrdem) =>
  situacoes.find((item) => item.value === situacao)?.label ?? situacao;
function formatarCpf(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  return digitos
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

export default function ModalAcoesOrdem({
  orderId: idOrdem,
  initialTab: inicialAba,
  onClose: aoFechar,
  onChanged: aoAlterar,
  onDeleted: aoExcluido,
}: {
  orderId: number;
  initialTab: Aba | 'delete';
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const acesso = useAcessoConta();
  const podeExcluirPermanentemente =
    acesso.nivel === 'superadministrador' || acesso.nivel === 'dono';
  const [aba, setAba] = useState<Aba>(inicialAba === 'delete' ? 'cancel' : inicialAba);
  const [registro, setRegistro] = useState<DetalhesAcaoOrdem | null>(null);
  const [editar, setEditar] = useEstadoRascunho(`acoes-os-${idOrdem}`, 'edit', {
    client: { name: '', phone: '', email: '', cpf: '' },
    motorcycle: { model: '', plate: '', year: null as number | null, color: '' },
    problem: '',
    observations: '',
  });
  const [continuarSituacao, setProximoSituacao] = useEstadoRascunho<SituacaoOrdem | null>(
    `acoes-os-${idOrdem}`,
    'nextStatus',
    null,
  );
  const [situacaoAnotacao, setSituacaoAnotacao] = useEstadoRascunho(
    `acoes-os-${idOrdem}`,
    'statusNote',
    '',
  );
  const [cancelarMotivo, setCancelarMotivo] = useEstadoRascunho(
    `acoes-os-${idOrdem}`,
    'cancelReason',
    '',
  );
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(
    inicialAba === 'delete' && podeExcluirPermanentemente ? 'delete' : null,
  );
  const [sucesso, setSucesso] = useState('');
  const focoAcoes = useFocoModal<HTMLElement>(!confirmacao && !sucesso);
  const focoConfirmacao = useFocoModal<HTMLElement>(!!confirmacao && !sucesso);
  const focoSucesso = useFocoModal<HTMLElement>(!!sucesso);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (inicialAba === 'delete') setConfirmacao(podeExcluirPermanentemente ? 'delete' : null);
  }, [inicialAba, podeExcluirPermanentemente]);

  useEffect(() => {
    let ativo = true;
    buscarDetalhesAcaoOrdem(idOrdem)
      .then((detalhes) => {
        if (!ativo) return;
        setRegistro(detalhes);
        if (!temRascunho(`acoes-os-${idOrdem}`, 'nextStatus')) setProximoSituacao(detalhes.status);
        if (!temRascunho(`acoes-os-${idOrdem}`, 'edit'))
          setEditar({
            client: {
              name: detalhes.client.name,
              phone: detalhes.client.phone ?? '',
              email: detalhes.client.email ?? '',
              cpf: formatarCpf(detalhes.client.cpf ?? ''),
            },
            motorcycle: {
              model: detalhes.motorcycle.model,
              plate: detalhes.motorcycle.plate,
              year: detalhes.motorcycle.year,
              color: detalhes.motorcycle.color ?? '',
            },
            problem: detalhes.problem ?? '',
            observations: detalhes.observations ?? '',
          });
      })
      .catch((erroCapturado) => {
        if (ativo)
          setErro(
            erroCapturado instanceof Error
              ? erroCapturado.message
              : 'Não foi possível carregar a OS.',
          );
      });
    return () => {
      ativo = false;
    };
  }, [idOrdem]);
  useEffect(() => {
    const tratar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape' || ocupado) return;
      if (sucesso) aoFechar();
      else if (confirmacao) setConfirmacao(null);
      else aoFechar();
    };
    window.addEventListener('keydown', tratar);
    return () => window.removeEventListener('keydown', tratar);
  }, [ocupado, confirmacao, sucesso, aoFechar]);

  function solicitar() {
    setErro('');
    if (aba === 'status') {
      if (!continuarSituacao || continuarSituacao === registro?.status)
        return setErro('Escolha um novo status antes de salvar.');
      if (continuarSituacao === 'cancelada' && !situacaoAnotacao.trim())
        return setErro('Informe o motivo do cancelamento.');
      setConfirmacao('status');
    } else if (aba === 'edit') {
      if (
        editar.client.name.trim().length < 2 ||
        editar.motorcycle.model.trim().length < 2 ||
        !/^[A-Za-z0-9-]{5,10}$/.test(editar.motorcycle.plate.trim())
      ) {
        return setErro('Preencha o nome, modelo e uma placa válida antes de salvar.');
      }
      if (editar.client.cpf.trim() && editar.client.cpf.replace(/\D/g, '').length !== 11)
        return setErro('O CPF precisa ter 11 dígitos.');
      setConfirmacao('edit');
    } else if (registro?.status === 'cancelada') setErro('Esta OS já está cancelada.');
    else if (!cancelarMotivo.trim()) setErro('Informe o motivo do cancelamento.');
    else setConfirmacao('cancel');
  }
  async function executar() {
    if (!confirmacao || ocupado) return;
    if (confirmacao === 'delete' && !podeExcluirPermanentemente) {
      setConfirmacao(null);
      setErro('Somente a dona ou um superadministrador pode excluir uma OS permanentemente.');
      return;
    }
    setOcupado(true);
    setErro('');
    try {
      if (confirmacao === 'delete') {
        await excluirOrdem(idOrdem, cancelarMotivo);
        limparRascunho(`acoes-os-${idOrdem}`);
        aoExcluido();
        setSucesso('Ordem excluída com sucesso.');
      } else if (confirmacao === 'edit') {
        await salvarDetalhesAcaoOrdem(idOrdem, editar);
        limparRascunho(`acoes-os-${idOrdem}`);
        aoAlterar();
        setSucesso('Informações salvas com sucesso.');
      } else {
        const destino = confirmacao === 'cancel' ? 'cancelada' : continuarSituacao!;
        await setSituacaoOrdem(
          idOrdem,
          destino,
          confirmacao === 'cancel' ? cancelarMotivo.trim() : situacaoAnotacao.trim(),
        );
        limparRascunho(`acoes-os-${idOrdem}`);
        aoAlterar();
        setSucesso(
          destino === 'cancelada' ? 'OS cancelada com sucesso.' : 'Status alterado com sucesso.',
        );
      }
      setConfirmacao(null);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível concluir a ação.',
      );
    } finally {
      setOcupado(false);
    }
  }
  const mostrarPrincipal = (inicialAba !== 'delete' || !podeExcluirPermanentemente) && !sucesso;
  const selecionadoSituacao = continuarSituacao ?? registro?.status ?? 'aguardando';
  return createPortal(
    <>
      {mostrarPrincipal && (
        <div
          className="oa-backdrop"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget && !ocupado) aoFechar();
          }}
        >
          <section
            className="oa-shell"
            ref={focoAcoes}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Ações da OS #${idOrdem}`}
          >
            <header className="oa-header">
              <div className="oa-brand">
                <LogoEstacao />
                <strong>Estação Motos</strong>
              </div>
              <div>
                <span>Painel administrativo</span>
                <button className="oa-icon-button" aria-label="Fechar" onClick={aoFechar}>
                  <Icone name="close" size={15} />
                </button>
              </div>
            </header>
            <div className="oa-headline">
              <h2>Ações da OS</h2>
              <p>Gerencie esta ordem de serviço com segurança, agilidade e rastreabilidade.</p>
            </div>
            {registro ? (
              <>
                <div className="oa-summary">
                  <div>
                    <span className="oa-summary-icon red">
                      <Icone name="clipboard" size={17} />
                    </span>
                    <span>
                      <b>OS #{registro.id}</b>
                      <small>Número da ordem</small>
                    </span>
                  </div>
                  <div>
                    <span className="oa-summary-icon">
                      <Icone name="users" size={17} />
                    </span>
                    <span>
                      <b>{registro.client.name}</b>
                      <small>Cliente</small>
                    </span>
                  </div>
                  <div>
                    <MiniaturaModelo
                      className="oa-summary-icon"
                      modelo={registro.motorcycle.model}
                      cor={registro.motorcycle.color || null}
                      tamanhoIcone={18}
                    />
                    <span>
                      <b>{registro.motorcycle.model}</b>
                      <small>Motocicleta</small>
                    </span>
                  </div>
                </div>
                <nav className="oa-tabs" aria-label="Ações da OS">
                  <button
                    className={aba === 'status' ? 'active' : ''}
                    onClick={() => {
                      setAba('status');
                      setErro('');
                    }}
                  >
                    <Icone name="clock" size={14} /> Alterar status
                  </button>
                  <button
                    className={aba === 'edit' ? 'active' : ''}
                    onClick={() => {
                      setAba('edit');
                      setErro('');
                    }}
                  >
                    <Icone name="pencil" size={14} /> Corrigir informações
                  </button>
                  <button
                    className={aba === 'cancel' ? 'active' : ''}
                    onClick={() => {
                      setAba('cancel');
                      setErro('');
                    }}
                  >
                    <Icone name="clipboard" size={14} /> Cancelar OS
                  </button>
                </nav>
                <div className="oa-content">
                  {aba === 'status' ? (
                    <>
                      <div className="oa-status-current">
                        <div>
                          <label>Status atual</label>
                          <div className={`oa-state state-${registro.status.replaceAll(' ', '-')}`}>
                            <i />
                            {rotuloSituacao(registro.status)}
                          </div>
                        </div>
                        <span className="oa-arrow">
                          <Icone name="right" size={14} />
                        </span>
                        <div>
                          <label>Novo status</label>
                          <div
                            className={`oa-state state-${selecionadoSituacao.replaceAll(' ', '-')}`}
                          >
                            <i />
                            {rotuloSituacao(selecionadoSituacao)}
                          </div>
                        </div>
                      </div>
                      <label className="oa-field-title">Novo status da OS</label>
                      <div className="oa-status-grid">
                        {situacoes.map((opcao) => (
                          <button
                            type="button"
                            className={`oa-choice choice-${opcao.value.replaceAll(' ', '-')}${selecionadoSituacao === opcao.value ? ' selected' : ''}`}
                            key={opcao.value}
                            onClick={() => setProximoSituacao(opcao.value)}
                          >
                            <span>
                              <i />
                              <b>
                                {opcao.label}
                                <small>{opcao.caption}</small>
                              </b>
                            </span>
                            <span className="oa-radio">
                              {selecionadoSituacao === opcao.value && (
                                <Icone name="check" size={13} />
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="oa-status-bottom">
                        <label className="oa-field">
                          {selecionadoSituacao === 'cancelada'
                            ? 'Motivo do cancelamento'
                            : 'Nota da mudança de status'}{' '}
                          <small>
                            {selecionadoSituacao === 'cancelada'
                              ? '(obrigatório)'
                              : '(histórico, opcional)'}
                          </small>
                          <textarea
                            maxLength={500}
                            placeholder={
                              selecionadoSituacao === 'cancelada'
                                ? 'Descreva o motivo do cancelamento...'
                                : 'Esta nota aparecerá apenas no histórico de observações...'
                            }
                            value={situacaoAnotacao}
                            onChange={(eventoRecebido) =>
                              setSituacaoAnotacao(eventoRecebido.target.value)
                            }
                          />
                          <em>{situacaoAnotacao.length}/500</em>
                        </label>
                        <div className="oa-audit">
                          <Icone name="check" size={16} />
                          <span>
                            <b>Segurança e auditoria</b>
                            <small>
                              Todas as ações realizadas pelo administrador são registradas no log
                              administrativo com data e usuário.
                            </small>
                            <small>Apenas administradores podem realizar esta ação.</small>
                          </span>
                        </div>
                      </div>
                    </>
                  ) : aba === 'edit' ? (
                    <div className="oa-edit">
                      <h3>
                        <Icone name="users" size={14} /> Dados do cliente
                      </h3>
                      <div className="oa-form-grid">
                        <label>
                          Nome do cliente
                          <input
                            maxLength={100}
                            value={editar.client.name}
                            onChange={(eventoRecebido) =>
                              setEditar((anterior) => ({
                                ...anterior,
                                client: { ...anterior.client, name: eventoRecebido.target.value },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Telefone
                          <input
                            maxLength={20}
                            value={editar.client.phone}
                            onChange={(eventoRecebido) =>
                              setEditar((anterior) => ({
                                ...anterior,
                                client: { ...anterior.client, phone: eventoRecebido.target.value },
                              }))
                            }
                          />
                        </label>
                        <label>
                          E-mail
                          <input
                            type="email"
                            maxLength={150}
                            value={editar.client.email}
                            onChange={(eventoRecebido) =>
                              setEditar((anterior) => ({
                                ...anterior,
                                client: { ...anterior.client, email: eventoRecebido.target.value },
                              }))
                            }
                          />
                        </label>
                        <label>
                          CPF
                          <input
                            inputMode="numeric"
                            maxLength={20}
                            placeholder="Não cadastrado"
                            value={editar.client.cpf}
                            onChange={(eventoRecebido) =>
                              setEditar((anterior) => ({
                                ...anterior,
                                client: {
                                  ...anterior.client,
                                  cpf: formatarCpf(eventoRecebido.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <h3>
                        <Icone name="bike" size={14} /> Dados da motocicleta
                      </h3>
                      <div className="oa-form-grid">
                        <label>
                          Marca / Modelo
                          <input
                            maxLength={100}
                            value={editar.motorcycle.model}
                            onChange={(eventoRecebido) =>
                              setEditar((anterior) => ({
                                ...anterior,
                                motorcycle: {
                                  ...anterior.motorcycle,
                                  model: eventoRecebido.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Placa
                          <input
                            maxLength={10}
                            value={editar.motorcycle.plate}
                            onChange={(eventoRecebido) =>
                              setEditar((anterior) => ({
                                ...anterior,
                                motorcycle: {
                                  ...anterior.motorcycle,
                                  plate: eventoRecebido.target.value.toUpperCase(),
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Ano
                          <input
                            type="number"
                            min="1900"
                            max="2100"
                            value={editar.motorcycle.year ?? ''}
                            onChange={(eventoRecebido) =>
                              setEditar((anterior) => ({
                                ...anterior,
                                motorcycle: {
                                  ...anterior.motorcycle,
                                  year: eventoRecebido.target.value
                                    ? Number(eventoRecebido.target.value)
                                    : null,
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Cor
                          <input
                            maxLength={50}
                            value={editar.motorcycle.color}
                            onChange={(eventoRecebido) =>
                              setEditar((anterior) => ({
                                ...anterior,
                                motorcycle: {
                                  ...anterior.motorcycle,
                                  color: eventoRecebido.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <label className="oa-wide-label">
                        Problema
                        <input
                          maxLength={2000}
                          value={editar.problem}
                          onChange={(eventoRecebido) =>
                            setEditar((anterior) => ({
                              ...anterior,
                              problem: eventoRecebido.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="oa-wide-label">
                        Observações
                        <textarea
                          maxLength={2000}
                          placeholder="Adicione observações (opcional)"
                          value={editar.observations}
                          onChange={(eventoRecebido) =>
                            setEditar((anterior) => ({
                              ...anterior,
                              observations: eventoRecebido.target.value,
                            }))
                          }
                        />
                      </label>
                      <small className="oa-shared-note">
                        Dados do cliente e da moto serão atualizados também nas outras OS vinculadas
                        a eles.
                      </small>
                    </div>
                  ) : (
                    <div className="oa-cancel-content">
                      <span className="oa-cancel-icon">
                        <Icone name="close" size={24} />
                      </span>
                      <h3>Cancelar esta ordem de serviço?</h3>
                      <p>
                        A OS ficará com status <b>Cancelada</b> e permanecerá no histórico para
                        consulta. Esta ação pode ser corrigida posteriormente por um administrador.
                      </p>
                      <label>
                        Motivo do cancelamento <small>(Obrigatório)</small>
                        <textarea
                          maxLength={500}
                          value={cancelarMotivo}
                          onChange={(eventoRecebido) =>
                            setCancelarMotivo(eventoRecebido.target.value)
                          }
                          placeholder="Descreva o motivo..."
                        />
                      </label>
                      {podeExcluirPermanentemente && (
                        <button className="oa-delete-link" onClick={() => setConfirmacao('delete')}>
                          <Icone name="close" size={13} /> Excluir esta ordem permanentemente
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {erro && (
                  <div className="oa-error" role="alert">
                    {erro}
                  </div>
                )}
                <footer className="oa-footer">
                  <div className="oa-footer-note">
                    <Icone name="clock" size={14} /> Suas alterações serão registradas internamente
                    com seu usuário no Log do Sistema.
                  </div>
                  <div>
                    <button className="oa-secondary" onClick={aoFechar}>
                      <Icone name="close" size={12} /> Cancelar
                    </button>
                    <button className="oa-primary" onClick={solicitar}>
                      <Icone name="check" size={13} />
                      {aba === 'cancel' ? 'Cancelar OS' : 'Salvar alteração'}
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="oa-loading">{erro || <Skeleton tipo="formulario" linhas={4} />}</div>
            )}
          </section>
        </div>
      )}
      {confirmacao && (
        <div
          className="oa-confirm-backdrop"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget && !ocupado)
              inicialAba === 'delete' ? aoFechar() : setConfirmacao(null);
          }}
        >
          <section
            className="oa-confirm"
            ref={focoConfirmacao}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="oa-confirm-title"
          >
            <span className={`oa-confirm-icon ${confirmacao === 'delete' ? 'destructive' : ''}`}>
              <Icone name={confirmacao === 'delete' ? 'close' : 'check'} size={19} />
            </span>
            <div>
              <button
                className="oa-confirm-close"
                aria-label="Fechar"
                onClick={() => (inicialAba === 'delete' ? aoFechar() : setConfirmacao(null))}
              >
                <Icone name="close" size={15} />
              </button>
              <h3 id="oa-confirm-title">Confirmar Ação</h3>
              <p>
                {confirmacao === 'delete'
                  ? `Tem certeza que deseja excluir esta ordem de serviço (OS #${idOrdem})?`
                  : confirmacao === 'edit'
                    ? 'Tem certeza que deseja salvar as informações corrigidas?'
                    : confirmacao === 'cancel'
                      ? `Tem certeza que deseja cancelar a OS #${idOrdem}?`
                      : `Tem certeza que deseja alterar o status da OS #${idOrdem}?`}
              </p>
              {confirmacao === 'delete' && (
                <>
                  <p>Esta ação é permanente e não poderá ser desfeita.</p>
                  <label className="oa-delete-reason">
                    Motivo da exclusão <small>(opcional)</small>
                    <textarea
                      maxLength={500}
                      placeholder="Descreva o motivo..."
                      value={cancelarMotivo}
                      onChange={(evento) => setCancelarMotivo(evento.target.value)}
                    />
                  </label>
                </>
              )}
              {erro && (
                <small className="oa-confirm-error" role="alert">
                  {erro}
                </small>
              )}
              <div className="oa-confirm-actions">
                <button
                  onClick={() => (inicialAba === 'delete' ? aoFechar() : setConfirmacao(null))}
                  disabled={ocupado}
                >
                  Cancelar
                </button>
                <button
                  className={confirmacao === 'delete' ? 'danger' : 'positive'}
                  onClick={() => void executar()}
                  disabled={ocupado}
                >
                  {ocupado ? 'Aguarde...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {sucesso && (
        <div
          className="oa-confirm-backdrop"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) aoFechar();
          }}
        >
          <section
            className="oa-success"
            ref={focoSucesso}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
          >
            <span>
              <Icone name="check" size={23} />
            </span>
            <div>
              <button aria-label="Fechar" onClick={aoFechar}>
                <Icone name="close" size={14} />
              </button>
              <h3>{sucesso}</h3>
              <p>A ação foi registrada. Você pode continuar trabalhando normalmente.</p>
              <button className="oa-success-done" onClick={aoFechar}>
                Concluir
              </button>
            </div>
          </section>
        </div>
      )}
    </>,
    document.body,
  );
}
