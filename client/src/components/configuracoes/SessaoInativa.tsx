import "./configuracoes-sistema.css";
import { useEffect, useRef, useState } from "react";
import { logout } from "../../services/apiAutenticacao";
import { minutosInatividade,chaveInatividade,invalidarInatividadeConta } from "../../services/configuracoesSistema";
import { CfgDialog } from "./ConfiguracoesUI";
export default function SessaoInativa({ usuarioId }: { usuarioId: string }) {
  const [restante, setRestante] = useState<number | null>(null);
  const [encerrando, setEncerrando] = useState(false);
  const [erro, setErro] = useState("");
  const ultimo = useRef(Date.now());
  const aviso = useRef(false);
  const saindo = useRef(false);
  const ultimaFalha = useRef(0);
  const storageKey = `estacao-atividade-${usuarioId}`;
  function continuar() {
    if (saindo.current) return;
    ultimo.current = Date.now();
    try {
      localStorage.setItem(storageKey, String(ultimo.current));
    } catch {}
    aviso.current = false;
    setRestante(null);
    setErro("");
  }
  async function sair() {
    if (saindo.current) return;
    saindo.current = true;
    setEncerrando(true);
    try {
      await logout();
      window.location.replace("/login");
    } catch {
      ultimaFalha.current = Date.now();
      setErro(
        "Não foi possível encerrar a sessão. Verifique sua conexão e tente novamente.",
      );
      saindo.current = false;
      setEncerrando(false);
    }
  }
  useEffect(() => {
    continuar();
    const activity = () => {
      if (!aviso.current) {
        ultimo.current = Date.now();
        try {
          const saved = Number(localStorage.getItem(storageKey) || 0);
          if (Date.now() - saved > 5000)
            localStorage.setItem(storageKey, String(ultimo.current));
        } catch {}
      }
    };
    const check = () => {
      const minutes = minutosInatividade(usuarioId);
      if (!minutes) {
        aviso.current = false;
        setRestante(null);
        return;
      }
      let last = ultimo.current;
      try {
        const shared = Number(localStorage.getItem(storageKey) || 0);
        if (Number.isFinite(shared) && shared <= Date.now()) last = Math.max(last, shared);
      } catch {}
      const seconds = Math.ceil((last + minutes * 60000 - Date.now()) / 1000);
      if (seconds <= 60) {
        aviso.current = true;
        setRestante(Math.max(0, seconds));
        if (seconds <= 0 && Date.now() - ultimaFalha.current > 30000)
          void sair();
      } else {
        aviso.current = false;
        setRestante(null);
      }
    };
    const timer = setInterval(check, 1000);
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((e) =>
      window.addEventListener(e, activity, { passive: true, capture: true }),
    );
    const storage=(event:StorageEvent)=>{if(event.key===chaveInatividade(usuarioId)){invalidarInatividadeConta(usuarioId);check()}};window.addEventListener('storage',storage);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("session-preferences-change", check);
    return () => {
      clearInterval(timer);window.removeEventListener('storage',storage);
      events.forEach((e) => window.removeEventListener(e, activity, true));
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("session-preferences-change", check);
    };
  }, [usuarioId]);
  return restante !== null ? (
    <CfgDialog
      title="Você ainda está por aqui?"
      description="Sua sessão será encerrada por inatividade para proteger os dados da oficina."
      icon="lock"
      onClose={continuar}
      footer={
        <>
          <button className="cfg-button" disabled={encerrando} onClick={() => void sair()}>
            Sair da conta
          </button>
          <button className="cfg-button primary" disabled={encerrando} onClick={continuar}>
            Continuar usando
          </button>
        </>
      }
    >
      <p className="cfg-session-countdown" role="timer">
        {restante} segundos
      </p>
      {erro && (
        <p className="cfg-error" role="alert">
          {erro}
        </p>
      )}
    </CfgDialog>
  ) : null;
}
