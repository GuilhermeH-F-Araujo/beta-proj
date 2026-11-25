import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import EstudioMiniatura from './miniaturas/EstudioMiniatura';
import LogoEstacao from './LogoEstacao';
import { Icone } from './MenuAdmin';
import './miniaturas/miniaturas.css';
import { registrarEdicaoMiniatura } from '../services/edicaoMiniatura';
export default function ModalPreviaModelo({
  currentModel,
  motorcycleId,
  pedidoId,
  escopoRascunho,
  onClose,
  onChanged,
}: {
  currentModel: string;
  motorcycleId?: number;
  pedidoId?: string;
  escopoRascunho?: string;
  orderId?: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const elemento = dialogo.current;
    const focoAnterior = document.activeElement as HTMLElement | null;
    elemento?.showModal();
    const encerrarEdicao = registrarEdicaoMiniatura();
    return () => {
      elemento?.close();
      encerrarEdicao();
      if (focoAnterior?.isConnected) focoAnterior.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialogo}
      className="mini-dialog mini-studio-dialog"
      aria-labelledby="mini-previa-titulo"
      onCancel={onClose}
    >
      <header className="mini-studio-title">
        <div>
          <LogoEstacao className="mini-studio-logo" />
          <span className="mini-studio-title-divider" aria-hidden="true" />
          <h1 id="mini-previa-titulo">Gerar miniatura da moto</h1>
        </div>
        <button type="button" aria-label="Fechar estúdio" onClick={onClose}>
          <Icone name="close" size={28} />
        </button>
      </header>
      <EstudioMiniatura
        pedidoId={pedidoId}
        escopoRascunho={escopoRascunho}
        modeloInicial={currentModel}
        motoId={motorcycleId}
        aoPublicar={() => { try { onChanged(); } finally { onClose(); } }}
        aoCancelar={onClose}
      />
    </dialog>,
    document.body,
  );
}
