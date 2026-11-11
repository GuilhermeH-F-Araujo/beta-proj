import { useSyncExternalStore } from "react";
import { Icon } from "../MenuAdmin";
import {
  observarSincronizacao,
  estadoSincronizacao,
  sincronizarPreferenciasConta,
  temAlteracoesPendentes,
} from "../../services/sincronizacaoConta";
export default function StatusPreferenciasConta() {
  const status = useSyncExternalStore(
    observarSincronizacao,
    estadoSincronizacao,
  );
  return (
    <div
      className={`cfg-account-sync ${status.estado}`}
      role="status"
      aria-live="polite"
    >
      <Icon
        name={
          status.estado === "salvo"
            ? "check"
            : status.estado === "erro"
              ? "info"
              : "refresh"
        }
        size={17}
      />
      <span>{status.mensagem}</span>
      {status.estado === "erro" && (
        <button
          className="cfg-text-button"
          onClick={() => {
            if (temAlteracoesPendentes()) void sincronizarPreferenciasConta();
            else window.dispatchEvent(new Event("account-preferences-reload"));
          }}
        >
          Tentar sincronizar
        </button>
      )}
    </div>
  );
}
