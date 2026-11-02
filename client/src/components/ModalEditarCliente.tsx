import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from './MenuAdmin';
import { buscarFotoDiretorioCliente, atualizarPerfilCliente, type DadosPerfilCliente, type EdicaoPerfilCliente } from '../services/apiAutenticacao';
import './modal-editar-cliente.css';

const onlyDigits = (value: string, length: number) => value.replace(/\D/g, '').slice(0, length);
function cpfMask(value: string) {
  const digits = onlyDigits(value, 11);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join('.') + (digits.length > 9 ? `-${digits.slice(9)}` : '');
}
function cepMask(value: string) {
  const digits = onlyDigits(value, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}
function phoneMask(value: string) {
  const digits = onlyDigits(value, 13);
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length <= 2) return local ? `(${local}` : '';
  const prefix = `(${local.slice(0, 2)}) `;
  return prefix + (local.length > 7 ? `${local.slice(2, local.length > 10 ? 7 : 6)}-${local.slice(local.length > 10 ? 7 : 6)}` : local.slice(2));
}
function dateMask(value: string) {
  const digits = onlyDigits(value, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}
function dateForInput(value: string | null) {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}
function dateForStorage(value: string) {
  if (!value) return null;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return undefined;
  const [day, month, year] = value.split('/');
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso && iso <= new Date().toISOString().slice(0, 10) ? iso : undefined;
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(); }

async function preparePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem para a foto do cliente.');
  if (file.size > 10_000_000) throw new Error('Escolha uma foto de até 10 MB.');
  const blobUrl = URL.createObjectURL(file);
  try {
    const photo = new Image();
    photo.src = blobUrl;
    await photo.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1000 / Math.max(photo.naturalWidth, photo.naturalHeight));
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(photo, 0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL('image/jpeg', 0.82);
    if (!encoded.startsWith('data:image/jpeg;base64,') || encoded.length > 2_800_000)
      throw new Error('Não foi possível preparar essa foto. Tente outra imagem.');
    return encoded;
  } finally { URL.revokeObjectURL(blobUrl); }
}

