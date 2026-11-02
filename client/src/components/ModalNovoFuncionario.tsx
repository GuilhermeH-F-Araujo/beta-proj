import {useEffect,useId,useRef,useState,type FormEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {Icon} from './MenuAdmin';
import type {NovoFuncionario} from '../services/funcionarios';
import './modal-novo-funcionario.css';

const vazio:NovoFuncionario={nome:'',email:'',telefone:'',cpf:'',cargo:'Mecânico',data_nascimento:'',data_admissao:'',departamento:'Oficina',especialidade:'',endereco:'',cep:'',complemento:'',tipo_contrato:'CLT',comissao_servico:null,observacoes_profissionais:'',situacao:'ativo'};
const especialidades=['Mecânica geral e diagnóstico','Elétrica','Injeção eletrônica','Freios e suspensão','Transmissão','Outra'];
const moeda=(value:string)=>{const texto=value.replace(',','.').replace(/[^\d.]/g,'');const numero=Number(texto);return texto&&Number.isFinite(numero)?Math.min(100,numero):null;};
function mascaraCpf(value:string){const d=value.replace(/\D/g,'').slice(0,11);return d.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/,'.$1-$2');}
function mascaraTelefone(value:string){const d=value.replace(/\D/g,'').slice(0,11);return d.length>10?`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`:d.length>6?`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`:d.length>2?`(${d.slice(0,2)}) ${d.slice(2)}`:d;}
function mascaraCep(value:string){const d=value.replace(/\D/g,'').slice(0,8);return d.length>5?`${d.slice(0,5)}-${d.slice(5)}`:d;}
function cpfValido(value:string){const d=value.replace(/\D/g,'');if(d.length!==11||/^(\d)\1{10}$/.test(d))return false;for(const n of [9,10]){const sum=d.slice(0,n).split('').reduce((s,c,i)=>s+Number(c)*(n+1-i),0);if((sum*10)%11%10!==Number(d[n]))return false;}return true;}

function DropdownCampo({label,value,options,onChange,required=false,iconFor,showDot=false,formatOption}: {label:string;value:string;options:string[];onChange:(value:string)=>void;required?:boolean;iconFor:(value:string)=>string;showDot?:boolean;formatOption?:(value:string)=>string}){
  const [open,setOpen]=useState(false),id=useId(),root=useRef<HTMLSpanElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[open]);
  const moveOption=(event:ReactKeyboardEvent<HTMLDivElement>)=>{if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;event.preventDefault();const buttons=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')??[]),index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();};
  const statusClass=(item:string)=>item==='ativo'?'active':item==='ferias'?'vacation':item==='afastado'?'away':'inactive';
  return <label className="mnf-field"><span>{label}{required&&<> <b>*</b></>}</span><span className={`mnf-dropdown${open?' open':''}`} ref={root}>
    <button ref={trigger} type="button" className="mnf-dropdown-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-required={required} aria-label={`${label}: ${formatOption?.(value)??value}`} onClick={()=>setOpen(v=>!v)} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);window.setTimeout(()=>root.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(),0);}}}>
      <span className="mnf-dropdown-leading">{showDot?<i className={`mnf-status-dot ${statusClass(value)}`}/>:<Icon name={iconFor(value)} size={15}/>}</span><span className="mnf-dropdown-value">{formatOption?.(value)??value}</span><Icon name="chevron" size={15}/>
    </button>{open&&<div className="mnf-dropdown-menu" role="listbox" id={id} aria-label={label} onKeyDown={moveOption}>{options.map(option=><button type="button" role="option" aria-selected={option===value} className={`mnf-dropdown-option${option===value?' selected':''}`} key={option} onClick={()=>{onChange(option);setOpen(false);trigger.current?.focus();}}>
      <span className="mnf-dropdown-leading">{showDot?<i className={`mnf-status-dot ${statusClass(option)}`}/>:<Icon name={iconFor(option)} size={15}/>}</span><span className="mnf-dropdown-option-label">{formatOption?.(option)??option}</span>{option===value&&<Icon name="check" size={15}/>}
    </button>)}</div>}
  </span></label>;
}

