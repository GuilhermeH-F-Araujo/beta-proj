import { createPortal } from 'react-dom';

type Props = {
  type: 'error' | 'success';
  message: string;
  onClose: () => void;
};

export default function AvisoAutenticacao({ type, message, onClose }: Props) {
  const notice = (
    <div className={`auth-notice ${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <div className="auth-notice-icon" aria-hidden="true">
        {type === 'error' ? '!' : '✓'}
      </div>
      <div className="auth-notice-copy">
        <strong>{type === 'error' ? 'Não foi possível continuar' : 'Tudo certo'}</strong>
        <span>{message}</span>
      </div>
      <button type="button" className="auth-notice-close" onClick={onClose} aria-label="Fechar mensagem">
        ×
      </button>
    </div>
  );

  if (typeof document === 'undefined') return notice;

  return createPortal(notice, document.body);
}
