import './miniaturas.css';
type Props = {
  mensagem: string;
  titulo?: string;
  aoFechar: () => void;
  acao?: { rotulo: string; executar: () => void };
};

// Pop-up unico para qualquer erro do estudio: texto grande, um botao claro e
// uma acao opcional (ex.: enviar foto) para quem nao e da area tecnica.
export default function PopupErroMiniatura({
  mensagem,
  titulo = 'Não foi possível concluir',
  aoFechar,
  acao,
}: Props) {
  return (
    <div
      className="mini-error-overlay"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          evento.stopPropagation();
          aoFechar();
        }
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mini-erro-titulo"
        aria-describedby="mini-erro-texto"
        className="mini-error-popup"
      >
        <div className="mini-error-icon" aria-hidden="true">
          !
        </div>
        <h2 id="mini-erro-titulo">{titulo}</h2>
        <p id="mini-erro-texto">{mensagem}</p>
        <div className="mini-error-actions">
          {acao && (
            <button
              type="button"
              className="mini-primary"
              onClick={() => {
                aoFechar();
                acao.executar();
              }}
            >
              {acao.rotulo}
            </button>
          )}
          <button
            autoFocus
            type="button"
            className={acao ? 'mini-error-secondary' : 'mini-primary'}
            onClick={aoFechar}
          >
            Entendi
          </button>
        </div>
      </section>
    </div>
  );
}
