import PesquisaGeral from './PesquisaGeral';
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { atalhosInterface, type AtalhoInterface } from '../../services/catalogoInterface';
import { pode, useAcessoConta } from '../../services/acessoConta';
import { buscarMotocicletas } from '../../services/apiAutenticacao';
import { abrirPersonalizador } from '../../services/personalizacaoElementos';
import { abrirOrganizador, type BlocoInterface } from '../../services/organizacaoInterface';
import { Icone } from '../MenuAdmin';
import PainelNotificacoes from '../PainelNotificacoes';
import Skeleton from '../Skeleton';
const ModalOrdem = lazy(() => import('../ModalNovaOrdem'));
const ModalUsuario = lazy(() => import('../ModalNovoUsuario'));
const ModalFuncionario = lazy(() => import('../ModalAdicionarFuncionario'));
const ModalMoto = lazy(() => import('../ModalEditarMotocicleta'));
const ExecutarContexto = createContext<(id: string) => void>(() => {});
export function atalhoPermitido(atalho: AtalhoInterface, administrador: boolean) {
  return (
    !('administrador' in atalho && atalho.administrador && !administrador) &&
    (!('modulo' in atalho) || pode(atalho.modulo, 'acao' in atalho ? atalho.acao : 'visualizar'))
  );
}
export function ProvedorAtalhos({ children }: { children: ReactNode }) {
  const navegar = useNavigate();
  const acesso = useAcessoConta();
  const [modal, setModal] = useState('');
  const [clientes, setClientes] = useState<{ id: number; name: string }[]>([]);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (modal !== 'nova-moto') return;
    let ativo = true;
    buscarMotocicletas()
      .then((dados) => {
        if (ativo) setClientes(dados.clients);
      })
      .catch((causa) => {
        if (ativo) setErro(causa.message);
      });
    return () => {
      ativo = false;
    };
  }, [modal]);
  const executar = (id: string) => {
    const atalho = atalhosInterface.find((item) => item.id === id);
    if (!atalho || !atalhoPermitido(atalho, acesso.administrador)) return;
    if (id === 'personalizar') return abrirPersonalizador();
    if (id === 'organizar') return abrirOrganizador();
    if ('rota' in atalho) {
      navegar(atalho.rota);
      return;
    }
    setErro('');
    setModal(id);
  };
  const fechar = () => {
    setModal('');
    setErro('');
  };
  return (
    <ExecutarContexto.Provider value={executar}>
      {children}
      <Suspense
        fallback={
          <div className="workspace-modal-loading" role="status">
            <Skeleton tipo="formulario" />
          </div>
        }
      >
        {modal === 'nova-os' && (
          <ModalOrdem
            onClose={fechar}
            onCreated={(id) => {
              fechar();
              navegar(`/ordens-de-servico/${id}`);
            }}
          />
        )}
        {modal === 'novo-funcionario' && (
          <ModalFuncionario onClose={fechar} onSubmitted={() => {}} initialRole="Administrador" />
        )}
        {['novo-usuario', 'novo-cliente'].includes(modal) && (
          <ModalUsuario
            onClose={fechar}
            onCreated={() => {}}
            initialRole={modal === 'novo-cliente' ? 'Cliente' : undefined}
          />
        )}
        {modal === 'nova-moto' && (
          <ModalMoto
            item={null}
            clients={clientes}
            onClose={fechar}
            onSaved={fechar}
            onImage={() => {}}
          />
        )}
      </Suspense>
      {erro && (
        <div role="alert" className="workspace-alert">
          {erro}
          <button onClick={fechar}>Fechar</button>
        </div>
      )}
    </ExecutarContexto.Provider>
  );
}
export function BlocoAtalho({
  bloco,
  substituido = false,
}: {
  bloco: BlocoInterface;
  substituido?: boolean;
}) {
  const executar = useContext(ExecutarContexto);
  const acesso = useAcessoConta();
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const atalho = atalhosInterface.find((item) => item.id === bloco.atalho);
  if (!atalho || !atalhoPermitido(atalho, acesso.administrador)) return null;
  if (['pesquisa-os', 'pesquisa-geral'].includes(atalho.id))
    return <PesquisaGeral id={bloco.id} substituido={substituido} />;
  if (atalho.id === 'notificacoes')
    return (
      <PainelNotificacoes
        personalizacaoId={bloco.id}
        editorId={substituido ? undefined : bloco.id}
      />
    );
  if ('pesquisa' in atalho)
    return (
      <form
        data-editor-bloco={substituido ? undefined : bloco.id}
        data-personalizar-id={bloco.id}
        className="workspace-search"
        role="search"
        aria-label={atalho.rotulo}
        onSubmit={(evento) => {
          evento.preventDefault();
          navegar(`${atalho.rota}?search=${encodeURIComponent(busca.trim())}`);
        }}
      >
        <Icone name="search" size={16} />
        <input
          data-personalizar-id={`${bloco.id}-busca`}
          aria-label={atalho.id === 'pesquisa-os' ? 'Buscar ordens de serviço' : atalho.rotulo}
          placeholder={atalho.rotulo}
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
        />
        <button type="submit" aria-label={`Executar ${atalho.rotulo.toLowerCase()}`}>
          <Icone name="right" size={14} />
        </button>
      </form>
    );
  return (
    <button
      type="button"
      data-editor-bloco={substituido ? undefined : bloco.id}
      data-personalizar-id={bloco.id}
      className={`workspace-shortcut ${atalho.id === 'nova-os' ? 'primary' : ''}`}
      onClick={() => executar(atalho.id)}
      aria-label={atalho.rotulo}
    >
      <Icone name={atalho.icone} size={17} />
      <span>{atalho.rotulo}</span>
    </button>
  );
}
