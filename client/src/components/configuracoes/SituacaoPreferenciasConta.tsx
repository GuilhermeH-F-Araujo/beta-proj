import { useSyncExternalStore } from 'react';
import {
  estadoSincronizacao,
  observarSincronizacao,
  sincronizarPreferenciasConta,
  temAlteracoesPendentes,
} from '../../services/sincronizacaoConta';
import { Icone } from '../MenuAdmin';
export default function SituacaoPreferenciasConta({
  compacta = false,
  modoEditor = false,
}: {
  compacta?: boolean;
  modoEditor?: boolean;
}) {
  const situacao = useSyncExternalStore(observarSincronizacao, estadoSincronizacao);
  const rotulo = {
    salvo: 'Salvo na conta',
    erro: 'Falha ao sincronizar',
    salvando: 'Salvando',
    carregando: 'Carregando',
  };
  return (
    <div
      className={`${compacta ? 'canvas-sync' : 'cfg-account-sync'} ${situacao.estado}${modoEditor ? ' modo-editor' : ''}`}
      role="status"
      aria-live="polite"
    >
      {modoEditor ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M19 18H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 19 18Z" />
          <path d="m9.5 14 2 2 4-4" />
        </svg>
      ) : (
        <Icone
          name={
            situacao.estado === 'salvo' ? 'check' : situacao.estado === 'erro' ? 'info' : 'refresh'
          }
          size={17}
        />
      )}
      <span title={situacao.mensagem}>
        {modoEditor && situacao.estado === 'salvo'
          ? 'Rascunho salvo automaticamente'
          : compacta
            ? rotulo[situacao.estado]
            : situacao.mensagem}
      </span>
      {situacao.estado === 'erro' && (
        <button
          className="cfg-text-button"
          aria-label="Tentar sincronizar preferências"
          title="Tentar sincronizar"
          onClick={() => {
            if (temAlteracoesPendentes()) void sincronizarPreferenciasConta();
            else window.dispatchEvent(new Event('account-preferences-reload'));
          }}
        >
          Tentar sincronizar
        </button>
      )}
    </div>
  );
}
