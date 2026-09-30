import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AvisoAutenticacao from '../components/AvisoAutenticacao';
import TelaFigma from '../components/TelaFigma';
import { buscarUsuarioAtual, login } from '../services/apiAutenticacao';

const rememberedEmailKey = 'perc3-remembered-email';
function rememberedEmail() {
  try { return localStorage.getItem(rememberedEmailKey) ?? ''; }
  catch { return ''; }
}

export default function Entrar() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => !!rememberedEmail());
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    buscarUsuarioAtual().then(() => { if (active) navigate('/ordens-de-servico', { replace: true }); }).catch(() => {});
    return () => { active = false; };
  }, [navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!identifier.trim() || !password) {
      setError('Preencha seu e-mail e sua senha para acessar o painel.');
      return;
    }

    const normalizedEmail = identifier.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Digite um endereço de e-mail válido para continuar.');
      return;
    }

    setLoading(true);
    try {
      await login({ identifier: normalizedEmail, password, remember });
      try {
        if (remember) localStorage.setItem(rememberedEmailKey, normalizedEmail);
        else localStorage.removeItem(rememberedEmailKey);
      } catch { /* Cookies de sessão continuam funcionando se o navegador bloquear armazenamento local. */ }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o acesso.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <TelaFigma label="Entrar do painel administrativo">
      <div className="auth-panel-glow" aria-hidden="true" />

      <section className="login-brand" aria-label="Estação Motos">
        <img src="/assets/estacao-motos-logo.png" alt="Estação Motos" />
      </section>

      <section className="login-heading">
        <span className="login-kicker">PAINEL ADMINISTRATIVO</span>
        <h1>BEM-VINDO DE VOLTA!</h1>
        <p>
          Faça login para acessar o <strong>painel administrativo</strong>
        </p>
      </section>

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {error && <AvisoAutenticacao type="error" message={error} onClose={() => setError('')} />}

        <div className="field field-login-email">
          <span className="field-icon mail-icon-image" aria-hidden="true">
            <img src="/assets/email.svg" alt="" />
          </span>
          <input
            aria-label="E-mail"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="E-mail"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>

        <div className="field field-login-password">
          <span className="field-icon lock-icon-image" aria-hidden="true">
            <img src="/assets/cadeado.svg" alt="" />
          </span>
          <input
            aria-label="Senha"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className={`eye-button ${showPassword ? 'is-visible' : ''}`}
            type="button"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3 21 21M10.6 6.1A12 12 0 0 1 12 6c6.4 0 10 6 10 6a15 15 0 0 1-3 3.5M6.2 6.2C3.5 8 2 12 2 12s3.6 6 10 6c1.7 0 3.2-.4 4.4-1"/><path d="M10 10a3 3 0 0 0 4 4"/></svg>}
          </button>
        </div>

        <label className="remember-control">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              if (!e.target.checked) {
                try { localStorage.removeItem(rememberedEmailKey); } catch { /* O navegador pode bloquear o armazenamento local. */ }
              }
            }}
          />
          <span className="custom-checkbox" />
          <span>Lembrar de mim</span>
        </label>

        <button
          className="forgot-link"
          type="button"
          onClick={() => navigate('/esqueci-a-senha')}
        >
          Esqueci minha senha?
        </button>

        <button className="login-button" type="submit" disabled={loading}>
          <span>{loading ? 'ENTRANDO' : 'ENTRAR'}</span>
          <span className="login-arrow-css" aria-hidden="true">→</span>
        </button>
      </form>
    </TelaFigma>
  );
}
