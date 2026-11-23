import EncaixesPainel from './organizacao/EncaixesPainel';
// Mantem uma unica instancia do menu lateral e do cabecalho entre as rotas.
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sair } from '../services/apiAutenticacao';
import CabecalhoAdministrador from './CabecalhoAdmin';
import './estrutura-admin.css';
import MenuAdministrador from './MenuAdmin';
import { useUsuarioAdministrador } from './RotaProtegida';
import SkeletonPagina from './SkeletonPagina';
import PaginasPersistentes from './PaginasPersistentes';
import BarrasAtalhos from './organizacao/BarrasAtalhos';
import { ProvedorAtalhos } from './organizacao/AtalhosPainel';
import { lerOrganizacaoInterface } from '../services/preferenciasGlobais';
import { useArrasteInterface, useOrganizacaoInterface } from '../services/organizacaoInterface';
import './organizacao/organizacao.css';
import PersonalizadorInterface from './PersonalizadorInterface';
const titulos: Record<string, string> = {
  dashboard: 'Dashboard',
  miniaturas: 'Miniaturas',
  clientes: 'Clientes',
  motocicletas: 'Motocicletas',
  funcionarios: 'Funcionários',
  agendamentos: 'Agendamentos',
  servicos: 'Serviços',
  configuracoes: 'Configurações',
  'ordens-de-servico': 'Ordens de serviço',
  'meu-perfil': 'Meu perfil',
};
export default function EstruturaAdministrador({
  carregando = false,
  conteudo,
}: {
  carregando?: boolean;
  conteudo?: ReactNode;
}) {
  const usuario = useUsuarioAdministrador();
  const organizacao = useOrganizacaoInterface(lerOrganizacaoInterface);
  const arraste = useArrasteInterface();
  const localizacao = useLocation();
  const navegar = useNavigate();
  const [recolhido, setRecolhido] = useState(false);
  const titulo = titulos[localizacao.pathname.split('/')[1]] ?? 'Estação Motos';
  const encerrarSessao = async () => {
    try {
      await sair();
    } catch {
      // A tela volta ao login mesmo quando a API não está disponível.
    } finally {
      navegar('/login', { replace: true });
    }
  };
  return (
    <ProvedorAtalhos key={usuario?.id ?? 'sessao'}>
      <div
        className="admin-shell"
        data-session-pending={!usuario}
        data-menu-position={organizacao.posicaoMenu}
        data-layout-editing={arraste}
      >
        {usuario && <PersonalizadorInterface />}
        <EncaixesPainel />
        <div
          className="workspace-menu-slot"
          draggable={arraste}
          onDragStart={(evento) => {
            if (arraste) evento.dataTransfer.setData('application/x-estacao-barra', 'menu');
          }}
        >
          <MenuAdministrador
            collapsed={recolhido}
            aguardandoAcesso={!usuario}
            onLogout={encerrarSessao}
          />
        </div>
        <div className="workspace-top-before">
          <BarrasAtalhos posicao="superior-antes" />
        </div>
        <div className="workspace-left-bars">
          <BarrasAtalhos posicao="esquerda" />
        </div>
        <div className="workspace-right-bars">
          <BarrasAtalhos posicao="direita" />
        </div>
        <div className="workspace-bottom-bars">
          <BarrasAtalhos posicao="inferior" />
        </div>
        <div className="admin-shell-main">
          <CabecalhoAdministrador
            title={titulo}
            subtitle="Gestão da oficina"
            name={usuario?.nome ?? 'Administrador'}
            collapsed={recolhido}
            onToggle={() => setRecolhido((valorAtual) => !valorAtual)}
            onLogout={encerrarSessao}
          />
          <div className="workspace-after-header">
            <BarrasAtalhos posicao="superior-depois" />
          </div>
          <div className="admin-shell-content">
            {carregando ? (
              <SkeletonPagina caminho={localizacao.pathname} />
            ) : (
              (conteudo ?? <PaginasPersistentes key={usuario?.id} />)
            )}
          </div>
        </div>
      </div>
    </ProvedorAtalhos>
  );
}
