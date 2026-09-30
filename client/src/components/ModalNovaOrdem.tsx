import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { Icon } from './MenuAdmin';
import SeletorDatasOrdem from './SeletorDatasOrdem';
import { criarOrdem, buscarOpcoesNovaOrdem, type OpcoesNovaOrdem } from '../services/apiAutenticacao';
import './modal-nova-ordem.css';

const photoSlots = ['Foto frontal', 'Lateral esquerda', 'Lateral direita', 'Painel / odômetro'];
const digits = (value: string) => value.replace(/\D/g, '');
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function localDateTime() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function cpfMask(value: string) {
  return digits(value).slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
function phoneMask(value: string) {
  const d = digits(value).slice(0, 11);
  return d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length > 10 ? 7 : 6)}-${d.slice(d.length > 10 ? 7 : 6)}` : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
}
async function imageData(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 10_000_000) throw new Error('Cada foto deve ter até 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 1100 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
    const context = canvas.getContext('2d');
    if (!context || !canvas.width || !canvas.height) throw new Error('Não foi possível ler esta imagem.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.78, .68, .56]) {
      const value = canvas.toDataURL('image/jpeg', quality);
      if (value.length <= 735_000) return value;
    }
    throw new Error('Esta imagem ficou grande demais. Escolha outra foto.');
  } finally { URL.revokeObjectURL(url); }
}

export default function ModalNovaOrdem({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [options, setOptions] = useState<OpcoesNovaOrdem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientOpen, setClientOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [motoMode, setMotoMode] = useState<'existing' | 'new'>('existing');
  const [motorcycleId, setMotorcycleId] = useState<number | null>(null);
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [mileage, setMileage] = useState('');
  const [entryAt, setEntryAt] = useState(localDateTime);
  const [forecastAt, setForecastAt] = useState('');
  const [previsaoIncompleta, setPrevisaoIncompleta] = useState(false);
  const [forecastAcknowledged, setForecastAcknowledged] = useState(false);
  const [mechanicId, setMechanicId] = useState('');
  const [mechanicOpen, setMechanicOpen] = useState(false);
  const mechanicRef = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState('');
  const [observations, setObservations] = useState('');
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null]);
  const [preparing, setPreparing] = useState<number | null>(null);
  const clientSection = useRef<HTMLElement>(null);
  const bikeSection = useRef<HTMLElement>(null);
  const serviceSection = useRef<HTMLElement>(null);
  const clientBikes = useMemo(() => options?.motorcycles.filter(bike => bike.clientId === clientId) ?? [], [options, clientId]);
  const matches = useMemo(() => {
    const query = fold(clientSearch.trim());
    return (options?.clients ?? []).filter(client => !query || fold(`${client.name} ${client.phone ?? ''}`).includes(query)).slice(0, 8);
  }, [options, clientSearch]);

  useEffect(() => {
    let active = true;
    buscarOpcoesNovaOrdem().then(data => { if (active) { setOptions(data); setLoading(false); } })
      .catch(err => { if (active) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os cadastros.'); setLoading(false); } });
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { active = false; document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !busy) { if (clientOpen) setClientOpen(false); else if (mechanicOpen) setMechanicOpen(false); else onClose(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [busy, clientOpen, mechanicOpen, onClose]);
  useEffect(() => {
    if (!mechanicOpen) return;
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !mechanicRef.current?.contains(event.target)) setMechanicOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [mechanicOpen]);
  function pickClient(id: number | null) {
    const client = options?.clients.find(item => item.id === id);
    setClientId(id); setClientSearch(client?.name ?? ''); setClientOpen(false);
    setName(client?.name ?? ''); setPhone(client?.phone ?? ''); setEmail(client?.email ?? ''); setCpf(cpfMask(client?.cpf ?? ''));
    setMotorcycleId(null); setMotoMode(id && options?.motorcycles.some(bike => bike.clientId === id) ? 'existing' : 'new');
    setModel(''); setPlate(''); setYear(''); setColor(''); setMileage(''); setError('');
  }
  function pickBike(id: number | null) {
    const bike = clientBikes.find(item => item.id === id);
    setMotorcycleId(id); setModel(bike?.model ?? ''); setPlate(bike?.plate ?? '');
    setYear(bike?.year ? String(bike.year) : ''); setColor(bike?.color ?? '');
    setMileage(bike?.mileage != null ? String(bike.mileage) : ''); setError('');
  }
  function clientKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (!clientOpen && event.key === 'ArrowDown') { event.preventDefault(); setClientOpen(true); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlighted(index => Math.min(index + 1, matches.length - 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setHighlighted(index => Math.max(0, index - 1)); }
    if (event.key === 'Enter' && clientOpen && matches[highlighted]) { event.preventDefault(); pickClient(matches[highlighted].id); }
  }
  async function attach(index: number, file?: File) {
    if (!file || preparing !== null || busy) return;
    setPreparing(index); setError('');
    try { const value = await imageData(file); setPhotos(previous => previous.map((photo, i) => i === index ? value : photo)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível adicionar a foto.'); }
    finally { setPreparing(null); }
  }
  async function attachMany(files: FileList | File[]) {
    if (preparing !== null || busy) return;
    const slots = photos.map((photo, index) => photo ? -1 : index).filter(index => index >= 0);
    const selected = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (!selected.length) return setError('Selecione fotos em formato de imagem.');
    if (selected.length > slots.length) return setError(`Há ${slots.length} espaço(s) disponível(is). Remova uma foto ou escolha menos arquivos.`);
    setPreparing(-1); setError('');
    const next = [...photos];
    try {
      for (const [index, file] of selected.entries()) next[slots[index]] = await imageData(file);
      setPhotos(next);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível preparar as fotos.'); }
    finally { setPreparing(null); }
  }
  function invalid(message: string, section: RefObject<HTMLElement | null>) {
    setError(message);
    section.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (clientMode === 'existing' && !clientId) return invalid('Selecione um cliente ou escolha cadastrar um novo.', clientSection);
    if (clientMode === 'new' && (name.trim().length < 2 || digits(phone).length < 10)) return invalid('Informe o nome e um telefone válido do cliente.', clientSection);
    if (clientMode === 'new' && cpf && digits(cpf).length !== 11) return invalid('Complete o CPF ou deixe o campo vazio.', clientSection);
    if (motoMode === 'existing' && !motorcycleId) return invalid('Selecione a moto deste cliente ou cadastre uma nova.', bikeSection);
    if (motoMode === 'new' && (model.trim().length < 2 || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))) return invalid('Informe o modelo e uma placa válida, como ABC1D23.', bikeSection);
    if (!entryAt) return invalid('Informe a data de entrada.', serviceSection);
    if (previsaoIncompleta) return invalid('Complete a data e o horário da previsão ou limpe o campo.', serviceSection);
    if (!problem.trim() || problem.trim().length < 3) return invalid('Descreva o problema relatado pelo cliente.', serviceSection);
    if (!forecastAt && !forecastAcknowledged) return invalid('Confira a previsão de entrega ou confirme que deseja abrir a OS sem essa data.', serviceSection);
    if (forecastAt && forecastAt < entryAt) return invalid('A previsão deve ser posterior à entrada.', serviceSection);
    setBusy(true);
    try {
      const result = await criarOrdem({
        clientId: clientMode === 'existing' ? clientId : null, clientName: name.trim(), clientPhone: phone.trim(),
        clientEmail: email.trim(), clientCpf: digits(cpf), motorcycleId: motoMode === 'existing' ? motorcycleId : null,
        model: model.trim(), plate: plate.trim().toUpperCase(), year: year ? Number(year) : null, color: color.trim(),
        mileage: mileage ? Number(mileage) : null, mechanicId: mechanicId ? Number(mechanicId) : null,
        entryAt, forecastAt, problem: problem.trim(), observations: observations.trim(),
        photos: photos.filter((photo): photo is string => !!photo).map(data => ({ data })),
      });
      onCreated(result.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir a OS.'); setBusy(false); }
  }
  const completed = [clientMode === 'existing' ? !!clientId : name.trim().length >= 2 && digits(phone).length >= 10,
    motoMode === 'existing' ? !!motorcycleId : model.trim().length >= 2 && plate.length === 7, problem.trim().length >= 3];
  return <div className="os-create-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="os-create-dialog" role="dialog" aria-modal="true" aria-labelledby="os-create-title" onSubmit={event => void save(event)}>
      <header className="os-create-header"><span className="os-create-brand"><Icon name="clipboard" size={22}/></span><div><span className="os-create-overline">ESTAÇÃO MOTOS · ATENDIMENTO</span><h2 id="os-create-title">Nova ordem de serviço</h2><p>Registre a moto e o serviço em um só lugar.</p></div><button type="button" className="os-create-close" aria-label="Fechar" disabled={busy} onClick={onClose}><Icon name="close" size={18}/></button></header>
      <div className="os-create-body">
        <div className="os-create-column">
          <section className="os-create-card" ref={clientSection}><div className="os-create-section-title"><span className="os-create-number">01</span><div><h3>Cliente</h3><p>Quem é o proprietário da motocicleta?</p></div>{completed[0] && <Icon name="check" size={18}/>}</div>
            <div className="os-create-switch"><button type="button" className={clientMode === 'existing' ? 'active' : ''} onClick={() => { setClientMode('existing'); pickClient(null); }}>Buscar cliente</button><button type="button" className={clientMode === 'new' ? 'active' : ''} onClick={() => { setClientMode('new'); pickClient(null); setMotoMode('new'); }}>Cadastrar novo</button></div>
            {clientMode === 'existing' ? <><div className="os-create-search-wrap"><label className="os-create-field"><span>Busque por nome ou telefone <b>*</b></span><span className="os-create-combobox"><Icon name="search" size={17}/><input role="combobox" aria-autocomplete="list" aria-expanded={clientOpen} aria-controls="os-client-options" aria-activedescendant={clientOpen && matches[highlighted] ? `os-client-${matches[highlighted].id}` : undefined} placeholder={loading ? 'Carregando clientes...' : 'Digite para encontrar um cliente'} value={clientSearch} onChange={event => { setClientSearch(event.target.value); setClientId(null); setClientOpen(true); setHighlighted(0); }} onFocus={() => setClientOpen(true)} onBlur={() => window.setTimeout(() => setClientOpen(false), 120)} onKeyDown={clientKeys} disabled={loading || !options}/></span></label>{clientOpen && <div className="os-create-options" id="os-client-options" role="listbox">{matches.length ? matches.map((client, index) => <button type="button" role="option" aria-selected={clientId === client.id} id={`os-client-${client.id}`} className={highlighted === index ? 'highlighted' : ''} key={client.id} onMouseDown={event => { event.preventDefault(); pickClient(client.id); }}><span className="os-create-option-avatar">{client.name.charAt(0)}</span><span><strong>{client.name}</strong><small>{client.phone || 'Telefone não informado'}</small></span></button>) : <p>Nenhum cliente encontrado. Use “Cadastrar novo”.</p>}</div>}</div>{clientId && <div className="os-create-selection"><span><Icon name="check" size={15}/></span><strong>{name}</strong><small>{phone || 'Sem telefone'}</small></div>}</> : <div className="os-create-fields"><label className="os-create-field"><span>Nome completo <b>*</b></span><input maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Nome do cliente"/></label><div className="os-create-row"><label className="os-create-field"><span>WhatsApp <b>*</b></span><input inputMode="tel" value={phone} onChange={e => setPhone(phoneMask(e.target.value))} placeholder="(11) 99999-9999"/></label><label className="os-create-field"><span>CPF</span><input inputMode="numeric" value={cpf} onChange={e => setCpf(cpfMask(e.target.value))} placeholder="000.000.000-00"/></label></div><label className="os-create-field"><span>E-mail</span><input type="email" maxLength={150} value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@exemplo.com"/></label></div>}
          </section>
          <section className="os-create-card" ref={bikeSection}><div className="os-create-section-title"><span className="os-create-number">02</span><div><h3>Motocicleta</h3><p>Use uma moto do cliente ou cadastre outra.</p></div>{completed[1] && <Icon name="check" size={18}/>}</div>
            {clientMode === 'existing' && clientId && <div className="os-create-switch"><button type="button" className={motoMode === 'existing' ? 'active' : ''} disabled={!clientBikes.length} onClick={() => { setMotoMode('existing'); pickBike(null); }}>Moto cadastrada <small>{clientBikes.length}</small></button><button type="button" className={motoMode === 'new' ? 'active' : ''} onClick={() => { setMotoMode('new'); pickBike(null); }}>Nova moto</button></div>}
            {motoMode === 'existing' && clientMode === 'existing' ? <><label className="os-create-field"><span>Selecione a moto <b>*</b></span><span className="os-create-select"><select value={motorcycleId ?? ''} onChange={e => pickBike(e.target.value ? Number(e.target.value) : null)} disabled={!clientId}><option value="">{clientId ? 'Modelo e placa' : 'Selecione um cliente primeiro'}</option>{clientBikes.map(bike => <option key={bike.id} value={bike.id}>{bike.model} · {bike.plate}</option>)}</select><Icon name="chevron" size={16}/></span></label>{motorcycleId && <div className="os-create-selection"><span><Icon name="bike" size={18}/></span><strong>{model}</strong><small>{plate}{year ? ` · ${year}` : ''}</small></div>}</> : <div className="os-create-fields"><label className="os-create-field"><span>Modelo completo <b>*</b></span><input maxLength={100} value={model} onChange={e => setModel(e.target.value)} placeholder="Ex.: Yamaha Fazer FZ25"/></label><div className="os-create-row os-create-bike-row"><label className="os-create-field"><span>Placa <b>*</b></span><input value={plate} onChange={e => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))} placeholder="ABC1D23"/></label><label className="os-create-field"><span>Ano</span><input inputMode="numeric" value={year} onChange={e => setYear(digits(e.target.value).slice(0, 4))} placeholder="2024"/></label><label className="os-create-field"><span>Cor</span><input maxLength={50} value={color} onChange={e => setColor(e.target.value)} placeholder="Preta"/></label></div></div>}
            <label className="os-create-field os-create-km"><span>Quilometragem de entrada</span><span className="os-create-suffix"><input type="number" min="0" max="2000000" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="Ex.: 18450"/><small>km</small></span></label>
          </section>
        </div>
        <div className="os-create-column">
          <section className="os-create-card" ref={serviceSection}><div className="os-create-section-title"><span className="os-create-number">03</span><div><h3>Atendimento</h3><p>Detalhes essenciais para iniciar o serviço.</p></div>{completed[2] && <Icon name="check" size={18}/>}</div>
            <SeletorDatasOrdem entrada={entryAt} previsao={forecastAt} aoMudarEntrada={setEntryAt} aoMudarPrevisao={valor => { setForecastAt(valor); setForecastAcknowledged(false); }} aoValidarPrevisao={setPrevisaoIncompleta}/>
            {!forecastAt && <label className="os-create-forecast-note"><input type="checkbox" checked={forecastAcknowledged} onChange={e => setForecastAcknowledged(e.target.checked)}/><span>Sem previsão por enquanto. Eu aviso o cliente depois.</span></label>}
            <div className="os-create-field os-create-mechanic" ref={mechanicRef}><span>Mecânico responsável</span><button type="button" className="os-create-mechanic-trigger" aria-haspopup="listbox" aria-expanded={mechanicOpen} onClick={() => setMechanicOpen(value => !value)}><Icon name="wrench" size={15}/><span>{options?.mechanics.find(item => String(item.id) === mechanicId)?.name ?? "Atribuir depois"}</span><Icon name="chevron" size={16}/></button>{mechanicOpen && <div className="os-create-mechanic-list" role="listbox" aria-label="Mecânicos"><button type="button" role="option" aria-selected={!mechanicId} onClick={() => { setMechanicId(''); setMechanicOpen(false); }}>Atribuir depois <small>Definir durante o atendimento</small></button>{options?.mechanics.map(mechanic => <button type="button" role="option" aria-selected={mechanicId === String(mechanic.id)} key={mechanic.id} onClick={() => { setMechanicId(String(mechanic.id)); setMechanicOpen(false); }}>{mechanic.name}</button>)}</div>}</div>
            <label className="os-create-field"><span>Problema relatado <b>*</b></span><textarea maxLength={255} rows={2} value={problem} onChange={e => setProblem(e.target.value)} placeholder="O que o cliente percebeu na moto?"/><small className="os-create-counter">{problem.length}/255</small></label>
            <label className="os-create-field"><span>Observações adicionais</span><textarea maxLength={255} rows={2} value={observations} onChange={e => setObservations(e.target.value)} placeholder="Detalhes da inspeção, itens entregues..."/><small className="os-create-counter">{observations.length}/255</small></label>
          </section>
          <section className="os-create-card os-create-photo-card" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void attachMany(event.dataTransfer.files); }}><div className="os-create-section-title"><span className="os-create-number"><Icon name="camera" size={18}/></span><div><h3>Fotos da entrada</h3><p>Registre até quatro ângulos da moto. Opcional.</p></div><span className="os-create-photo-count">{photos.filter(Boolean).length} / 4</span></div>
            <label className="os-create-bulk"><Icon name="plus" size={16}/><span>{preparing === -1 ? "Preparando fotos…" : "Adicionar até 4 fotos de uma vez"}</span><small>ou arraste as imagens para esta área</small><input type="file" accept="image/*" multiple disabled={busy || preparing !== null} onChange={event => { if (event.target.files) void attachMany(event.target.files); event.currentTarget.value = ''; }}/></label><div className="os-create-photo-grid">{photoSlots.map((label, index) => <div className={`os-create-photo${photos[index] ? ' has-image' : ''}`} key={label}><label onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.files.length > 1) void attachMany(event.dataTransfer.files); else void attach(index, event.dataTransfer.files[0]); }}><input type="file" accept="image/*" disabled={busy || preparing !== null} onChange={event => { void attach(index, event.target.files?.[0]); event.currentTarget.value = ''; }}/>{photos[index] ? <img src={photos[index]!} alt={label}/> : <><Icon name="plus" size={18}/><strong>{label}</strong><small>{preparing === index ? 'Preparando…' : 'Clique ou arraste'}</small></>}</label>{photos[index] && <button type="button" aria-label={`Remover ${label}`} onClick={() => setPhotos(previous => previous.map((photo, i) => i === index ? null : photo))}><Icon name="close" size={13}/></button>}</div>)}</div>
          </section>
        </div>
      </div>
      <footer className="os-create-footer"><div className="os-create-footer-copy"><span className="os-create-status-dot"/><span>A OS será criada com status <strong>Aberta</strong>.</span></div>{error && <p role="alert" className="os-create-error">{error}</p>}<button type="button" className="os-create-cancel" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="os-create-save" disabled={busy || loading || !options || preparing !== null}><Icon name="plus" size={16}/>{busy ? 'Abrindo OS…' : 'Abrir ordem de serviço'}</button></footer>
    </form>
  </div>;
}
