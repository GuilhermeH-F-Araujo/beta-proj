import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { buscarUsuarioAtual, ErroRequisicaoApi } from '../services/apiAutenticacao';

type UsuarioAdmin=Awaited<ReturnType<typeof buscarUsuarioAtual>>['user'];
const UsuarioAdminContext=createContext<UsuarioAdmin|null>(null);
export const useUsuarioAdmin=()=>useContext(UsuarioAdminContext);

export default function RotaProtegida() {
  const location = useLocation();
  const [status, setStatus] = useState<'loading' | 'authorized' | 'denied' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [usuario,setUsuario]=useState<UsuarioAdmin|null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    buscarUsuarioAtual().then(result => {
      if (active) {setUsuario(result.user);setStatus('authorized');}
    }).catch(error => {
      if (active) setStatus(error instanceof ErroRequisicaoApi && [401, 403].includes(error.status) ? 'denied' : 'error');
    });
    return () => { active = false; };
  }, [attempt]);

  if (status === 'denied') return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  if (status === 'loading') return <main role="status" aria-live="polite">Verificando seu acesso…</main>;
  if (status === 'error') return <main role="alert">
    <p>Não foi possível verificar seu acesso. Tente novamente.</p>
    <button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>
  </main>;
  return <UsuarioAdminContext.Provider value={usuario}><Outlet /></UsuarioAdminContext.Provider>;
}
