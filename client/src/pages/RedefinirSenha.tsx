import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvisoAutenticacao from '../components/AvisoAutenticacao';
import TelaFigma from '../components/TelaFigma';
import { redefinirSenha } from '../services/apiAutenticacao';

type RecoveryCredenciais = {
  tokenHash?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
};
let emMemoriaRecoveryLigacao: RecoveryCredenciais | null = null;

function consumeRecoveryLigacao(): RecoveryCredenciais {
  if (emMemoriaRecoveryLigacao) return emMemoriaRecoveryLigacao;
  const consulta = new URLSearchParams(window.location.search);
  const resumo = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const resumoToken = consulta.get('token_hash') || undefined;
  const tokenAcesso = resumo.get('access_token') || undefined;
  const tokenRenovacao = resumo.get('refresh_token') || undefined;
  const erro = consulta.get('error_description') || resumo.get('error_description');

  // O codigo de recuperacao nao deve permanecer no historico nem aparecer em links copiados.
  if (window.location.search || window.location.hash) {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }

  if (erro || (!resumoToken && !(tokenAcesso && tokenRenovacao))) {
    return (emMemoriaRecoveryLigacao = {
      error: 'O link de recuperação expirou ou está incompleto. Solicite um novo e-mail.',
    });
  }
  if (resumoToken && consulta.get('type') !== 'recovery') {
    return (emMemoriaRecoveryLigacao = {
      error: 'Este link não é de recuperação de senha. Solicite um novo e-mail.',
    });
  }
  if (!resumoToken && resumo.get('type') !== 'recovery') {
    return (emMemoriaRecoveryLigacao = {
      error: 'Este link não é de recuperação de senha. Solicite um novo e-mail.',
    });
  }
  return (emMemoriaRecoveryLigacao = {
    tokenHash: resumoToken,
    accessToken: tokenAcesso,
    refreshToken: tokenRenovacao,
  });
}

export default function RedefinirSenha() {
  const navegar = useNavigate();
  const [credenciais] = useState(consumeRecoveryLigacao);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setShowSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [completar, setCompletar] = useState(false);
  const [erro, setErro] = useState(credenciais.error || '');

  async function tratarEnvio(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    if (senha.length < 8) return setErro('A nova senha deve ter pelo menos 8 caracteres.');
    if (senha !== confirmacao) return setErro('As senhas digitadas não são iguais.');

    setCarregando(true);
    try {
      await redefinirSenha({
        password: senha,
        tokenHash: credenciais.tokenHash,
        accessToken: credenciais.accessToken,
        refreshToken: credenciais.refreshToken,
      });
      setSenha('');
      setConfirmacao('');
      emMemoriaRecoveryLigacao = null;
      setCompletar(true);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível alterar a senha agora.',
      );
    } finally {
      setCarregando(false);
    }
  }

  return (
    <TelaFigma label="Redefinir senha">
      <div className="forgot-screen reset-screen">
        <div className="forgot-panel-glow" aria-hidden="true" />
        <div className="forgot-lock-icon" aria-hidden="true">
          <img src="/assets/cadeado-recuperacao.svg" alt="" />
        </div>

        <section className="forgot-copy reset-copy">
          <h1>
            {completar ? (
              <>
                Senha <strong>alterada</strong>
              </>
            ) : (
              <>
                Nova <strong>senha</strong>
              </>
            )}
          </h1>
          <p>
            {completar
              ? 'A senha da conta foi atualizada. Use a nova senha no aplicativo vinculado ao seu acesso.'
              : 'Crie uma nova senha segura para esta conta.'}
          </p>
        </section>

        <form className="formulario-recuperacao reset-form" onSubmit={tratarEnvio} noValidate>
          {erro && <AvisoAutenticacao type="error" message={erro} onClose={() => setErro('')} />}
          {completar ? (
            <button
              className="botao-recuperacao reset-primary"
              type="button"
              onClick={() => navegar('/login', { replace: true })}
            >
              Entrar com a nova senha <span className="forgot-submit-chevron" aria-hidden="true" />
            </button>
          ) : credenciais.error ? (
            <button
              className="botao-recuperacao reset-primary"
              type="button"
              onClick={() => navegar('/esqueci-a-senha', { replace: true })}
            >
              Solicitar outro link <span className="forgot-submit-chevron" aria-hidden="true" />
            </button>
          ) : (
            <>
              <label className="forgot-email-box reset-password-box">
                <span className="reset-field-icon" aria-hidden="true">
                  <img src="/assets/cadeado.svg" alt="" />
                </span>
                <input
                  aria-label="Nova senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Nova senha (mínimo 8 caracteres)"
                  value={senha}
                  onChange={(evento) => setSenha(evento.target.value)}
                />
              </label>
              <label className="forgot-email-box reset-confirm-box">
                <span className="reset-field-icon" aria-hidden="true">
                  <img src="/assets/cadeado.svg" alt="" />
                </span>
                <input
                  aria-label="Confirme a nova senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Confirme a nova senha"
                  value={confirmacao}
                  onChange={(evento) => setConfirmacao(evento.target.value)}
                />
              </label>
              <label className="reset-show-password">
                <input
                  type="checkbox"
                  checked={mostrarSenha}
                  onChange={(evento) => setShowSenha(evento.target.checked)}
                />{' '}
                Mostrar senhas
              </label>
              <button
                className="botao-recuperacao reset-primary"
                type="submit"
                disabled={carregando}
              >
                {carregando ? 'Salvando nova senha...' : 'Salvar nova senha'}{' '}
                <span className="forgot-submit-chevron" aria-hidden="true" />
              </button>
            </>
          )}
          <button
            className="forgot-back-link reset-back"
            type="button"
            onClick={() => navegar('/login', { replace: true })}
          >
            <svg className="forgot-back-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M19 12H5M10 7L5 12L10 17" />
            </svg>
            Voltar para o login
          </button>
        </form>
        <div className="forgot-admin-mark" aria-hidden="true">
          <span className="forgot-admin-mark-icon" />
          <span>PAINEL ADMINISTRATIVO</span>
        </div>
      </div>
    </TelaFigma>
  );
}
