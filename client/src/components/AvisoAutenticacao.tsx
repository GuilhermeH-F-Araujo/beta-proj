import { createPortal } from 'react-dom';

type Props = {
  type: 'error' | 'success';
  message: string;
  onClose: () => void;
};

export default function AvisoAutenticacao({
  type: tipo,
  message: mensagem,
  onClose: aoFechar,
}: Props) {
  const aviso = (
    <div className={`auth-notice ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <div className="auth-notice-icon" aria-hidden="true">
        {tipo === 'error' ? '!' : '✓'}
      </div>
      <div className="auth-notice-copy">
        <strong>{tipo === 'error' ? 'Não foi possível continuar' : 'Tudo certo'}</strong>
        <span>{mensagem}</span>
      </div>
      <button
        type="button"
        className="auth-notice-close"
        onClick={aoFechar}
        aria-label="Fechar mensagem"
      >
        ×
      </button>
    </div>
  );

  if (typeof document === 'undefined') return aviso;

  return createPortal(aviso, document.body);
}
