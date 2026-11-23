import { useEffect } from 'react';
import {
  atualizarCentralNotificacoes,
  configurarCentralNotificacoes,
} from '../../services/centralNotificacoes';
import { observarDados } from '../../services/atualizacaoDados';
import { prepararAudioNotificacoes } from '../../services/sonsNotificacao';
export default function MonitorNotificacoes({ usuarioId }: { usuarioId: string }) {
  useEffect(() => {
    configurarCentralNotificacoes(usuarioId);
    void atualizarCentralNotificacoes();
    const atualizar = () => {
      void atualizarCentralNotificacoes();
    };
    const desbloquear = () => {
      void prepararAudioNotificacoes();
    };
    const pararObservacao = observarDados(atualizar);
    window.addEventListener('admin-notifications-refresh', atualizar);
    window.addEventListener('focus', atualizar);
    window.addEventListener('pointerdown', desbloquear, { passive: true });
    window.addEventListener('keydown', desbloquear);
    return () => {
      pararObservacao();
      window.removeEventListener('admin-notifications-refresh', atualizar);
      window.removeEventListener('focus', atualizar);
      window.removeEventListener('pointerdown', desbloquear);
      window.removeEventListener('keydown', desbloquear);
    };
  }, [usuarioId]);
  return null;
}
