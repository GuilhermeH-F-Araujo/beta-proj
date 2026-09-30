import { useEffect, useRef, useState } from 'react';
import { Icon } from './MenuAdmin';
import { useNavigate } from 'react-router-dom';

export default function MenuPerfil({ name, onLogout }: { name: string; onLogout: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => { setPhotoFailed(false); setPhotoVersion(Date.now()); };
    window.addEventListener('profile-photo-updated', refresh);
    return () => window.removeEventListener('profile-photo-updated', refresh);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div className="profile-wrap" ref={root}>
    <button className="profile plain" type="button" aria-label="Menu da conta" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className="profile-avatar">{photoFailed ? name.charAt(0).toUpperCase() : <img src={`/api/admin/profile/photo?v=${photoVersion}`} alt="" onError={() => setPhotoFailed(true)}/>}</span>
      <span className="profile-copy"><b>{name}</b><small>Administrador</small></span>
      <Icon name="chevron" size={13}/>
    </button>
    {open && <div className="profile-popover" role="menu">
      <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/meu-perfil'); }}><span className="profile-menu-icon"><Icon name="user" size={16}/></span><strong>Meu perfil</strong></button>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); void onLogout(); }}>
        <span className="profile-logout-icon"><img src="/assets/sair.svg" alt=""/></span><strong>Sair</strong>
      </button>
    </div>}
  </div>;
}
