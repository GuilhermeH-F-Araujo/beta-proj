import { useFocoModal } from '../hooks/useFocoModal';
import { createPortal } from 'react-dom';
import LogoEstacao from './LogoEstacao';
import { Icone } from './MenuAdmin';
import './modais-administrativos.css';

export function compartilharAcesso(
  pessoa: { nome: string; email: string; telefone: string },
  senha: string,
) {
  const telefone = pessoa.telefone.replace(/\D/g, '');
  const numero = telefone.length === 10 || telefone.length === 11 ? `55${telefone}` : telefone;
  if (!/^55[1-9]\d{9,10}$/.test(numero))
    return 'O funcionário precisa ter um telefone válido para compartilhar pelo WhatsApp.';
  if (!senha) return 'A senha não está mais disponível. Redefina-a antes de compartilhar.';
  const texto = `Olá, ${pessoa.nome.trim().split(/\s+/)[0]}! Seu acesso à Estação Motos está pronto.\n\nE-mail: ${pessoa.email}\nSenha: ${senha}\n\nAltere sua senha depois do primeiro acesso.`;
  window.open(
    `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,
    '_blank',
    'noopener,noreferrer',
  );
  return '';
}

export default function ModalSucessoUsuario({
  nome,
  cargo,
  email,
  aprovacaoPendente,
  erro,
  replaceBackground = false,
  aoCompartilhar,
  aoFechar,
}: {
  nome: string;
  cargo: string;
  email: string;
  aprovacaoPendente: boolean;
  erro: string;
  replaceBackground?: boolean;
  aoCompartilhar: () => void;
  aoFechar: () => void;
}) {
  const referenciaFoco = useFocoModal<HTMLElement>();
  return createPortal(
    <div
      className={`nam-backdrop${replaceBackground ? ' nam-backdrop-replacement' : ''}`}
      role="presentation"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <section
        className="nam-dialog nam-user nam-reworked nam-user-created"
        role="dialog"
        ref={referenciaFoco}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="nam-success-title"
      >
        <header className="nam-hero nam-hero-success">
          <div className="nam-hero-mark">
            <LogoEstacao />
          </div>
          <div className="nam-hero-copy">
            <span className="nam-kicker">EQUIPE E ACESSO</span>
            <h2 id="nam-success-title">
              {aprovacaoPendente ? 'Aguardando aprovação do dono' : 'Cadastro concluído'}
            </h2>
          </div>
          <button type="button" className="nam-close" onClick={aoFechar} aria-label="Fechar">
            <Icone name="close" size={18} />
          </button>
        </header>
        <div className={`nam-success-content${aprovacaoPendente ? ' is-pending' : ''}`}>
          <section
            className={`nam-success-result${aprovacaoPendente ? ' is-pending' : ''}`}
            role="status"
          >
            <span className="nam-success-result-icon">
              <Icone name={aprovacaoPendente ? 'clock' : 'check-simple'} size={36} />
            </span>
            <span className="nam-success-result-copy">
              <strong>
                {aprovacaoPendente
                  ? 'Solicitação enviada para aprovação'
                  : 'Acesso criado com sucesso'}
              </strong>
              <small>
                {aprovacaoPendente
                  ? `${nome} poderá acessar o sistema depois da aprovação.`
                  : `${nome} já pode acessar o painel.`}
              </small>
            </span>
          </section>
          <section className="nam-success-person" aria-label="Dados da pessoa cadastrada">
            <span className="nam-success-avatar">
              {nome
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((parte) => parte[0])
                .join('')
                .toUpperCase() || 'U'}
            </span>
            <span className="nam-success-person-copy">
              <strong>{nome}</strong>
              <small>
                {cargo} <span aria-hidden="true">·</span> {email}
              </small>
            </span>
            <span className={`nam-success-access${aprovacaoPendente ? ' is-pending' : ''}`}>
              <Icone name={aprovacaoPendente ? 'clock' : 'check-simple'} size={15} />
              {aprovacaoPendente ? 'Aguardando aprovação' : 'Acesso ativo'}
            </span>
          </section>
          {aprovacaoPendente ? (
            <section className="nam-success-notice" role="note">
              <Icone name="shield" size={18} />
              <p>
                A senha está protegida e só será usada para criar o login depois da aprovação da
                dona, em Configurações → Segurança.
              </p>
            </section>
          ) : (
            <section className="nam-success-share" aria-labelledby="nam-share-title">
              <div className="nam-success-share-heading">
                <span className="nam-success-whatsapp-mark">
                  <Icone name="whatsapp" size={36} />
                </span>
                <span>
                  <strong id="nam-share-title">Compartilhe o acesso</strong>
                  <small>Envie os dados de acesso para o funcionário.</small>
                </span>
              </div>
              <button className="nam-success-whatsapp" type="button" onClick={aoCompartilhar}>
                <Icone name="whatsapp" size={20} />
                <span>Enviar credenciais pelo WhatsApp</span>
                <Icone name="right" size={15} />
              </button>
              <small className="nam-success-privacy">
                <Icone name="info" size={16} />A senha só será incluída na mensagem enviada.
              </small>
            </section>
          )}
          {erro && (
            <p className="nam-error" role="alert">
              {erro}
            </p>
          )}
        </div>
        <footer className="nam-footer">
          <button className="nam-submit" type="button" onClick={aoFechar}>
            Concluir
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
