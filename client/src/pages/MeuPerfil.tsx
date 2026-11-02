import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import CabecalhoAdmin from '../components/CabecalhoAdmin';
import MenuAdmin, { Icon } from '../components/MenuAdmin';
import { ErroRequisicaoApi, alterarMinhaSenha, buscarUsuarioAtual, logout, atualizarMinhaFoto, atualizarMeuPerfil } from '../services/apiAutenticacao';
import './ordens-servico.css';
import './meu-perfil.css';

async function prepareAvatar(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem.');
  if (file.size > 10_000_000) throw new Error('A imagem original deve ter até 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    canvas.width = canvas.height = 480;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto.');
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 480, 480);
    const result = canvas.toDataURL('image/jpeg', .8);
    if (result.length > 740_000) throw new Error('A foto ficou muito grande. Escolha outra imagem.');
    return result;
  } finally { URL.revokeObjectURL(url); }
}

export default function MeuPerfil() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(() => Date.now());
  const [photoFailed, setPhotoFailed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  useEffect(() => {
    let active = true;
    buscarUsuarioAtual().then(({user}) => { if (active) { setName(user.nome); setPhone(user.telefone ?? ''); setEmail(user.email ?? ''); setReady(true); } })
      .catch(err => { if (!active) return; if (err instanceof ErroRequisicaoApi && [401,403].includes(err.status)) navigate('/login', {replace:true}); else setError(err instanceof Error ? err.message : 'Falha ao abrir seu perfil.'); });
    return () => { active = false; };
  }, [navigate]);
  async function handleLogout() { await logout(); navigate('/login', {replace:true}); }
  async function saveDetails(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try { const result = await atualizarMeuPerfil({name:name.trim(),phone:phone.trim()}); setName(result.user.nome); setNotice('Dados pessoais atualizados.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function savePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setPhotoBusy(true); setError(''); setNotice('');
    try { const data = await prepareAvatar(file); await atualizarMinhaFoto(data); setPhotoFailed(false); setAvatarVersion(Date.now()); window.dispatchEvent(new Event('profile-photo-updated')); setNotice('Foto atualizada.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar a foto.'); }
    finally { setPhotoBusy(false); }
  }
  async function savePassword(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (newPassword !== confirmPassword) return setError('As senhas novas não coincidem.');
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^\w\s]/.test(newPassword)) return setError('Use 8 caracteres, letra maiúscula, minúscula, número e símbolo.');
    setBusy(true);
    try { const response = await alterarMinhaSenha(currentPassword,newPassword); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowNew(false); setNotice(response.message); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível trocar a senha.'); }
    finally { setBusy(false); }
  }
  return <div className="orders-viewport my-profile-page">
    <MenuAdmin collapsed={collapsed} />
    <div className="orders-main">
      <CabecalhoAdmin title="Meu perfil" name={name || 'Admin'} onLogout={handleLogout} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} />
      <main className="my-profile-content">
        <button type="button" className="my-profile-back" onClick={() => navigate(-1)}><Icon name="left" size={16}/> Voltar</button>
        <div className="my-profile-heading">
          <div><span>MINHA CONTA</span><h2>Seu espaço na Estação Motos</h2><p>Cuide do seu acesso e vá direto ao que precisa administrar.</p></div>
          <span className="my-profile-role"><Icon name="check" size={15}/> Administrador</span>
        </div>
        {!ready ? <div className="my-profile-loading">{error || 'Carregando perfil…'}</div> : <>
          {(error || notice) && <p role="status" className={`my-profile-notice ${error ? 'error' : ''}`}>{error || notice}</p>}
          <section className="my-profile-photo-card" aria-label="Identificação">
            <div className="my-profile-large-avatar">{photoFailed ? name.charAt(0).toUpperCase() : <img src={`/api/admin/profile/photo?v=${avatarVersion}`} alt="Sua foto de perfil" onError={() => setPhotoFailed(true)}/>}</div>
            <div className="my-profile-identity"><h3>{name}</h3><p>{email}</p><small>Imagem JPG, PNG ou WebP de até 10 MB.</small></div>
            <label className="my-profile-photo-button"><Icon name="camera" size={16}/>{photoBusy ? 'Enviando…' : 'Alterar foto'}<input type="file" accept="image/*" disabled={photoBusy || busy} onChange={event => void savePhoto(event)}/></label>
          </section>
          <div className="my-profile-grid">
            <form className="my-profile-card" onSubmit={event => void saveDetails(event)}>
              <div className="my-profile-card-title"><h3>Dados pessoais</h3><p>Nome e telefone usados no painel.</p></div>
              <label>Nome completo<input value={name} maxLength={100} required onChange={event => setName(event.target.value)}/></label>
              <label>E-mail de acesso<input value={email} readOnly aria-describedby="email-hint"/></label>
              <small id="email-hint">Para alterar o e-mail, procure a administração da conta.</small>
              <label>Telefone<input value={phone} maxLength={20} placeholder="(11) 99999-9999" onChange={event => setPhone(event.target.value)}/></label>
              <div className="my-profile-form-footer"><button className="my-profile-primary" type="submit" disabled={busy}>Salvar dados</button></div>
            </form>
            <form className="my-profile-card" onSubmit={event => void savePassword(event)}>
              <div className="my-profile-card-title"><h3>Senha e segurança</h3><p>Confirme a senha atual antes de definir outra.</p></div>
              <label>Senha atual<input type="password" autoComplete="current-password" value={currentPassword} required onChange={event => setCurrentPassword(event.target.value)}/></label>
              <label>Nova senha<input type={showNew ? 'text' : 'password'} autoComplete="new-password" value={newPassword} required minLength={8} maxLength={128} onChange={event => setNewPassword(event.target.value)}/></label>
              <label>Confirmar nova senha<input type={showNew ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} required onChange={event => setConfirmPassword(event.target.value)}/></label>
              <div className="my-profile-form-footer"><label className="my-profile-show"><input type="checkbox" checked={showNew} onChange={event => setShowNew(event.target.checked)}/> Mostrar senha</label><button className="my-profile-primary" type="submit" disabled={busy}>Alterar senha</button></div>
              <small>Use ao menos 8 caracteres, maiúscula, minúscula, número e símbolo.</small>
            </form>
          </div>
          <nav className="my-profile-links" aria-label="Áreas do painel">
            <strong>Ir para</strong>
            <button type="button" onClick={() => navigate('/ordens-de-servico')}><Icon name="clipboard" size={17}/> Ordens de serviço <Icon name="right" size={14}/></button>
            <button type="button" onClick={() => navigate('/clientes')}><Icon name="users" size={17}/> Clientes <Icon name="right" size={14}/></button>
            <button type="button" onClick={() => navigate('/motocicletas')}><Icon name="bike" size={17}/> Motocicletas <Icon name="right" size={14}/></button>
          </nav>
        </>}
      </main>
    </div>
  </div>;
}
