import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
export function useAtalhoPagina(acoes: Record<string, () => void>) {
  const rota = useLocation();
  const navegar = useNavigate();
  useEffect(() => {
    const parametros = new URLSearchParams(rota.search);
    const acao = parametros.get('acao');
    if (!acao || !acoes[acao]) return;
    acoes[acao]();
    parametros.delete('acao');
    navegar({ pathname: rota.pathname, search: parametros.toString() }, { replace: true });
  }, [rota.pathname, rota.search]);
}
