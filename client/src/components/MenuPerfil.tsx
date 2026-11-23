import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAcessoConta } from '../services/acessoConta';
import { Icone } from './MenuAdmin';

export default function MenuPerfil({
  name: nome,
  onLogout: aoSair,
}: {
  name: string;
  onLogout: () => void | Promise<void>;
}) {
  const acesso = useAcessoConta();
  const [aberto, setAberto] = useState(false);
  const [fotoFalhou, setFotoFalhou] = useState(false);
  const [fotoRevisao, setFotoRevisao] = useState(0);
  const navegar = useNavigate();
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const atualizar = () => {
      setFotoFalhou(false);
      setFotoRevisao(Date.now());
    };
    window.addEventListener('profile-photo-updated', atualizar);
    return () => window.removeEventListener('profile-photo-updated', atualizar);
  }, []);
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      if (evento.target instanceof Node && !raiz.current?.contains(evento.target)) setAberto(false);
    };
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', escapar);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', escapar);
    };
  }, [aberto]);

  return (
    <div className="profile-wrap" ref={raiz}>
      <button
        className="profile plain"
        type="button"
        aria-label="Menu da conta"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
      >
        <span className="profile-avatar">
          {fotoFalhou ? (
            nome.charAt(0).toUpperCase()
          ) : (
            <img
              src={`/api/admin/profile/photo?v=${fotoRevisao}`}
              alt=""
              onError={() => setFotoFalhou(true)}
            />
          )}
        </span>
        <span className="profile-copy">
          <b>{nome}</b>
          <small>{acesso.cargo || 'Conta'}</small>
        </span>
        <Icone name="chevron" size={13} />
      </button>
      {aberto && (
        <div className="profile-popover" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              navegar('/meu-perfil');
            }}
          >
            <span className="profile-menu-icon">
              <Icone name="user" size={16} />
            </span>
            <strong>Meu perfil</strong>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              void aoSair();
            }}
          >
            <span className="profile-logout-icon">
              <img src="/assets/sair.svg" alt="" />
            </span>
            <strong>Sair</strong>
          </button>
        </div>
      )}
    </div>
  );
}
