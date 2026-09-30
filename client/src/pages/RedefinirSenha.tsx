import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvisoAutenticacao from '../components/AvisoAutenticacao';
import TelaFigma from '../components/TelaFigma';
import { redefinirSenha } from '../services/apiAutenticacao';

type RecoveryCredentials = { tokenHash?: string; accessToken?: string; refreshToken?: string; error?: string };
let cachedRecoveryLink: RecoveryCredentials | null = null;

function consumeRecoveryLink(): RecoveryCredentials {
  if (cachedRecoveryLink) return cachedRecoveryLink;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const tokenHash = query.get('token_hash') || undefined;
  const accessToken = hash.get('access_token') || undefined;
  const refreshToken = hash.get('refresh_token') || undefined;
  const error = query.get('error_description') || hash.get('error_description');

  // O código de recuperação não deve permanecer no histórico nem aparecer em links copiados.
  if (window.location.search || window.location.hash) {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }

  if (error || (!tokenHash && !(accessToken && refreshToken))) {
    return cachedRecoveryLink = { error: 'O link de recuperação expirou ou está incompleto. Solicite um novo e-mail.' };
  }
  if (tokenHash && query.get('type') !== 'recovery') {
    return cachedRecoveryLink = { error: 'Este link não é de recuperação de senha. Solicite um novo e-mail.' };
  }
  if (!tokenHash && hash.get('type') !== 'recovery') {
    return cachedRecoveryLink = { error: 'Este link não é de recuperação de senha. Solicite um novo e-mail.' };
  }
  return cachedRecoveryLink = { tokenHash, accessToken, refreshToken };
}

export default function RedefinirSenha() {
  const navigate = useNavigate();
  const [credentials] = useState(consumeRecoveryLink);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(credentials.error || '');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 8) return setError('A nova senha deve ter pelo menos 8 caracteres.');
    if (password !== confirmation) return setError('As senhas digitadas não são iguais.');

    setLoading(true);
    try {
      await redefinirSenha({
        password,
        tokenHash: credentials.tokenHash,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
      });
      setPassword('');
      setConfirmation('');
      cachedRecoveryLink = null;
      setComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha agora.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <TelaFigma label="Redefinir senha">
      <div className="forgot-screen reset-screen">
        <div className="forgot-panel-glow" aria-hidden="true" />
        <div className="forgot-lock-icon" aria-hidden="true"><img src="/assets/cadeado-recuperacao.svg" alt="" /></div>

        <section className="forgot-copy reset-copy">
          <h1>{complete ? <>Senha <strong>alterada</strong></> : <>Nova <strong>senha</strong></>}</h1>
          <p>{complete ? 'Pronto! Agora você pode entrar no painel com sua nova senha.' : 'Crie uma senha segura para acessar o painel administrativo.'}</p>
        </section>

        <form className="forgot-form-v2 reset-form" onSubmit={handleSubmit} noValidate>
          {error && <AvisoAutenticacao type="error" message={error} onClose={() => setError('')} />}
          {complete ? (
            <button className="forgot-submit-v2 reset-primary" type="button" onClick={() => navigate('/login', { replace: true })}>
              Entrar com a nova senha <span className="forgot-submit-chevron" aria-hidden="true" />
            </button>
          ) : credentials.error ? (
            <button className="forgot-submit-v2 reset-primary" type="button" onClick={() => navigate('/esqueci-a-senha', { replace: true })}>
              Solicitar outro link <span className="forgot-submit-chevron" aria-hidden="true" />
            </button>
          ) : (
            <>
              <label className="forgot-email-box reset-password-box">
                <span className="reset-field-icon" aria-hidden="true"><img src="/assets/cadeado.svg" alt="" /></span>
                <input aria-label="Nova senha" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Nova senha (mínimo 8 caracteres)" value={password} onChange={event => setPassword(event.target.value)} />
              </label>
              <label className="forgot-email-box reset-confirm-box">
                <span className="reset-field-icon" aria-hidden="true"><img src="/assets/cadeado.svg" alt="" /></span>
                <input aria-label="Confirme a nova senha" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Confirme a nova senha" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
              </label>
              <label className="reset-show-password"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} /> Mostrar senhas</label>
              <button className="forgot-submit-v2 reset-primary" type="submit" disabled={loading}>
                {loading ? 'Salvando nova senha...' : 'Salvar nova senha'} <span className="forgot-submit-chevron" aria-hidden="true" />
              </button>
            </>
          )}
          <button className="forgot-back-link reset-back" type="button" onClick={() => navigate('/login', { replace: true })}>
            <svg className="forgot-back-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5M10 7L5 12L10 17" /></svg>
            Voltar para o login
          </button>
        </form>
        <div className="forgot-admin-mark" aria-hidden="true"><span className="forgot-admin-mark-icon" /><span>PAINEL ADMINISTRATIVO</span></div>
      </div>
    </TelaFigma>
  );
}
