import { createPortal } from 'react-dom';
import LogoEstacao from './LogoEstacao';
import { Icone } from './MenuAdmin';

export default function ModalSucessoUsuario({
  nome,
  cargo,
  telefone,
  aprovacaoPendente,
  erro,
  replaceBackground = false,
  aoCompartilhar,
  aoFechar,
}: {
  nome: string;
  cargo: string;
  telefone: string;
  aprovacaoPendente: boolean;
  erro: string;
  replaceBackground?: boolean;
  aoCompartilhar: () => void;
  aoFechar: () => void;
}) {
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
            <p>
              {aprovacaoPendente
                ? 'A solicitação foi enviada para análise.'
                : 'O acesso já está pronto para uso.'}
            </p>
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
              <Icone name={aprovacaoPendente ? 'clock' : 'check'} size={42} />
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
                  : `${nome} já pode acessar o sistema.`}
              </small>
            </span>
          </section>
          <section className="nam-success-person" aria-label="Dados da pessoa cadastrada">
            <span className="nam-success-avatar">{nome.trim().charAt(0).toUpperCase() || 'U'}</span>
            <span className="nam-success-person-copy">
              <strong>{nome}</strong>
              <small>
                {cargo} <span aria-hidden="true">·</span> {telefone}
              </small>
            </span>
            <span className={`nam-success-access${aprovacaoPendente ? ' is-pending' : ''}`}>
              <Icone name={aprovacaoPendente ? 'clock' : 'check'} size={15} />
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
                  <Icone name="whatsapp" size={25} />
                </span>
                <span>
                  <strong id="nam-share-title">Compartilhe o acesso</strong>
                  <small>Envie os dados de acesso diretamente para a pessoa.</small>
                </span>
              </div>
              <button className="nam-success-whatsapp" type="button" onClick={aoCompartilhar}>
                <Icone name="whatsapp" size={25} />
                <span>Enviar credenciais pelo WhatsApp</span>
                <Icone name="right" size={15} />
              </button>
              <small className="nam-success-privacy">
                <Icone name="lock" size={14} />A senha só será incluída na mensagem enviada.
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
          <span className="nam-footer-caption">
            {aprovacaoPendente
              ? 'Solicitação registrada com segurança.'
              : 'Cadastro salvo com segurança.'}
          </span>
          <button className="nam-submit" type="button" onClick={aoFechar}>
            Concluir
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
