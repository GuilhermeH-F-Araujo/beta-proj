import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import MiniaturaRapida from './miniaturas/MiniaturaRapida';
import { Icone } from './MenuAdmin';
import './miniaturas/miniaturas.css';
export default function ModalPreviaModelo({
  currentModel,
  motorcycleId,
  onClose,
  onChanged,
}: {
  currentModel: string;
  motorcycleId?: number;
  orderId?: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const elemento = dialogo.current;
    elemento?.showModal();
    return () => elemento?.close();
  }, []);
  return createPortal(
    <dialog ref={dialogo} className="mini-dialog" onCancel={onClose}>
      <header className="mini-dialog-title">
        <div>
          <span className="mini-eyebrow">ESTÚDIO DE MINIATURAS</span>
          <h1>Gerar miniatura da moto</h1>
          <p>Informe o modelo. A IA pesquisa e prepara a imagem para você.</p>
        </div>
        <button type="button" aria-label="Fechar estúdio" onClick={onClose}>
          <Icone name="close" size={22} />
        </button>
      </header>
      <MiniaturaRapida modeloInicial={currentModel} motoId={motorcycleId} aoPublicar={onChanged} />
    </dialog>,
    document.body,
  );
}
