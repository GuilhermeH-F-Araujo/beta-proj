import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AvisoAutenticacao from '../components/AvisoAutenticacao';
import TelaFigma from '../components/TelaFigma';
import { buscarUsuarioAtual, entrar } from '../services/apiAutenticacao';

const CHAVE_EMAIL_LEMBRADO = 'perc3-remembered-email';
function lerEmailLembrado() {
  try {
    return localStorage.getItem(CHAVE_EMAIL_LEMBRADO) ?? '';
  } catch {
    return '';
  }
}

export default function Entrar() {
  const navegar = useNavigate();
  const destino = '/dashboard';
  const [identificador, setIdentificador] = useState(lerEmailLembrado);
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(() => !!lerEmailLembrado());
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    buscarUsuarioAtual()
      .then(() => {
        if (ativo) navegar(destino, { replace: true });
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [navegar, destino]);

  async function tratarEnvio(evento: FormEvent) {
    evento.preventDefault();
    setErro('');

    if (!identificador.trim() || !senha) {
      setErro('Preencha seu e-mail e sua senha para acessar o painel.');
      return;
    }

    const normalizadoEmail = identificador.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizadoEmail)) {
      setErro('Digite um endereço de e-mail válido para continuar.');
      return;
    }

    setCarregando(true);
    try {
      await entrar({ identifier: normalizadoEmail, password: senha, remember: lembrar });
      try {
        if (lembrar) localStorage.setItem(CHAVE_EMAIL_LEMBRADO, normalizadoEmail);
        else localStorage.removeItem(CHAVE_EMAIL_LEMBRADO);
      } catch {
        /* Cookies de sessao continuam funcionando se o navegador bloquear armazenamento local. */
      }
      navegar(destino, { replace: true });
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível concluir o acesso.',
      );
    } finally {
      setCarregando(false);
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

      <form className="login-form" onSubmit={tratarEnvio} noValidate>
        {erro && <AvisoAutenticacao type="error" message={erro} onClose={() => setErro('')} />}

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
            value={identificador}
            onChange={(eventoRecebido) => setIdentificador(eventoRecebido.target.value)}
          />
        </div>

        <div className="field field-login-password">
          <span className="field-icon lock-icon-image" aria-hidden="true">
            <img src="/assets/cadeado.svg" alt="" />
          </span>
          <input
            aria-label="Senha"
            type={mostrarSenha ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Senha"
            value={senha}
            onChange={(eventoRecebido) => setSenha(eventoRecebido.target.value)}
          />
          <button
            className={`eye-button ${mostrarSenha ? 'is-visible' : ''}`}
            type="button"
            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={mostrarSenha}
            onClick={() => setMostrarSenha((valor) => !valor)}
          >
            {mostrarSenha ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3 21 21M10.6 6.1A12 12 0 0 1 12 6c6.4 0 10 6 10 6a15 15 0 0 1-3 3.5M6.2 6.2C3.5 8 2 12 2 12s3.6 6 10 6c1.7 0 3.2-.4 4.4-1" />
                <path d="M10 10a3 3 0 0 0 4 4" />
              </svg>
            )}
          </button>
        </div>

        <label className="remember-control">
          <input
            type="checkbox"
            checked={lembrar}
            onChange={(eventoRecebido) => {
              setLembrar(eventoRecebido.target.checked);
              if (!eventoRecebido.target.checked) {
                try {
                  localStorage.removeItem(CHAVE_EMAIL_LEMBRADO);
                } catch {
                  /* O navegador pode bloquear o armazenamento local. */
                }
              }
            }}
          />
          <span className="custom-checkbox" />
          <span>Lembrar de mim</span>
        </label>

        <button className="forgot-link" type="button" onClick={() => navegar('/esqueci-a-senha')}>
          Esqueci minha senha?
        </button>

        <button className="login-button" type="submit" disabled={carregando}>
          <span>{carregando ? 'ENTRANDO' : 'ENTRAR'}</span>
          <span className="login-arrow-css" aria-hidden="true">
            →
          </span>
        </button>
      </form>
    </TelaFigma>
  );
}
