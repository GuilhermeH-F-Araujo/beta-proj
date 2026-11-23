import { alternarTema } from '../services/temaInterface';
import { ControlesArea } from './edicaoVisual/ControlesArea';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BlocoAtalho } from './organizacao/AtalhosPainel';
import { lerOrganizacaoInterface, lerPreferenciasLeitura } from '../services/preferenciasGlobais';
import { useOrganizacaoInterface } from '../services/organizacaoInterface';
import './cabecalho-admin.css';
import { Icone } from './MenuAdmin';
import MenuPerfil from './MenuPerfil';

type Busca = {
  value?: string;
  onChange?: (valor: string) => void;
  onEnter?: () => void;
  ariaLabel: string;
  placeholder?: string;
};

type Props = {
  title: string;
  name: string;
  onLogout: () => void | Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
  search?: Busca;
  subtitle?: string;
  onBack?: () => void;
};

export default function CabecalhoAdministrador({
  title: titulo,
  name: nome,
  onLogout: aoSair,
  collapsed: recolhido,
  onToggle: aoInterruptor,
  search: busca,
  subtitle: subtitulo,
  onBack: aoBack,
}: Props) {
  const navegar = useNavigate();
  const [tema, setTema] = useState(() => lerPreferenciasLeitura().tema);
  useEffect(() => {
    const atualizar = () => setTema(lerPreferenciasLeitura().tema);
    window.addEventListener('app-preferences-change', atualizar);
    return () => window.removeEventListener('app-preferences-change', atualizar);
  }, []);
  const organizacao = useOrganizacaoInterface(lerOrganizacaoInterface);
  const [localBusca, setLocalBusca] = useState('');
  const buscaValor = busca?.value ?? localBusca;
  return (
    <header className="orders-header" data-editor-area="cabecalho" data-editor-nome="Cabeçalho">
      <button
        type="button"
        className="header-hamburger plain"
        aria-label={
          aoBack ? 'Voltar para funcionários' : recolhido ? 'Expandir menu' : 'Recolher menu'
        }
        onClick={aoBack ?? aoInterruptor}
      >
        <Icone name={aoBack ? 'left' : 'menu'} size={18} />
      </button>
      <h1>
        {titulo}
        {subtitulo && <small className="header-subtitle">{subtitulo}</small>}
      </h1>
      <div className="header-actions">
        {busca && (
          <label className="header-search">
            <Icone name="search" size={15} />
            <input
              aria-label={busca?.ariaLabel ?? 'Buscar ordens de serviço'}
              placeholder={busca?.placeholder ?? 'Buscar ordens de serviço…'}
              value={buscaValor}
              onChange={(evento) => (busca?.onChange ?? setLocalBusca)(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key !== 'Enter') return;
                if (busca?.onEnter) busca.onEnter();
                else if (!busca?.onChange)
                  navegar(`/ordens-de-servico?search=${encodeURIComponent(buscaValor.trim())}`);
              }}
            />
          </label>
        )}
        {organizacao.cabecalho.map((bloco) => (
          <BlocoAtalho key={bloco.id} bloco={bloco} />
        ))}
        <ControlesArea area="cabecalho" nome="Cabeçalho" />
        <button
          className="header-theme-toggle"
          data-editor-protegido
          type="button"
          aria-label={tema === 'escuro' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          title={tema === 'escuro' ? 'Acender a luz' : 'Diminuir a luz'}
          onClick={(evento) => void alternarTema(evento)}
        >
          <Icone name={tema === 'escuro' ? 'sun' : 'moon'} size={19} />
        </button>
        <span data-editor-protegido>
          <MenuPerfil name={nome} onLogout={aoSair} />
        </span>
      </div>
    </header>
  );
}