export default function ModalEditarCliente({ client, onClose, onSaved }: {
  client: DadosPerfilCliente; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(client.name);
  const [cpf, setCpf] = useState(cpfMask(client.cpf ?? ''));
  const [birthDate, setBirthDate] = useState(dateForInput(client.birthDate));
  const [phone, setPhone] = useState(phoneMask(client.phone ?? ''));
  const [email, setEmail] = useState(client.email ?? '');
  const [postalCode, setPostalCode] = useState(cepMask(client.postalCode ?? ''));
  const [address, setAddress] = useState(client.address ?? '');
  const [addressNumber, setAddressNumber] = useState(client.addressNumber ?? '');
  const [district, setDistrict] = useState(client.district ?? '');
  const [city, setCity] = useState(client.city ?? '');
  const [state, setState] = useState(client.state ?? '');
  const [photo, setPhoto] = useState('');
  const [currentPhoto, setCurrentPhoto] = useState(client.photoUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<EdicaoPerfilCliente | null>(null);
  const [changedFields, setChangedFields] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInput.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { if (success) onClose(); else if (pending) setPending(null); else onClose(); } };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = ''; };
  }, [onClose, pending, success, busy]);
  useEffect(() => {
    if (!client.hasPhoto || client.photoUrl) return;
    let active = true; let blobUrl = '';
    buscarFotoDiretorioCliente(client.id).then(blob => {
      blobUrl = URL.createObjectURL(blob);
      if (active) setCurrentPhoto(blobUrl); else URL.revokeObjectURL(blobUrl);
    }).catch(() => {});
    return () => { active = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [client.id, client.hasPhoto, client.photoUrl]);

  async function choosePhoto(file?: File) {
    if (!file) return;
    setError('');
    try { setPhoto(await preparePhoto(file)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível ler a foto.'); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const cpfDigits = onlyDigits(cpf, 11);
    const cepDigits = onlyDigits(postalCode, 8);
    const formattedBirthDate = dateForStorage(birthDate);
    if ((cpfDigits && cpfDigits.length !== 11) || (cepDigits && cepDigits.length !== 8)) {
      setError('Confira o CPF (11 dígitos) e o CEP (8 dígitos).'); return;
    }
    if (formattedBirthDate === undefined) {
      setError('Digite uma data de nascimento válida no formato dd/mm/aaaa.'); return;
    }
    const values: EdicaoPerfilCliente = {
      name: name.trim(), cpf: cpfDigits, birthDate: formattedBirthDate, phone: phone.trim() || null,
      email: email.trim() || null, postalCode: cepDigits || null, address: address.trim() || null,
      addressNumber: addressNumber.trim() || null, district: district.trim() || null,
      city: city.trim() || null, state: state || null, ...(photo ? { photo } : {}),
    };
    const labels: Record<string, string> = { name:'Nome', cpf:'CPF', birthDate:'Nascimento', phone:'Telefone', email:'E-mail', postalCode:'CEP', address:'Endereço', addressNumber:'Número', district:'Bairro', city:'Cidade', state:'Estado', photo:'Foto' };
    const fields = Object.entries(labels).filter(([key]) => key === 'photo' ? !!photo : String(values[key as keyof EdicaoPerfilCliente] ?? '') !== String(client[key as keyof DadosPerfilCliente] ?? '')).map(([, label]) => label);
    if (!fields.length) { setError('Nenhuma alteração foi feita.'); return; }
    setChangedFields(fields); setPending(values);
  }
  async function confirmSave() {
    if (!pending || busy) return;
    setBusy(true); setError('');
    try {
      await atualizarPerfilCliente(client.id, pending);
      await onSaved(); setPending(null); setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o cliente.'); }
    finally { setBusy(false); }
  }
  const photoPreview = photo || currentPhoto;
  return <div className="ce-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy && !pending && !success) onClose(); }}>
    <form className="ce-dialog" role="dialog" aria-modal="true" aria-labelledby="ce-title" onSubmit={save}>
      <header className="ce-header"><span className="ce-header-icon"><Icon name="user" size={22}/></span><div><h2 id="ce-title">Editar Cliente</h2><p>Atualize as informações do cliente.</p></div><button type="button" className="ce-close" onClick={onClose} disabled={busy} aria-label="Fechar"><Icon name="close" size={19}/></button></header>
      <div className="ce-form-content">
        <div className="ce-top-grid">
          <div className="ce-photo-column"><span className="ce-label">Foto do cliente</span><div className="ce-photo">{photoPreview ? <img src={photoPreview} alt={`Foto de ${client.name}`}/> : <span>{initials(client.name)}</span>}</div><input ref={fileInput} type="file" accept="image/*" className="ce-visually-hidden" aria-label="Selecionar foto do cliente" onChange={event => void choosePhoto(event.target.files?.[0])}/><button type="button" className="ce-change-photo" onClick={() => fileInput.current?.click()}><Icon name="camera" size={15}/> Alterar foto</button></div>
          <div className="ce-main-fields">
            <label className="ce-field"><span>Nome completo <b>*</b></span><input ref={firstInput} required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Nome do cliente"/></label>
            <label className="ce-field"><span>CPF <b>*</b></span><input inputMode="numeric" maxLength={14} value={cpf} onChange={event => setCpf(cpfMask(event.target.value))} placeholder="000.000.000-00"/></label>
            <label className="ce-field"><span>Data de nascimento <b>*</b></span><span className="ce-input-icon"><Icon name="calendar" size={17}/><input type="text" inputMode="numeric" maxLength={10} value={birthDate} onChange={event => setBirthDate(dateMask(event.target.value))} placeholder="dd/mm/aaaa"/></span></label>
            <label className="ce-field"><span>Telefone / WhatsApp <b>*</b></span><span className="ce-input-icon"><Icon name="phone" size={17}/><input type="tel" inputMode="tel" maxLength={18} value={phone} onChange={event => setPhone(phoneMask(event.target.value))} placeholder="(11) 99999-9999"/></span></label>
            <label className="ce-field"><span>E-mail <b>*</b></span><span className="ce-input-icon"><Icon name="mail" size={17}/><input type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="cliente@email.com"/></span></label>
            <label className="ce-field"><span>CEP <b>*</b></span><input inputMode="numeric" maxLength={9} value={postalCode} onChange={event => setPostalCode(cepMask(event.target.value))} placeholder="00000-000"/></label>
          </div>
        </div>
        <label className="ce-field ce-address"><span>Endereço <b>*</b></span><span className="ce-input-icon"><Icon name="pin" size={17}/><input maxLength={255} value={address} onChange={event => setAddress(event.target.value)} placeholder="Rua e complemento"/></span></label>
        <div className="ce-address-grid">
          <label className="ce-field"><span>Número <b>*</b></span><input maxLength={20} value={addressNumber} onChange={event => setAddressNumber(event.target.value)} placeholder="120"/></label>
          <label className="ce-field"><span>Bairro <b>*</b></span><input maxLength={100} value={district} onChange={event => setDistrict(event.target.value)} placeholder="Centro"/></label>
          <label className="ce-field"><span>Cidade <b>*</b></span><input maxLength={100} value={city} onChange={event => setCity(event.target.value)} placeholder="São Paulo"/></label>
          <label className="ce-field"><span>Estado <b>*</b></span><select value={state} onChange={event => setState(event.target.value)}><option value="">Selecione</option>{['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => <option key={uf}>{uf}</option>)}</select></label>
        </div>
        {error && <p className="ce-error" role="alert">{error}</p>}
      </div>
      <footer className="ce-footer"><button type="button" className="ce-cancel" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="ce-submit" disabled={busy}><Icon name="save" size={16}/>{busy ? 'Salvando…' : 'Salvar alterações'}</button></footer>
    </form>
    {(pending || success) && <div className="ce-confirm-backdrop"><section className="ce-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ce-confirm-title"><span className={`ce-confirm-icon ${success ? 'is-success' : ''}`}><Icon name={success ? 'check' : 'save'} size={22}/></span><h2 id="ce-confirm-title">{success ? 'Cliente atualizado' : 'Confirmar alterações?'}</h2><p>{success ? 'As informações do cliente foram salvas com sucesso.' : `Confira antes de salvar as informações de ${client.name}.`}</p>{!success && <div className="ce-confirm-fields"><b>Campos alterados</b><span>{changedFields.join(' · ')}</span></div>}{error && <p className="ce-error" role="alert">{error}</p>}<div className="ce-confirm-actions">{!success && <button type="button" onClick={() => { setPending(null); setError(''); }} disabled={busy}>Voltar e revisar</button>}<button type="button" className="ce-confirm-primary" onClick={success ? onClose : () => void confirmSave()} disabled={busy}>{success ? 'Concluir' : busy ? 'Salvando…' : 'Confirmar e salvar'}</button></div></section></div>}
  </div>;
}
