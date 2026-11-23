import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvisoAutenticacao from '../components/AvisoAutenticacao';
import TelaFigma from '../components/TelaFigma';
import { solicitarRecuperacaoSenha } from '../services/apiAutenticacao';

export default function EsqueciSenha() {
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  async function tratarEnvio(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setMensagem('');

    if (!email.trim()) {
      setErro('Informe o e-mail cadastrado para receber as instruções.');
      return;
    }

    setCarregando(true);
    try {
      const response = await solicitarRecuperacaoSenha(email.trim());
      setMensagem(response.message);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível enviar as instruções agora.',
      );
    } finally {
      setCarregando(false);
    }
  }

  return (
    <TelaFigma label="Recuperação de senha">
      <div className="forgot-screen">
        <div className="forgot-panel-glow" aria-hidden="true" />

        <div className="forgot-lock-icon" aria-hidden="true">
          <img src="/assets/cadeado-recuperacao.svg" alt="" />
        </div>

        <section className="forgot-copy">
          <h1>
            Esqueci minha <strong>senha</strong>
          </h1>
          <p>
            Informe seu e-mail cadastrado para
            <br />
            receber as instruções de redefinição de senha.
          </p>
        </section>

        <form className="formulario-recuperacao" onSubmit={tratarEnvio} noValidate>
          {erro && <AvisoAutenticacao type="error" message={erro} onClose={() => setErro('')} />}
          {mensagem && (
            <AvisoAutenticacao type="success" message={mensagem} onClose={() => setMensagem('')} />
          )}

          <label className="forgot-email-box">
            <span className="forgot-email-icon" aria-hidden="true" />
            <input
              aria-label="E-mail cadastrado"
              type="email"
              autoComplete="email"
              placeholder="Digite seu e-mail cadastrado"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
            />
          </label>

          <button className="botao-recuperacao" type="submit" disabled={carregando}>
            <span>{carregando ? 'Enviando...' : 'Enviar instruções'}</span>
            <span className="forgot-submit-chevron" aria-hidden="true" />
          </button>

          <div className="forgot-or" aria-hidden="true">
            <span />
            <em>ou</em>
            <span />
          </div>

          <div className="forgot-support-card">
            <span className="forgot-support-icon" aria-hidden="true" />
            <div>
              <strong>Prefere outro método?</strong>
              <p>
                Fale com Suporte ao cliente em <b>suporte@estacaomotos.com</b>
              </p>
            </div>
          </div>

          <button className="forgot-back-link" type="button" onClick={() => navegar('/login')}>
            <svg className="forgot-back-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="M10 7L5 12L10 17" />
            </svg>
            <span>Voltar para o login</span>
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
