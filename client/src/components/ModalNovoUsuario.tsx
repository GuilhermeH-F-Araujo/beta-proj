import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from './MenuAdmin';
import { cadastrarUsuario, type DadosNovoUsuario } from '../services/apiAutenticacao';
import './modais-administrativos.css';

function cpfMask(value:string){
  const d=value.replace(/\D/g,'').slice(0,11);
  return d.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/,'.$1-$2');
}
function phoneMask(value:string){
  const d=value.replace(/\D/g,'').slice(0,11);
  return d.length>6?`(${d.slice(0,2)}) ${d.slice(2,d.length>10?7:6)}-${d.slice(d.length>10?7:6)}`:d.length>2?`(${d.slice(0,2)}) ${d.slice(2)}`:d;
}
function validCpf(value:string){
  const d=value.replace(/\D/g,'');
  if(d.length!==11||/^(\d)\1{10}$/.test(d))return false;
  for(const length of [9,10]){
    const sum=d.slice(0,length).split('').reduce((n,digit,index)=>n+Number(digit)*(length+1-index),0);
    if((sum*10)%11%10!==Number(d[length]))return false;
  }
  return true;
}
function generatePassword(){
  const alphabet='abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return `Aa1!${Array.from(bytes,n=>alphabet[n%alphabet.length]).join('')}`;
}
type Role=DadosNovoUsuario['position'];
const roles:{id:Role;icon:string;description:string}[]=[
  {id:'Administrador',icon:'staff',description:'Gestão e acesso ao painel'},
  {id:'Mecânico',icon:'wrench',description:'Equipe técnica e ordens'},
  {id:'Cliente',icon:'user',description:'Cadastro do cliente'},
];
export default function ModalNovoUsuario({onClose,onCreated}:{onClose:()=>void;onCreated:()=>void}){
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [phone,setPhone]=useState('');
  const [cpf,setCpf]=useState('');
  const [role,setRole]=useState<Role>('Mecânico');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [created,setCreated]=useState(false);
  const [copied,setCopied]=useState(false);
  const [createdPassword,setCreatedPassword]=useState('');
  const whatsappNumber=`55${phone.replace(/\D/g,'')}`;
  function sendCredentials(){
    if(!createdPassword)return setError('A senha não está mais disponível. Redefina-a antes de compartilhar.');
    const text=`Olá, ${name.trim().split(/\s+/)[0]}! Seu acesso à Estação Motos está pronto.\n\nE-mail: ${email.trim().toLowerCase()}\nSenha: ${createdPassword}\n\nGuarde estes dados e altere sua senha depois do primeiro acesso.`;
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
  }
  const checks=[password.length>=8,/[A-Z]/.test(password)&&/[a-z]/.test(password),/\d/.test(password),/[^\w\s]/.test(password)];
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)onClose();};
    document.addEventListener('keydown',escape);
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.removeEventListener('keydown',escape);document.body.style.overflow=previous;};
  },[busy,onClose]);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    if(!validCpf(cpf))return setError('Confira o CPF informado.');
    if(phone.replace(/\D/g,'').length<10)return setError('Informe um telefone válido.');
    if(!checks.every(Boolean))return setError('Crie uma senha que atenda aos quatro requisitos.');
    if(password!==confirm)return setError('As senhas não coincidem.');
    setBusy(true);
    try{
      await cadastrarUsuario({name:name.trim(),email:email.trim().toLowerCase(),phone:phone.trim(),cpf:cpf.replace(/\D/g,''),position:role,profile:role,password});
      setCreatedPassword(password);setPassword('');setConfirm('');setCreated(true);onCreated();
    }catch(err){setError(err instanceof Error?err.message:'Não foi possível cadastrar o usuário.');}
    finally{setBusy(false);}
  }
  async function copyPassword(){
    try{await navigator.clipboard.writeText(password);setCopied(true);}
    catch{setError('Não foi possível copiar a senha. Use o botão Mostrar antes de concluir.');}
  }
  return <div className="nam-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <form className="nam-dialog nam-user nam-reworked" role="dialog" aria-modal="true" aria-labelledby="nam-user-title" onSubmit={event=>void save(event)}>
      <header className="nam-hero"><div className="nam-hero-mark"><img src="/assets/estacao-motos-logo-sidebar.png" alt="Estação Motos"/></div><div className="nam-hero-copy"><span className="nam-kicker">EQUIPE E ACESSO</span><h2 id="nam-user-title">{created?'Acesso criado com sucesso':'Novo usuário'}</h2><p>{created?'Cadastro pronto para continuar.':'Um acesso organizado começa com as pessoas certas.'}</p></div><button type="button" className="nam-close" onClick={onClose} disabled={busy} aria-label="Fechar"><Icon name="close" size={18}/></button></header>
      {created?<div className="nam-finish nam-finish-simple"><div className="nam-finish-check"><Icon name="check" size={34}/></div><span className="nam-kicker">CADASTRO CONCLUÍDO</span><h3>{name} já está cadastrado.</h3><p>{role==='Administrador'?'O acesso ao painel administrativo foi criado.':role==='Mecânico'?'O mecânico já pode ser atribuído às ordens de serviço.':'A conta foi vinculada ao cadastro do cliente.'}</p><div className="nam-finish-person"><span className="nam-finish-person-avatar">{name.trim().charAt(0).toUpperCase()}</span><span><strong>{name}</strong><small>{role} · {phone}</small></span><span className="nam-finish-ready"><Icon name="check" size={13}/> Pronto para acessar</span></div><div className="nam-finish-share"><span>ENTREGAR ACESSO</span><h4>Envie os dados diretamente para a pessoa</h4><p>Confira o número cadastrado antes de abrir a conversa. A mensagem incluirá o e-mail e a senha definidos no cadastro.</p><button className="nam-whatsapp" type="button" onClick={sendCredentials}><Icon name="whatsapp" size={17}/> Enviar credenciais pelo WhatsApp <Icon name="right" size={13}/></button><small>A senha não é exibida nesta tela. Ao enviar, ela será incluída no link do WhatsApp; faça isso em um dispositivo confiável.</small></div>{error&&<p className="nam-error" role="alert">{error}</p>}</div>:
      <div className="nam-user-layout">
        <section className="nam-panel nam-personal"><div className="nam-panel-heading"><span className="nam-step-number">01</span><div><h3>Quem vai usar?</h3><p>Dados para identificar a pessoa no sistema.</p></div></div>
          <label className="nam-field"><span>Nome completo <b>*</b></span><input autoFocus required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Nome e sobrenome"/></label>
          <label className="nam-field"><span>E-mail de acesso <b>*</b></span><input required type="email" maxLength={150} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nome@exemplo.com"/></label>
          <div className="nam-grid-two"><label className="nam-field"><span>Telefone <b>*</b></span><input required inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(phoneMask(e.target.value))} placeholder="(11) 99999-9999"/></label><label className="nam-field"><span>CPF <b>*</b></span><input required inputMode="numeric" value={cpf} onChange={e=>setCpf(cpfMask(e.target.value))} placeholder="000.000.000-00"/></label></div>
          <div className="nam-soft-note"><Icon name="info" size={16}/><span>Ao escolher Cliente, o cadastro existente com mesmo CPF ou e-mail será vinculado à conta.</span></div>
        </section>
        <div className="nam-user-right"><section className="nam-panel"><div className="nam-panel-heading"><span className="nam-step-number">02</span><div><h3>Tipo de acesso</h3><p>Escolha um dos perfis disponíveis.</p></div></div><div className="nam-role-list" role="radiogroup" aria-label="Tipo de usuário">{roles.map(item=><button type="button" role="radio" aria-checked={role===item.id} className={`nam-role${role===item.id?' active':''}`} key={item.id} onClick={()=>setRole(item.id)}><span className="nam-role-icon"><Icon name={item.icon} size={18}/></span><span><b>{item.id}</b><small>{item.description}</small></span><i aria-hidden="true"/></button>)}</div></section>
        <section className="nam-panel"><div className="nam-panel-heading"><span className="nam-step-number">03</span><div><h3>Defina a senha</h3><p>Proteja o acesso desde o primeiro dia.</p></div></div><div className="nam-grid-two"><label className="nam-field"><span>Senha <b>*</b></span><span className="nam-password"><input required minLength={8} maxLength={128} type={visible?'text':'password'} autoComplete="new-password" value={password} onChange={e=>{setPassword(e.target.value);setCopied(false);}} placeholder="Crie uma senha"/><button type="button" aria-label={visible?'Ocultar senha':'Mostrar senha'} onClick={()=>setVisible(v=>!v)}>{visible?'Ocultar':'Mostrar'}</button></span></label><label className="nam-field"><span>Confirmar senha <b>*</b></span><input required type={visible?'text':'password'} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repita a senha"/></label></div><div className="nam-checklist">{['8 ou mais caracteres','Maiúscula e minúscula','Um número','Um símbolo'].map((label,index)=><span className={checks[index]?'valid':''} key={label}><Icon name="check" size={13}/>{label}</span>)}</div><div className="nam-password-actions"><button type="button" className="nam-generate" onClick={()=>{const value=generatePassword();setPassword(value);setConfirm(value);setVisible(false);setCopied(false);}}>Gerar senha segura</button><button type="button" className="nam-copy-before" disabled={!password} onClick={()=>void copyPassword()}>{copied?'Senha copiada':'Copiar antes de cadastrar'}</button></div><small className="nam-password-warning">A senha não será mostrada após o cadastro. Compartilhe-a separadamente por um canal seguro.</small></section></div>
      </div>}
      <footer className="nam-footer"><span className="nam-footer-caption">{created?'A conta está pronta para uso.':'Campos marcados com * são obrigatórios.'}</span>{error&&!created&&<p className="nam-error" role="alert">{error}</p>}{created?<button className="nam-submit" type="button" onClick={onClose}>Concluir</button>:<><button className="nam-cancel" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="nam-submit" type="submit" disabled={busy}><Icon name="plus" size={15}/>{busy?'Criando acesso…':'Criar usuário'}</button></>}</footer>
    </form>
  </div>;
}
