import { useEffect, useRef, useState } from 'react';
import { sair as encerrarSessaoAtual } from '../../services/apiAutenticacao';
import { Icone } from '../MenuAdmin';
import {
  chaveInatividade,
  invalidarInatividadeConta,
  minutosInatividade,
} from '../../services/configuracoesSistema';
import './configuracoes-sistema.css';
import { CfgDialog } from './ElementosConfiguracoes';
export default function SessaoInativa({ usuarioId }: { usuarioId: string }) {
  const [restante, setRestante] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const ultimo = useRef(Date.now());
  const aviso = useRef(false);
  const previa = useRef(false);
  const saindo = useRef(false);
  const ultimaFalha = useRef(0);
  const ultimaGravacaoAtividade = useRef(0);
  const armazenamentoChave = `estacao-atividade-${usuarioId}`;
  function continuar() {
    if (saindo.current) return;
    ultimo.current = Date.now();
    try {
      localStorage.setItem(armazenamentoChave, String(ultimo.current));
    } catch {}
    aviso.current = false;
    setRestante(null);
    setErro('');
  }
  async function sair() {
    if (saindo.current) return;
    saindo.current = true;
    try {
      await encerrarSessaoAtual();
      window.location.replace('/login');
    } catch {
      ultimaFalha.current = Date.now();
      setErro('Não foi possível encerrar a sessão. Verifique sua conexão e tente novamente.');
      saindo.current = false;
    }
  }
  useEffect(() => {
    continuar();
    const atividade = () => {
      if (saindo.current) return;
      const agora = Date.now();
      ultimo.current = agora;
      if (agora - ultimaGravacaoAtividade.current > 5000) {
        try {
          localStorage.setItem(armazenamentoChave, String(agora));
          ultimaGravacaoAtividade.current = agora;
        } catch {}
      }
      if (aviso.current) {
        aviso.current = false;
        previa.current = false;
        setRestante(null);
        setErro('');
      }
    };
    const verificar = () => {
      if (previa.current) {
        setRestante((atual) => {
          if (atual === null) return 60;
          if (atual <= 1) {
            previa.current = false;
            aviso.current = false;
            return null;
          }
          return atual - 1;
        });
        return;
      }
      const minutos = minutosInatividade(usuarioId);
      if (!minutos) {
        aviso.current = false;
        setRestante(null);
        return;
      }
      let ultimoLocal = ultimo.current;
      try {
        const compartilhado = Number(localStorage.getItem(armazenamentoChave) || 0);
        if (Number.isFinite(compartilhado) && compartilhado <= Date.now())
          ultimoLocal = Math.max(ultimoLocal, compartilhado);
      } catch {}
      const segundos = Math.ceil((ultimoLocal + minutos * 60000 - Date.now()) / 1000);
      if (segundos <= 60) {
        aviso.current = true;
        setRestante(Math.max(0, segundos));
        if (segundos <= 0 && previa.current) {
          previa.current = false;
          aviso.current = false;
          setRestante(null);
        } else if (segundos <= 0 && Date.now() - ultimaFalha.current > 30000) {
          void sair();
        }
      } else {
        aviso.current = false;
        setRestante(null);
      }
    };
    const temporizador = setInterval(verificar, 1000);
    const eventos = ['pointerdown', 'pointermove', 'keydown', 'scroll'] as const;
    eventos.forEach((eventoRecebido) =>
      window.addEventListener(eventoRecebido, atividade, { passive: true, capture: true }),
    );
    const armazenamento = (evento: StorageEvent) => {
      if (evento.key === chaveInatividade(usuarioId)) {
        invalidarInatividadeConta(usuarioId);
        verificar();
      }
    };
    window.addEventListener('storage', armazenamento);
    document.addEventListener('visibilitychange', verificar);
    window.addEventListener('session-preferences-change', verificar);
    const mostrarPrevia = () => {
      previa.current = true;
      aviso.current = true;
      setErro('');
      setRestante(60);
    };
    window.addEventListener('session-inactivity-preview', mostrarPrevia);
    return () => {
      clearInterval(temporizador);
      window.removeEventListener('storage', armazenamento);
      eventos.forEach((eventoRecebido) =>
        window.removeEventListener(eventoRecebido, atividade, true),
      );
      document.removeEventListener('visibilitychange', verificar);
      window.removeEventListener('session-preferences-change', verificar);
      window.removeEventListener('session-inactivity-preview', mostrarPrevia);
    };
  }, [usuarioId]);
  return restante !== null ? (
    <CfgDialog
      title="Você ainda está por aqui?"
      description="Sua sessão será encerrada se não houver atividade."
      icon="clock"
      onClose={continuar}
      className="cfg-inactivity-dialog"
    >
      <div className="cfg-inactivity-countdown" role="timer" aria-label={`${restante} segundos`}>
        <div className="cfg-inactivity-countdown-main">
          <span className="cfg-inactivity-countdown-clock" aria-hidden="true">
            <Icone name="clock" size={22} />
          </span>
          <div className="cfg-inactivity-countdown-copy">
            <small>Encerramento da sessão</small>
            <p>
              <strong>{restante}</strong>
              <span>segundos</span>
            </p>
            <span className="cfg-inactivity-countdown-hint">
              A sessão será encerrada automaticamente por inatividade.
            </span>
          </div>
        </div>
        <div
          className="cfg-inactivity-progress"
          role="progressbar"
          aria-label="Tempo até o encerramento da sessão"
          aria-valuemin={0}
          aria-valuemax={60}
          aria-valuenow={60 - restante}
        >
          <span style={{ width: `${((60 - restante) / 60) * 100}%` }} />
        </div>
      </div>
      {erro && (
        <p className="cfg-error" role="alert">
          {erro}
        </p>
      )}
    </CfgDialog>
  ) : null;
}
