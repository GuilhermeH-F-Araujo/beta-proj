import { iniciarRascunhos, suspenderRascunhos } from '../services/rascunhos';
import { definirAcessoConta, moduloPagina, pode } from '../services/acessoConta';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { definirUsuarioNotificacoes } from '../services/preferenciasNotificacoes';
import { configurarCentralNotificacoes } from '../services/centralNotificacoes';
import { carregarPreferenciasDaConta } from '../services/carregarPreferenciasConta';
import { suspenderSincronizacaoConta } from '../services/sincronizacaoConta';
import MonitorNotificacoes from './configuracoes/MonitorNotificacoes';
import SessaoInativa from './configuracoes/SessaoInativa';
import EstruturaAdmin from './EstruturaAdmin';
import { buscarUsuarioAtual, ErroRequisicaoApi } from '../services/apiAutenticacao';

type UsuarioAdmin = Awaited<ReturnType<typeof buscarUsuarioAtual>>['user'];
const UsuarioAdminContext = createContext<UsuarioAdmin | null>(null);
export const useUsuarioAdmin = () => useContext(UsuarioAdminContext);

export default function RotaProtegida() {
  const location = useLocation();
  const [status, setStatus] = useState<'loading' | 'authorized' | 'denied' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [usuario, setUsuario] = useState<UsuarioAdmin | null>(null);
  const inicial = useRef<ReturnType<typeof buscarUsuarioAtual> | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    inicial.current ??= buscarUsuarioAtual();
    inicial.current.then(async result => {
      if (!active) return;
      await Promise.all([carregarPreferenciasDaConta(result.user.id), iniciarRascunhos(result.user.id)]);
      if (!active) return;
      definirAcessoConta(result.user.acesso);
      definirUsuarioNotificacoes(result.user.id);
      configurarCentralNotificacoes(result.user.id);
      setUsuario(result.user);
      setStatus('authorized');
    }).catch(error => {
      if (!active) return;
      inicial.current = null;
      setStatus(error instanceof ErroRequisicaoApi && [401, 403].includes(error.status) ? 'denied' : 'error');
    });
    return () => { active = false; suspenderSincronizacaoConta(); suspenderRascunhos(); };
  }, [attempt]);

  useEffect(() => {
    if (!usuario) return;
    const reload = () => { void carregarPreferenciasDaConta(usuario.id).catch(() => {}); };
    window.addEventListener('account-preferences-reload', reload);
    return () => window.removeEventListener('account-preferences-reload', reload);
  }, [usuario?.id]);

  useEffect(() => {
    if (!usuario) return;
    let active = true, busy = false, ultima = Date.now();
    const check = () => {
      if (busy || document.visibilityState === 'hidden' || Date.now() - ultima < 60_000) return;
      busy = true; ultima = Date.now();
      void buscarUsuarioAtual().then(result => {
        if (active) { definirAcessoConta(result.user.acesso); setUsuario(result.user); }
      }).catch(error => {
        if (active && error instanceof ErroRequisicaoApi && [401, 403].includes(error.status)) setStatus('denied');
      }).finally(() => { busy = false; });
    };
    const expired = () => { if (active) setStatus('denied'); };
    const timer = setInterval(check, 60_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('admin-session-expired', expired);
    return () => {
      active = false; clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('admin-session-expired', expired);
    };
  }, [usuario?.id]);

  if (status === 'denied') return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  const modulo = moduloPagina(location.pathname);
  if (status === 'authorized' && modulo && !pode(modulo)) return <Navigate to="/meu-perfil" replace />;
  const erro = status === 'error' ? <main role="alert"><p>Não foi possível carregar seu acesso e suas preferências.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></main> : undefined;
  return <UsuarioAdminContext.Provider value={usuario}>
    {status === 'authorized' && <MonitorNotificacoes usuarioId={usuario!.id} />}
    {status === 'authorized' && <SessaoInativa usuarioId={usuario!.id} />}
    <EstruturaAdmin carregando={status === 'loading'} conteudo={erro} />
  </UsuarioAdminContext.Provider>;
}
