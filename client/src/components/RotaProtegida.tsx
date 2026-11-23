import ConfirmacaoAdministrativa from './ConfirmacaoAdministrativa';
// A verificacao inicial controla o acesso ao conteudo protegido.
// A navegacao interna reutiliza a sessao e preserva a estrutura do painel.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { moduloPagina, pode, setAcessoConta } from '../services/acessoConta';
import { buscarUsuarioAtual, ErroRequisicaoApi } from '../services/apiAutenticacao';
import { carregarPreferenciasDaConta } from '../services/carregarPreferenciasConta';
import { configurarCentralNotificacoes } from '../services/centralNotificacoes';
import { setUsuarioNotificacoes } from '../services/preferenciasNotificacoes';
import { iniciarRascunhos, suspenderRascunhos } from '../services/rascunhos';
import { suspenderSincronizacaoConta } from '../services/sincronizacaoConta';
import MonitorNotificacoes from './configuracoes/MonitorNotificacoes';
import SessaoInativa from './configuracoes/SessaoInativa';
import EstruturaAdministrador from './EstruturaAdmin';

type UsuarioAdministrador = Awaited<ReturnType<typeof buscarUsuarioAtual>>['user'];
const UsuarioAdministradorContexto = createContext<UsuarioAdministrador | null>(null);
export const useUsuarioAdministrador = () => useContext(UsuarioAdministradorContexto);

export default function RotaProtegida() {
  const localizacao = useLocation();
  const [situacao, setSituacao] = useState<'loading' | 'authorized' | 'denied' | 'error'>(
    'loading',
  );
  const [tentativa, setTentativa] = useState(0);
  const [usuario, setUsuario] = useState<UsuarioAdministrador | null>(null);
  const inicial = useRef<ReturnType<typeof buscarUsuarioAtual> | null>(null);

  useEffect(() => {
    let ativo = true;
    setSituacao('loading');
    inicial.current ??= buscarUsuarioAtual();
    inicial.current
      .then(async (resultado) => {
        if (!ativo) return;
        await Promise.all([
          carregarPreferenciasDaConta(resultado.user.id),
          iniciarRascunhos(resultado.user.id),
        ]);
        if (!ativo) return;
        setAcessoConta(resultado.user.acesso);
        setUsuarioNotificacoes(resultado.user.id);
        configurarCentralNotificacoes(resultado.user.id);
        setUsuario(resultado.user);
        setSituacao('authorized');
      })
      .catch((erroLocal) => {
        if (!ativo) return;
        inicial.current = null;
        setSituacao(
          erroLocal instanceof ErroRequisicaoApi && [401, 403].includes(erroLocal.situacao)
            ? 'denied'
            : 'error',
        );
      });
    return () => {
      ativo = false;
      suspenderSincronizacaoConta();
      suspenderRascunhos();
    };
  }, [tentativa]);

  useEffect(() => {
    if (!usuario) return;
    const recarregar = () => {
      void carregarPreferenciasDaConta(usuario.id).catch(() => {});
    };
    window.addEventListener('account-preferences-reload', recarregar);
    return () => window.removeEventListener('account-preferences-reload', recarregar);
  }, [usuario?.id]);

  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    let ocupado = false;
    let ultima = Date.now();
    const verificar = () => {
      if (ocupado || document.visibilityState === 'hidden' || Date.now() - ultima < 60_000) return;
      ocupado = true;
      ultima = Date.now();
      void buscarUsuarioAtual()
        .then((resultado) => {
          if (ativo) {
            setAcessoConta(resultado.user.acesso);
            setUsuario(resultado.user);
          }
        })
        .catch((erroLocal) => {
          if (
            ativo &&
            erroLocal instanceof ErroRequisicaoApi &&
            [401, 403].includes(erroLocal.situacao)
          )
            setSituacao('denied');
        })
        .finally(() => {
          ocupado = false;
        });
    };
    const expirado = () => {
      if (ativo) setSituacao('denied');
    };
    const temporizador = setInterval(verificar, 60_000);
    window.addEventListener('focus', verificar);
    document.addEventListener('visibilitychange', verificar);
    window.addEventListener('admin-session-expired', expirado);
    return () => {
      ativo = false;
      clearInterval(temporizador);
      window.removeEventListener('focus', verificar);
      document.removeEventListener('visibilitychange', verificar);
      window.removeEventListener('admin-session-expired', expirado);
    };
  }, [usuario?.id]);

  if (situacao === 'denied')
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: localizacao.pathname + localizacao.search + localizacao.hash }}
      />
    );
  const modulo = moduloPagina(localizacao.pathname);
  if (situacao === 'authorized' && modulo && !pode(modulo))
    return <Navigate to="/meu-perfil" replace />;
  const erro =
    situacao === 'error' ? (
      <main role="alert">
        <p>Não foi possível carregar seu acesso e suas preferências.</p>
        <button type="button" onClick={() => setTentativa((valor) => valor + 1)}>
          Tentar novamente
        </button>
      </main>
    ) : undefined;
  return (
    <UsuarioAdministradorContexto.Provider value={usuario}>
      {situacao === 'authorized' && <ConfirmacaoAdministrativa usuario={usuario} />}
      {situacao === 'authorized' && <MonitorNotificacoes usuarioId={usuario!.id} />}
      {situacao === 'authorized' && <SessaoInativa usuarioId={usuario!.id} />}
      <EstruturaAdministrador carregando={situacao === 'loading'} conteudo={erro} />
    </UsuarioAdministradorContexto.Provider>
  );
}
