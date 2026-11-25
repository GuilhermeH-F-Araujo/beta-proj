import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  lembrarMetodo,
  metodoPreferido,
  registrarConfirmacao,
  type ContextoConfirmacao,
  type SessaoAdministrativa,
} from '../services/confirmacaoAdministrativa';
import { request, ErroRequisicaoApi } from '../services/api/transporte';
import {
  confirmarIdentidadeAdministrativa,
  iniciarCadastroAutenticador,
  validarSenhaAdministrativa,
  verificarCadastroAutenticador,
  type CadastroAutenticador,
} from '../services/autenticador';
import CampoSenha from './CampoSenha';
import CodigoAutenticador from './CodigoAutenticador';
import { Icone } from './MenuAdmin';
import './confirmacao-administrativa.css';

export default function ConfirmacaoAdministrativa({
  usuario,
}: {
  usuario: { nome: string; email: string | null; perfil: string } | null;
}) {
  const [contexto, setContexto] = useState<ContextoConfirmacao | null>(null);
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [autenticadorAtivo, setAutenticadorAtivo] = useState(false);
  const [metodoConfirmacao, setMetodoConfirmacao] = useState<'senha' | 'autenticador' | 'ambos'>(
    'senha',
  );
  const [consultandoProtecao, setConsultandoProtecao] = useState(false);
  const [etapaConfig, setEtapaConfig] = useState<'aviso' | 'senha' | 'qr'>('aviso');
  const [etapaConfirmacao, setEtapaConfirmacao] = useState<'senha' | 'codigo'>('senha');
  const [cadastroMfa, setCadastroMfa] = useState<CadastroAutenticador | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [bloqueadoAte, setBloqueadoAte] = useState(0);
  const [agora, setAgora] = useState(Date.now());
  const resposta = useRef<{ resolver: () => void; rejeitar: (erro: Error) => void } | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const primeiroDigito = useRef<HTMLInputElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);
  const espera = Math.max(0, Math.ceil((bloqueadoAte - agora) / 1000));
  const precisaConfigurar =
    !!contexto?.requireAuthenticator &&
    (!autenticadorAtivo || !!contexto?.previsualizarObrigatoriedade);
  const previsualizacao = !!contexto?.previsualizacao;
  const promocaoSuperadmin = contexto?.titulo === 'Confirmar promoção de acesso';
  const mostrarAutenticador = precisaConfigurar
    ? etapaConfig === 'qr'
    : etapaConfirmacao === 'codigo';
  const imagemConfirmacao = precisaConfigurar
    ? '/assets/seguranca/protecao-conta-oficina.webp'
    : mostrarAutenticador
      ? '/assets/seguranca/confirmacao-autenticador.webp'
      : '/assets/seguranca/confirmacao-computador.webp';
  function fechar(confirmado: boolean) {
    const atual = resposta.current;
    resposta.current = null;
    setSenha('');
    setCodigo('');
    setEtapaConfig('aviso');
    setEtapaConfirmacao('senha');
    setCadastroMfa(null);
    setContexto(null);
    setErro('');
    if (confirmado) atual?.resolver();
    else atual?.rejeitar(new Error('Confirmação cancelada. A alteração não foi executada.'));
    focoAnterior.current?.focus();
  }
  useEffect(() => {
    const remover = registrarConfirmacao(
      (acao) =>
        new Promise<void>((resolver, rejeitar) => {
          focoAnterior.current = document.activeElement as HTMLElement;
          resposta.current = { resolver, rejeitar };
          setErro('');
          setSenha('');
          setCodigo('');
          setAutenticadorAtivo(
            !!acao?.previsualizacao &&
              !!acao.requireAuthenticator &&
              !acao.previsualizarObrigatoriedade,
          );
          setEtapaConfig('aviso');
          setEtapaConfirmacao('senha');
          setMetodoConfirmacao(
            acao?.metodoForcado ?? (acao?.requireAuthenticator ? 'ambos' : 'senha'),
          );
          setCadastroMfa(null);
          setBloqueadoAte(0);
          setContexto(
            acao ?? {
              titulo: 'Confirme sua identidade',
              descricao: 'Confirme sua identidade para continuar.',
            },
          );
        }),
    );
    return () => {
      remover();
      resposta.current?.rejeitar(new Error('A sessão foi encerrada. Entre novamente.'));
      resposta.current = null;
    };
  }, []);
  const aberto = !!contexto;
  useEffect(() => {
    if (!aberto) return;
    dialogo.current?.showModal();
    dialogo.current?.querySelector<HTMLInputElement>('input')?.focus();
    if (contexto?.previsualizacao) {
      const metodo = contexto.metodoForcado ?? (contexto.requireAuthenticator ? 'ambos' : 'senha');
      setAutenticadorAtivo(!contexto.previsualizarObrigatoriedade);
      setMetodoConfirmacao(metodo);
      setEtapaConfirmacao(metodo === 'autenticador' ? 'codigo' : 'senha');
      setConsultandoProtecao(false);
      return;
    }
    const controle = new AbortController();
    setConsultandoProtecao(true);
    void request<SessaoAdministrativa>('/api/admin/security/session', {
      method: 'GET',
      signal: controle.signal,
    })
      .then((estado) => {
        if (!controle.signal.aborted) {
          setBloqueadoAte(estado.blockedUntil ? Date.parse(estado.blockedUntil) : 0);
          setAutenticadorAtivo(!!estado.mfaConfigured);
          // Sem sorteio: usa o metodo que a pessoa escolheu da ultima vez neste aparelho.
          // Com autenticador ativo e sem preferencia, o codigo e o caminho mais rapido.
          const preferido = metodoPreferido();
          const metodo = contexto?.metodoForcado
            ? contexto.metodoForcado
            : contexto?.requireAuthenticator
              ? 'ambos'
              : estado.mfaConfigured && preferido !== 'senha'
                ? 'autenticador'
                : 'senha';
          setMetodoConfirmacao(metodo);
          setEtapaConfirmacao(metodo === 'autenticador' ? 'codigo' : 'senha');
          setAgora(Date.now());
          setConsultandoProtecao(false);
        }
      })
      .catch((falha) => {
        if (!controle.signal.aborted) {
          setErro(
            falha instanceof Error
              ? falha.message
              : 'Não foi possível consultar a proteção da conta.',
          );
          setConsultandoProtecao(false);
        }
      });
    return () => controle.abort();
  }, [
    aberto,
    contexto?.requireAuthenticator,
    contexto?.metodoForcado,
    contexto?.previsualizacao,
    contexto?.previsualizarObrigatoriedade,
  ]);
  useEffect(() => {
    if (!aberto || precisaConfigurar) return;
    if (etapaConfirmacao === 'codigo') primeiroDigito.current?.focus();
    else dialogo.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [aberto, etapaConfirmacao, precisaConfigurar]);
  useEffect(() => {
    if (!aberto || !bloqueadoAte) return;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [aberto, bloqueadoAte]);
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (previsualizacao) {
      if (metodoConfirmacao === 'ambos' && etapaConfirmacao === 'senha') {
        setSenha('');
        setCodigo('');
        setEtapaConfirmacao('codigo');
        return;
      }
      fechar(true);
      return;
    }
    if (ocupado || espera > 0) return;
    if (
      (metodoConfirmacao !== 'autenticador' && !senha) ||
      consultandoProtecao ||
      precisaConfigurar
    )
      return;
    if (metodoConfirmacao === 'ambos') {
      if (etapaConfirmacao === 'senha') {
        setErro('');
        setOcupado(true);
        try {
          await validarSenhaAdministrativa(senha);
          setCodigo('');
          setEtapaConfirmacao('codigo');
        } catch (capturado) {
          if (capturado instanceof ErroRequisicaoApi && capturado.esperaSegundos) {
            setBloqueadoAte(Date.now() + capturado.esperaSegundos * 1000);
            setAgora(Date.now());
          }
          setSenha('');
          setErro(
            capturado instanceof Error ? capturado.message : 'Não foi possível confirmar a senha.',
          );
        } finally {
          setOcupado(false);
        }
        return;
      }
      if (codigo.length !== 6) return;
    }
    setOcupado(true);
    setErro('');
    try {
      await confirmarIdentidadeAdministrativa(senha, {
        ...(codigo ? { code: codigo } : {}),
        method:
          metodoConfirmacao === 'ambos'
            ? 'both'
            : metodoConfirmacao === 'autenticador'
              ? 'authenticator'
              : 'password',
        requireAuthenticator: !!contexto?.requireAuthenticator,
        employeeApproval: !!contexto?.requireAuthenticator && /funcionário/i.test(contexto.titulo),
      });
      if (metodoConfirmacao !== 'ambos') lembrarMetodo(metodoConfirmacao);
      fechar(true);
    } catch (capturado) {
      if (capturado instanceof ErroRequisicaoApi && capturado.esperaSegundos) {
        setBloqueadoAte(Date.now() + capturado.esperaSegundos * 1000);
        setAgora(Date.now());
      }
      setErro(capturado instanceof Error ? capturado.message : 'Não foi possível confirmar.');
      setSenha('');
      setCodigo('');
      setEtapaConfirmacao(metodoConfirmacao === 'autenticador' ? 'codigo' : 'senha');
    } finally {
      setOcupado(false);
    }
  }
  async function iniciarConfiguracao() {
    if (!senha || ocupado) return;
    setOcupado(true);
    setErro('');
    try {
      await confirmarIdentidadeAdministrativa(senha);
      const cadastro = await iniciarCadastroAutenticador();
      setCadastroMfa(cadastro);
      setCodigo('');
      setSenha('');
      setEtapaConfig('qr');
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível iniciar a configuração.');
    } finally {
      setOcupado(false);
    }
  }
  async function verificarConfiguracao(evento: FormEvent) {
    evento.preventDefault();
    if (!cadastroMfa || codigo.length !== 6 || ocupado) return;
    setOcupado(true);
    setErro('');
    try {
      await verificarCadastroAutenticador(cadastroMfa.factorId, codigo);
      setAutenticadorAtivo(true);
      setCadastroMfa(null);
      setCodigo('');
      setSenha('');
      fechar(true);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Código inválido. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }
  if (!contexto) return null;
  return createPortal(
    <dialog
      ref={dialogo}
      className={`admin-confirm-dialog${!precisaConfigurar ? ' admin-confirm-aprovado' : ''}${precisaConfigurar ? ' admin-confirm-setup' : ''}`}
      data-confirm-step={!precisaConfigurar ? etapaConfirmacao : undefined}
      data-setup-step={precisaConfigurar ? etapaConfig : undefined}
      aria-labelledby="admin-confirm-title"
      aria-describedby="admin-confirm-description"
      onCancel={(evento) => {
        evento.preventDefault();
        if (!ocupado) fechar(false);
      }}
    >
      <div className="admin-confirm-scene" aria-hidden="true">
        <img src={imagemConfirmacao} alt="" />
      </div>
      <div className="admin-confirm-content">
        <button
          className="admin-confirm-close"
          aria-label="Cancelar verificação"
          disabled={ocupado}
          onClick={() => fechar(false)}
        >
          <Icone name="close" size={18} />
        </button>
        <header className="admin-confirm-heading">
          {precisaConfigurar && (
            <span className="admin-confirm-mark" aria-hidden="true">
              <Icone name="shield" size={20} />
            </span>
          )}
          <span className="admin-confirm-kicker">
            {precisaConfigurar ? 'PROTEÇÃO OBRIGATÓRIA' : 'SEGURANÇA DA CONTA'}
          </span>
          <h2 id="admin-confirm-title">
            {precisaConfigurar
              ? etapaConfig === 'qr'
                ? 'Vincule seu autenticador'
                : 'Ative a proteção da conta'
              : contexto.titulo}
          </h2>
          <p id="admin-confirm-description">
            {precisaConfigurar
              ? 'Esta decisão só pode continuar depois que você ativar o código de segurança no celular.'
              : contexto.descricao}
          </p>
          {!precisaConfigurar && metodoConfirmacao === 'ambos' && (
            <div
              className="admin-confirm-progress"
              aria-label={`Etapa ${etapaConfirmacao === 'senha' ? '1' : '2'} de 2`}
            >
              <span className={etapaConfirmacao === 'senha' ? 'active' : 'complete'}>
                <i>{etapaConfirmacao === 'codigo' ? <Icone name="check" size={12} /> : '1'}</i>{' '}
                Senha
              </span>
              <span className={etapaConfirmacao === 'codigo' ? 'active' : ''}>
                <i>2</i> Google Authenticator
              </span>
            </div>
          )}
        </header>
        {precisaConfigurar ? (
          etapaConfig === 'aviso' ? (
            <div className="mfa-required-content">
              <section className="mfa-required-panel" aria-label="Como funciona a proteção">
                <div className="mfa-required-method">
                  <div className="mfa-required-symbol">
                    <img src="/assets/seguranca/google-authenticator.svg" alt="" />
                  </div>
                  <div>
                    <b>Senha e Google Authenticator</b>
                    <p>
                      Para proteger a oficina, aprovações, recusas e mudanças de nível exigem os
                      dois fatores.
                    </p>
                  </div>
                </div>
                <ul>
                  <li>
                    <Icone name="check" size={20} />
                    <span>Leva cerca de um minuto para configurar.</span>
                  </li>
                  <li>
                    <Icone name="check" size={20} />
                    <span>Você precisará do celular com o aplicativo autenticador.</span>
                  </li>
                </ul>
              </section>
              <button
                className="admin-confirm-primary"
                type="button"
                onClick={() => {
                  if (previsualizacao) {
                    fechar(true);
                    return;
                  }
                  setEtapaConfig('senha');
                  setErro('');
                }}
              >
                {previsualizacao ? 'Fechar prévia' : 'Configurar agora'}{' '}
                <Icone name="right" size={16} />
              </button>
            </div>
          ) : etapaConfig === 'senha' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void iniciarConfiguracao();
              }}
            >
              <div className="admin-confirm-account">
                <span>
                  {usuario?.nome.trim().charAt(0).toUpperCase() || <Icone name="user" size={18} />}
                </span>
                <div>
                  <b>{usuario?.nome?.trim() || 'Sua conta'}</b>
                  <small>Confirme sua identidade para iniciar o cadastro</small>
                </div>
                <Icone name="lock" size={16} />
              </div>
              <CampoSenha
                rotulo="Sua senha de acesso"
                valor={senha}
                aoAlterar={setSenha}
                foco
                desabilitado={ocupado}
                invalido={!!erro}
              />
              {erro && (
                <p className="admin-confirm-error" role="alert">
                  {erro}
                </p>
              )}
              <button className="admin-confirm-primary" type="submit" disabled={ocupado || !senha}>
                {ocupado ? 'Preparando…' : 'Continuar configuração'}
                <Icone name="right" size={16} />
              </button>
              <button
                className="admin-confirm-text-button"
                type="button"
                onClick={() => {
                  setEtapaConfig('aviso');
                  setSenha('');
                  setErro('');
                }}
              >
                Voltar
              </button>
            </form>
          ) : (
            <form onSubmit={(event) => void verificarConfiguracao(event)}>
              {cadastroMfa && (
                <>
                  <div className="mfa-setup-layout">
                    <div className="mfa-steps">
                      <span>
                        <b>1</b> Abra seu aplicativo autenticador.
                      </span>
                      <span>
                        <b>2</b> Escaneie o QR code abaixo.
                      </span>
                      <span>
                        <b>3</b> Digite o código que aparece no celular.
                      </span>
                    </div>
                    <div className="mfa-qr-frame">
                      <img src={cadastroMfa.qrCode} alt="QR code para configurar o autenticador" />
                    </div>
                  </div>
                  <details className="mfa-secret">
                    <summary>Não consegue ler o QR code?</summary>
                    <code>{cadastroMfa.secret}</code>
                  </details>
                  <CodigoAutenticador
                    id="admin-setup-code"
                    value={codigo}
                    onChange={setCodigo}
                    firstInputRef={primeiroDigito}
                    description="Digite o código atual do aplicativo para ativar a proteção."
                  />
                  {erro && (
                    <p className="admin-confirm-error" role="alert">
                      {erro}
                    </p>
                  )}
                  <button
                    className="admin-confirm-primary"
                    type="submit"
                    disabled={ocupado || codigo.length !== 6}
                  >
                    {ocupado ? 'Validando…' : 'Ativar e continuar'}
                    <Icone name="right" size={16} />
                  </button>
                  <button
                    className="admin-confirm-text-button"
                    type="button"
                    onClick={() => {
                      setEtapaConfig('senha');
                      setCadastroMfa(null);
                      setCodigo('');
                      setErro('');
                    }}
                  >
                    Voltar
                  </button>
                </>
              )}
            </form>
          )
        ) : (
          <form onSubmit={(evento) => void enviar(evento)}>
            <div className="admin-confirm-account">
              <span>
                {usuario?.nome.trim().charAt(0).toUpperCase() || <Icone name="user" size={18} />}
              </span>
              <div>
                <b>{usuario?.nome?.trim() || 'Sua conta'}</b>
                <small>
                  {[usuario?.perfil || 'Administrador', usuario?.email].filter(Boolean).join(' · ')}
                </small>
              </div>
              <Icone name="lock" size={16} />
            </div>
            {etapaConfirmacao === 'senha' && metodoConfirmacao !== 'autenticador' && (
              <>
                <CampoSenha
                  rotulo="Sua senha de acesso"
                  valor={senha}
                  aoAlterar={setSenha}
                  foco
                  desabilitado={ocupado || espera > 0}
                  invalido={!!erro}
                  descricaoId={erro ? 'admin-confirm-error' : 'admin-confirm-help'}
                />
                {!erro && (
                  <p
                    id="admin-confirm-help"
                    className="admin-confirm-help admin-confirm-inline-help"
                  >
                    Sua senha confirma que é você.
                  </p>
                )}
                {metodoConfirmacao === 'senha' && autenticadorAtivo && !previsualizacao && (
                  <button
                    type="button"
                    className="admin-confirm-switch"
                    disabled={ocupado}
                    onClick={() => {
                      setSenha('');
                      setErro('');
                      setMetodoConfirmacao('autenticador');
                      setEtapaConfirmacao('codigo');
                    }}
                  >
                    Usar o código do Google Authenticator
                  </button>
                )}
                {erro && (
                  <p id="admin-confirm-error" className="admin-confirm-error" role="alert">
                    {erro}
                  </p>
                )}
                {espera > 0 && (
                  <p className="admin-confirm-wait" role="status">
                    <Icone name="clock" size={16} /> Nova tentativa em {Math.floor(espera / 60)}:
                    {String(espera % 60).padStart(2, '0')}
                  </p>
                )}
                <div className="admin-confirm-actions">
                  <button
                    className="admin-confirm-text-button"
                    type="button"
                    disabled={ocupado}
                    onClick={() => fechar(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="admin-confirm-primary"
                    type="submit"
                    disabled={
                      ocupado || consultandoProtecao || (!previsualizacao && !senha) || espera > 0
                    }
                  >
                    {previsualizacao
                      ? metodoConfirmacao === 'ambos' && etapaConfirmacao === 'senha'
                        ? 'Continuar para o autenticador'
                        : 'Fechar prévia'
                      : ocupado
                        ? 'Verificando senha…'
                        : metodoConfirmacao === 'ambos'
                          ? 'Continuar'
                          : 'Confirmar e continuar'}
                    <Icone name="right" size={16} />
                  </button>
                </div>
              </>
            )}
            {(etapaConfirmacao === 'codigo' || metodoConfirmacao === 'autenticador') && (
              <>
                <CodigoAutenticador
                  id="admin-confirm-code"
                  value={codigo}
                  onChange={setCodigo}
                  firstInputRef={primeiroDigito}
                  disabled={ocupado || espera > 0}
                  description={
                    promocaoSuperadmin
                      ? 'Digite o código de 6 dígitos do aplicativo.'
                      : 'Digite os 6 dígitos exibidos no Google Authenticator.'
                  }
                />
                {erro && (
                  <p id="admin-confirm-error" className="admin-confirm-error" role="alert">
                    {erro}
                  </p>
                )}
                {metodoConfirmacao === 'autenticador' && !previsualizacao && (
                  <button
                    type="button"
                    className="admin-confirm-switch"
                    disabled={ocupado}
                    onClick={() => {
                      setCodigo('');
                      setErro('');
                      setMetodoConfirmacao('senha');
                      setEtapaConfirmacao('senha');
                    }}
                  >
                    Usar minha senha
                  </button>
                )}
                {espera > 0 && (
                  <p className="admin-confirm-wait" role="status">
                    <Icone name="clock" size={16} /> Nova tentativa em {Math.floor(espera / 60)}:
                    {String(espera % 60).padStart(2, '0')}
                  </p>
                )}
                <div className="admin-confirm-actions">
                  {metodoConfirmacao !== 'ambos' && (
                    <button
                      className="admin-confirm-text-button"
                      type="button"
                      disabled={ocupado}
                      onClick={() => fechar(false)}
                    >
                      Cancelar
                    </button>
                  )}
                  {metodoConfirmacao === 'ambos' && (
                    <button
                      className="admin-confirm-text-button"
                      type="button"
                      disabled={ocupado}
                      onClick={() => {
                        setSenha('');
                        setCodigo('');
                        setErro('');
                        setEtapaConfirmacao('senha');
                      }}
                    >
                      Voltar para a senha
                    </button>
                  )}
                  <button
                    className="admin-confirm-primary"
                    type="submit"
                    disabled={ocupado || (!previsualizacao && codigo.length !== 6) || espera > 0}
                  >
                    {previsualizacao
                      ? 'Fechar prévia'
                      : ocupado
                        ? 'Verificando código…'
                        : promocaoSuperadmin
                          ? 'Confirmar promoção'
                          : 'Confirmar e continuar'}
                    <Icone name="right" size={16} />
                  </button>
                </div>
              </>
            )}
          </form>
        )}
        <footer className="admin-confirm-footnote">
          <Icone name="lock" size={13} />{' '}
          {previsualizacao
            ? 'Prévia visual: nenhuma credencial será validada ou autorização criada.'
            : promocaoSuperadmin
              ? 'A promoção só será aplicada depois da confirmação.'
              : contexto.nivel === 'sensivel'
                ? 'Depois de confirmar, as próximas ações ficam liberadas enquanto você estiver usando o sistema (30 min sem uso encerram).'
                : contexto.nivel === 'critica'
                  ? 'Mudanças de acesso e segurança pedem uma confirmação recente.'
                  : 'Somente para sua conta e este acesso.'}
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}