export default function ModalNovoFuncionario({initialValues,initialPhoto,onClose,onComplete}:{initialValues:NovoFuncionario;initialPhoto:string|null;onClose:(draft:NovoFuncionario,photo:string|null)=>void;onComplete:(draft:NovoFuncionario,photo:string|null)=>void}){
  const [form,setForm]=useState<NovoFuncionario>(initialValues??vazio);
  const [photo,setPhoto]=useState<string|null>(initialPhoto??null);
  const [error,setError]=useState('');
  const [step,setStep]=useState<1|2>(1);
  const [outraEspecialidade,setOutraEspecialidade]=useState(()=>initialValues.especialidade==='Outra'||Boolean(initialValues.especialidade&&!especialidades.includes(initialValues.especialidade)));
  const set=<K extends keyof NovoFuncionario>(key:K,value:NovoFuncionario[K])=>setForm(current=>({...current,[key]:value}));

  useEffect(()=>{const esc=(event:KeyboardEvent)=>{if(event.key==='Escape'&&document.querySelector('.mnf-dropdown.open'))return;if(event.key==='Escape')onClose(form,photo);};document.addEventListener('keydown',esc);return()=>document.removeEventListener('keydown',esc);},[form,photo,onClose]);

  function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    if(step===1){
      if(form.nome.trim().length<2||!form.data_nascimento||!form.email.trim())return setError('Preencha nome, e-mail e data de nascimento para continuar.');
      if(!cpfValido(form.cpf))return setError('Confira o CPF informado.');
      if(form.telefone.replace(/\D/g,'').length<10)return setError('Informe um telefone válido.');
      if(form.cep.trim()&&form.cep.replace(/\D/g,'').length!==8)return setError('Confira o CEP ou deixe o campo em branco.');
      setStep(2);return;
    }
    if(!form.data_admissao)return setError('Informe a data de admissão para continuar.');
    onComplete({...form,cpf:form.cpf.replace(/\D/g,''),email:form.email.trim().toLowerCase(),telefone:form.telefone.trim(),cep:form.cep.replace(/\D/g,'')},photo);
  }

  async function carregarFoto(file?:File){if(!file)return;try{if(!file.type.startsWith('image/'))throw new Error('Selecione um arquivo de imagem.');const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const escala=Math.min(1,900/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*escala);canvas.height=Math.round(bitmap.height*escala);canvas.getContext('2d')?.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let qualidade=.9,resultado=canvas.toDataURL('image/jpeg',qualidade);while(resultado.length>700000&&qualidade>.55){qualidade-=.08;resultado=canvas.toDataURL('image/jpeg',qualidade);}if(resultado.length>740000)throw new Error('A imagem é muito grande. Escolha outra foto.');setPhoto(resultado);setError('');}catch(err){setError(err instanceof Error?err.message:'Não foi possível carregar a foto.');}}

  const input=(key:keyof NovoFuncionario,label:string,placeholder='',required=false,type='text',className='')=><label className={`mnf-field ${className}`}><span>{label}{required&&<> <b>*</b></>}</span><input type={type} required={required} value={String(form[key]??'')} placeholder={placeholder} onChange={e=>set(key,e.target.value as never)}/></label>;
  const select=(key:keyof NovoFuncionario,label:string,values:string[],required=false)=><DropdownCampo label={label} value={key==='especialidade'?(outraEspecialidade?'Outra':form.especialidade):String(form[key]??'')} options={key==='especialidade'?['',...values]:values} required={required} showDot={key==='situacao'} formatOption={key==='situacao'?value=>({ativo:'Ativo',ferias:'Férias',afastado:'Afastado',desligado:'Desligado'} as Record<string,string>)[value]??value:key==='especialidade'?value=>value||'Selecione uma especialidade':undefined} iconFor={value=>key==='cargo'?(value==='Mecânico'?'wrench':'staff'):key==='especialidade'?value==='Outra'?'pencil':!value?'star':/elétrica/i.test(value)?'activity':/injeção/i.test(value)?'gauge':/freios/i.test(value)?'settings':/transmissão/i.test(value)?'refresh':'wrench':key==='tipo_contrato'?'briefcase':key==='departamento'?'dashboard':'activity'} onChange={value=>{if(key==='especialidade'){if(value==='Outra'){setOutraEspecialidade(true);set('especialidade',form.especialidade&&!especialidades.includes(form.especialidade)?form.especialidade:'Outra');}else{setOutraEspecialidade(false);set('especialidade',value as never);}}else set(key,value as never);}}/>;

  return <form className="mnf-dialog" role="dialog" aria-modal="true" aria-labelledby="mnf-title" onSubmit={save}>
    <header className="mnf-header"><div className="mnf-heading-copy"><h2 id="mnf-title">Adicionar funcionário</h2><p>Adicione os dados do colaborador.</p></div><button type="button" className="mnf-close" onClick={()=>onClose(form,photo)} aria-label="Voltar ao cadastro de acesso"><Icon name="close" size={18}/></button></header>
    <nav className="mnf-tabs" aria-label="Etapas do cadastro">
      <button type="button" className={step===1?'active':step===2?'complete':''} aria-current={step===1?'step':undefined} onClick={()=>{setError('');setStep(1);}}><span className="mnf-step-number">01</span><span className="mnf-step-copy"><b>Dados pessoais</b><small>Identificação e contato</small></span></button>
      <span className={`mnf-step-connector${step===2?' complete':''}`} aria-hidden="true"/>
      <button type="button" className={step===2?'active':''} aria-current={step===2?'step':undefined} disabled={step<2} onClick={()=>{setError('');setStep(2);}}><span className="mnf-step-number">02</span><span className="mnf-step-copy"><b>Dados profissionais</b><small>Função e vínculo</small></span></button>
      <span className="mnf-tab-count">Etapa {step} de 2</span>
    </nav>
    <div className="mnf-body">
      {step===1?<section className="mnf-section">
        <div className="mnf-section-heading"><div><h3>Dados pessoais</h3><p>Informações básicas para identificar o colaborador.</p></div></div>
        <div className="mnf-personal-layout">
          <aside className="mnf-photo"><span className="mnf-photo-label">Foto do funcionário</span><span className="mnf-photo-preview">{photo?<img src={photo} alt="Prévia da foto"/>:<Icon name="staff" size={24}/>}</span><label className="mnf-photo-change"><Icon name="camera" size={14}/>{photo?'Alterar foto':'Adicionar foto'}<input type="file" accept="image/*" onChange={e=>void carregarFoto(e.target.files?.[0])}/></label><small>Opcional · JPG ou PNG</small></aside>
          <div className="mnf-grid mnf-personal">{input('nome','Nome completo','Nome e sobrenome',true,'text','span-two')}{input('email','E-mail de acesso','nome@exemplo.com',true,'email')}<label className="mnf-field"><span>Telefone / WhatsApp <b>*</b></span><input required inputMode="tel" value={form.telefone} placeholder="(11) 99999-9999" onChange={e=>set('telefone',mascaraTelefone(e.target.value))}/></label><label className="mnf-field"><span>CPF <b>*</b></span><input required inputMode="numeric" value={form.cpf} placeholder="000.000.000-00" onChange={e=>set('cpf',mascaraCpf(e.target.value))}/></label>{input('data_nascimento','Data de nascimento','',true,'date')}</div>
        </div>
        <div className="mnf-address-block"><div className="mnf-address-heading"><span><b>Endereço</b><small>Se preferir, você pode deixar estes dados em branco.</small></span><span className="mnf-optional-badge">Opcional</span></div><div className="mnf-grid mnf-address"><label className="mnf-field"><span>CEP <small>(opcional)</small></span><input inputMode="numeric" value={form.cep} placeholder="00000-000" onChange={e=>set('cep',mascaraCep(e.target.value))}/></label><label className="mnf-field"><span>Endereço <small>(opcional)</small></span><input value={form.endereco} placeholder="Rua, número, bairro e cidade" onChange={e=>set('endereco',e.target.value)}/></label>{input('complemento','Complemento (opcional)','Apto, bloco, sala...')}</div></div>
      </section>:<section className="mnf-section mnf-professional-screen">
        <div className="mnf-section-heading mnf-professional-heading"><div><h3>Dados profissionais</h3><p>Configure o vínculo e a rotina de trabalho.</p></div></div>
        <div className="mnf-grid mnf-professional">{select('cargo','Cargo',['Mecânico','Administrador'],true)}{select('tipo_contrato','Tipo de contratação',['CLT','PJ','Autônomo','Temporário'],true)}{select('especialidade','Especialidade',especialidades)}{select('departamento','Setor',['Oficina','Atendimento','Administrativo','Estoque'],true)}<label className="mnf-field"><span>Data de admissão <b>*</b></span><span className="mnf-date-picker"><Icon name="calendar" size={15}/><input type="date" required value={form.data_admissao} onChange={e=>set('data_admissao',e.target.value)}/></span></label>{select('situacao','Situação',['ativo','ferias','afastado','desligado'],true)}{outraEspecialidade&&<label className="mnf-field mnf-other-specialty"><span>Qual especialidade?</span><input maxLength={150} value={form.especialidade==='Outra'?'':!especialidades.includes(form.especialidade)?form.especialidade:''} placeholder="Digite a especialidade" onChange={e=>set('especialidade',e.target.value)}/></label>}<label className="mnf-field mnf-professional-last"><span>Comissão por serviço <small>(opcional)</small></span><span className="mnf-suffix"><input inputMode="decimal" value={form.comissao_servico??''} placeholder="0" onChange={e=>set('comissao_servico',moeda(e.target.value))}/><i>%</i></span></label><label className="mnf-field mnf-professional-last mnf-professional-notes"><span>Observações profissionais <small>(opcional)</small></span><textarea rows={2} value={form.observacoes_profissionais} placeholder="Experiência, certificações e observações relevantes..." onChange={e=>set('observacoes_profissionais',e.target.value)}/></label></div>
      </section>}
    </div>
    <footer className="mnf-footer"><span className="mnf-required"><b>*</b> Campos obrigatórios. {step===2?'A senha será definida na próxima etapa.':''}</span>{error&&<p role="alert" className="mnf-error"><Icon name="info" size={14}/>{error}</p>}<button type="button" className="mnf-cancel" onClick={()=>{if(step===1)onClose(form,photo);else{setError('');setStep(1);}}}>Voltar</button><button type="submit" className="mnf-save">{step===1?'Continuar':'Usar estes dados'}{step===1&&<Icon name="right" size={14}/>}</button></footer>
  </form>;
}
