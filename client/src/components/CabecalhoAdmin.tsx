import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './MenuAdmin';
import PainelNotificacoes from './PainelNotificacoes';
import MenuPerfil from './MenuPerfil';
import AcoesRapidas from './AcoesRapidas';

type Search = {
  value?: string;
  onChange?: (value: string) => void;
  onEnter?: () => void;
  ariaLabel: string;
};

type Props = {
  title: string;
  name: string;
  onLogout: () => void | Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
  search?: Search;
};

export default function CabecalhoAdmin({
  title,
  name,
  onLogout,
  collapsed,
  onToggle,
  search,
}: Props) {
  const navigate = useNavigate();
  const [localSearch, setLocalSearch] = useState('');
  const searchValue = search?.value ?? localSearch;
  return (
    <header className="orders-header">
      <button
        type="button"
        className="header-hamburger plain"
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        onClick={onToggle}
      >
        <Icon name="menu" size={18} />
      </button>
      <h1>{title}</h1>
      <div className="header-actions">
        <label className="header-search">
            <Icon name="search" size={15} />
            <input
              aria-label={search?.ariaLabel ?? 'Buscar ordens de serviço'}
              placeholder="Buscar OS, cliente, moto..."
              value={searchValue}
              onChange={event => (search?.onChange ?? setLocalSearch)(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter') return;
                if (search?.onEnter) search.onEnter();
                else if (!search?.onChange) navigate(`/ordens-de-servico?search=${encodeURIComponent(searchValue.trim())}`);
              }}
            />
        </label>
        <AcoesRapidas />
        <PainelNotificacoes />
        <MenuPerfil name={name} onLogout={onLogout} />
      </div>
    </header>
  );
}
