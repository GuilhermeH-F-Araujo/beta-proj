import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './MenuAdmin';
import { buscarDetalhesAcaoOrdem, salvarDetalhesAcaoOrdem } from '../services/apiAutenticacao';
import { aprovarRascunhoMotocicleta, aprovarCandidatoDaFila, gerarRascunhoMotocicleta, buscarPesquisaModelo, buscarCandidatoDaFila, aprovarCandidatoMoto, aprovarRascunhoMoto, gerarRascunhoMoto, buscarCandidatoMoto, type PesquisaModelo, type SugestaoModelo } from '../services/miniaturasMotocicletas';
import './modal-previa-modelo.css';

type Reference={name:string;data:string};
async function compactReference(file:File):Promise<string> {
  if(!['image/jpeg','image/png'].includes(file.type)||file.size>8*1024*1024) throw new Error('Escolha fotos JPEG ou PNG de até 8 MB cada.');
  const bitmap=await createImageBitmap(file);
  try {
    const side=480; // Cada imagem da Cloudflare deve medir menos de 512 × 512.
    const scale=Math.min(side/bitmap.width,side/bitmap.height,1);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');
    if(!context) throw new Error('Não foi possível preparar a foto.');
    context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/jpeg',.72);
    if(data.length>680_000) throw new Error('A foto ficou grande demais. Escolha outra imagem.');
    return data;
  } finally {bitmap.close();}
}

export default function ModalPreviaModelo({orderId,motorcycleId,currentModel,onClose,onChanged}:{
  orderId?:number;motorcycleId?:number;currentModel:string;onClose:()=>void;onChanged:()=>void;
}) {
  const locked=motorcycleId!==undefined;
  const [model,setModel]=useState(currentModel);
  const [variant,setVariant]=useState('');
  const [notes,setNotes]=useState('');
  const [references,setReferences]=useState<Reference[]>([]);
  const [draft,setDraft]=useState<{draftId:string;image:string;model:string}>();
  const [candidate,setCandidate]=useState<string>();
  const [queueStatus,setQueueStatus]=useState<string|null>(null);
  const [research,setResearch]=useState<PesquisaModelo|null>(null);
  const [suggestions,setSuggestions]=useState<SugestaoModelo[]>([]);
  const [formatted,setFormatted]=useState<{query:string;name:string}>();
  const [researchBusy,setResearchBusy]=useState(false);
  const [suggestionsOpen,setSuggestionsOpen]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [zoom,setZoom]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const preview=draft?.image||candidate;
  const fullModel=[model.trim(),variant.trim()].filter(Boolean).join(' ');
  const familySuggestions=suggestions.filter(item=>{
    const family=model.trim().toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean);
    const name=item.name.toLocaleLowerCase('pt-BR');
    return family.length>0 && family.every(token=>name.includes(token));
  });
  const versionSuggestions=familySuggestions.filter(item=>item.name.toLocaleLowerCase('pt-BR').startsWith(model.trim().toLocaleLowerCase('pt-BR')+' '));

  useEffect(()=>{
    if(fullModel.toLowerCase()!==currentModel.trim().toLowerCase()||draft||notes.trim()||references.length) return;
    let active=true;
    const check=()=>((locked?buscarCandidatoMoto(motorcycleId):buscarCandidatoDaFila(orderId!))).then(result=>{
      if(!active)return;
      setQueueStatus(result.status);
      if(result.status==='needs_review'&&result.candidate)setCandidate(result.candidate);
    }).catch(()=>{});
    void check();
    const interval=window.setInterval(()=>void check(),5_000);
    return ()=>{active=false;window.clearInterval(interval);};
  },[orderId,motorcycleId,locked,fullModel,currentModel,draft,notes,references.length]);
  useEffect(()=>{
    if(locked)return;
    const query=model.trim();
    if(query.length<3){setResearch(null);setSuggestions([]);setResearchBusy(false);return;}
    let active=true;
    setResearchBusy(true);
    const timer=window.setTimeout(()=>buscarPesquisaModelo(query).then(result=>{
      if(!active)return;
      setResearch(result.research);
      setSuggestions(result.suggestions);
      setFormatted({query,name:result.formattedModel});
    }).catch(()=>{if(active){setResearch(null);setSuggestions([]);}}).finally(()=>{if(active)setResearchBusy(false);}),600);
    return ()=>{active=false;window.clearTimeout(timer);};
  },[model,locked]);
  useEffect(()=>{
    const listener=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){if(zoom)setZoom(false);else onClose();}};
    window.addEventListener('keydown',listener);
    return ()=>window.removeEventListener('keydown',listener);
  },[busy,zoom,onClose]);

  function changeModel(value:string) {
    setModel(value);setDraft(undefined);setCandidate(undefined);setConfirmed(false);setError('');
    setResearch(null);setSuggestions([]);setFormatted(undefined);
  }
  function changeVariant(value:string) {
    setVariant(value);setDraft(undefined);setCandidate(undefined);setConfirmed(false);setError('');
  }
  async function selectReferences(files:FileList|null) {
    const chosen=Array.from(files??[]);
    if(!chosen.length)return;
    if(chosen.length+references.length>4){setError('Selecione no máximo quatro fotos de referência.');return;}
    setBusy(true);setError('');
    try {
      const ready=await Promise.all(chosen.map(async file=>({name:file.name,data:await compactReference(file)})));
      setReferences(previous=>[...previous,...ready]);
      setDraft(undefined);setCandidate(undefined);setConfirmed(false);
    } catch(cause){setError(cause instanceof Error?cause.message:'Foto inválida.');}
    finally{setBusy(false);}
  }
  function removeReference(index:number) {
    setReferences(previous=>previous.filter((_,i)=>i!==index));
    setDraft(undefined);setCandidate(undefined);setConfirmed(false);
  }
  async function generate() {
    if(fullModel.length<3||fullModel.length>80){setError('Informe o nome da moto e, se houver, a versão exata em até 80 caracteres.');return;}
    setBusy(true);setError('');setDraft(undefined);setCandidate(undefined);setConfirmed(false);
    try {
      const result=locked?await gerarRascunhoMoto(motorcycleId,fullModel,notes.trim(),references.map(item=>item.data)):
        await gerarRascunhoMotocicleta(orderId!,fullModel,notes.trim(),references.map(item=>item.data),model.trim());
      setDraft(result);
    } catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível gerar a imagem.');}
    finally{setBusy(false);}
  }
  async function approve() {
    if(!preview||busy||!confirmed)return;
    setBusy(true);setError('');
    try {
      const selectedModel=draft?.model||fullModel;
      if(!locked&&selectedModel.toLowerCase()!==currentModel.trim().toLowerCase()) {
        const details=await buscarDetalhesAcaoOrdem(orderId!);
        await salvarDetalhesAcaoOrdem(orderId!,{
          client:{name:details.client.name,phone:details.client.phone??'',email:details.client.email??'',cpf:details.client.cpf??''},
          motorcycle:{model:selectedModel,plate:details.motorcycle.plate,year:details.motorcycle.year,color:details.motorcycle.color??''},
          problem:details.problem??'',observations:details.observations??'',
        });
      }
      if(draft){if(locked)await aprovarRascunhoMoto(motorcycleId,draft.draftId);else await aprovarRascunhoMotocicleta(orderId!,draft.draftId);}
      else {if(locked)await aprovarCandidatoMoto(motorcycleId);else await aprovarCandidatoDaFila(orderId!);}
      onChanged();onClose();
    } catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível aprovar a miniatura.');}
    finally{setBusy(false);}
  }

  return createPortal(<div className="model-preview-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <section className="model-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="model-preview-title">
      <header><div><span>ESTAÇÃO MOTOS · MINIATURA</span><h2 id="model-preview-title">{locked?'Criar miniatura da motocicleta':'Corrigir imagem da motocicleta'}</h2><p>Confira o modelo e a imagem antes de disponibilizar a miniatura para as outras OS.</p></div><button onClick={onClose} disabled={busy} aria-label="Fechar"><Icon name="close" size={17}/></button></header>
      <div className="model-preview-content">
        {locked?<div className="model-preview-research"><strong>Modelo cadastrado · {currentModel}</strong><span>Modelo preenchido automaticamente. Use fotos e observações para orientar a IA. Para alterar o nome, salve primeiro os dados da motocicleta.</span></div>:<><div className="model-preview-model-field">
          <label htmlFor="motorcycle-model">Nome da moto <small>Marca e família: por exemplo, Honda Africa Twin</small></label>
          <input id="motorcycle-model" maxLength={80} value={model} disabled={busy} onFocus={()=>setSuggestionsOpen(true)} onBlur={()=>{
            window.setTimeout(()=>setSuggestionsOpen(false),150);
            if(formatted?.query===model.trim()&&formatted.name!==model.trim())setModel(formatted.name);
          }} onChange={event=>{changeModel(event.target.value);setSuggestionsOpen(true);}} placeholder="Ex.: Honda Africa Twin" autoComplete="off"/>
          {suggestionsOpen&&familySuggestions.length>0&&<div className="model-preview-suggestions" role="listbox" aria-label="Nomes e versões desta moto"><strong>Esta família e versões encontradas</strong>{familySuggestions.map(item=><button type="button" role="option" aria-selected={fullModel===item.name} key={`${item.source}:${item.name}`} onMouseDown={event=>event.preventDefault()} onClick={()=>{const prefix=model.trim();if(item.name.toLocaleLowerCase('pt-BR').startsWith(prefix.toLocaleLowerCase('pt-BR')+' ')){changeVariant(item.name.slice(prefix.length).trim());}else{changeModel(item.name);changeVariant('');}setSuggestionsOpen(false);}}><span>{item.name}</span><small>{item.source==='catalog'?'Já cadastrado':'Fonte encontrada'}</small></button>)}</div>}
        </div>
        <div className="model-preview-version"><label htmlFor="motorcycle-variant">Modelo, motor ou versão <small>Opcional: informe a versão exata para evitar outra cilindrada</small></label><input id="motorcycle-variant" maxLength={70} value={variant} disabled={busy} onChange={event=>changeVariant(event.target.value)} placeholder="Ex.: CRF1100L Adventure Sports" autoComplete="off"/>{versionSuggestions.length>0&&<div className="model-preview-versions"><small>Versões já cadastradas para este nome:</small>{versionSuggestions.map(item=><button type="button" key={item.name} onClick={()=>changeVariant(item.name.slice(model.trim().length).trim())}>{item.name.slice(model.trim().length).trim()}</button>)}</div>}</div>
        <div className="model-preview-research" aria-live="polite"><strong>Identificação do nome</strong>{researchBusy?<span>Consultando a família da moto…</span>:research?<span>Encontrei <a href={research.url} target="_blank" rel="noopener noreferrer">{research.title} ↗</a>. Confira a versão exata e a foto antes de aprovar.</span>:<span>Sem correspondência confirmada para o nome. Informe a versão e use fotos da própria moto para orientar a prévia.</span>}</div></>}
        <label>O que a IA deve corrigir? <small>Opcional</small><textarea rows={3} maxLength={500} value={notes} disabled={busy} onChange={event=>{setNotes(event.target.value);setDraft(undefined);setCandidate(undefined);setConfirmed(false);}} placeholder="Ex.: carenagem, farol e formato do tanque da versão exata…"/></label>
        <div className="model-preview-reference-section"><div><strong>Fotos de referência</strong><small>{references.length}/4 selecionadas · Mostram à IA como a moto é; não substituem as fotos da OS.</small></div><label className={`model-preview-upload${dragging?' is-dragging':''}`} onDragEnter={event=>{event.preventDefault();setDragging(true);}} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';setDragging(true);}} onDragLeave={event=>{event.preventDefault();if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}} onDrop={event=>{event.preventDefault();setDragging(false);if(!busy&&references.length<4)void selectReferences(event.dataTransfer.files);}}><Icon name="camera" size={17}/><span>{dragging?'Solte as fotos aqui':references.length?'Arraste ou selecione mais fotos':'Arraste as fotos aqui ou clique para selecionar'}<small>JPEG ou PNG · até quatro ângulos da mesma moto</small></span><input type="file" accept="image/jpeg,image/png" multiple disabled={busy||references.length>=4} onChange={event=>{void selectReferences(event.target.files);event.target.value='';}}/></label>{references.length>0&&<div className="model-preview-reference-list">{references.map((item,index)=><figure key={`${item.name}:${index}`}><img src={item.data} alt={`Foto de referência ${index+1}: ${item.name}`}/><figcaption><span>{item.name}</span><small>Foto {index+1} · Referência para a IA</small></figcaption><button type="button" onClick={()=>removeReference(index)} disabled={busy} aria-label={`Remover ${item.name}`} title="Remover foto">✕</button></figure>)}</div>}</div>
        <div className="model-preview-result-heading"><div><strong>Miniatura para revisão</strong><small>O quadro mostra a imagem inteira, incluindo rodas e retrovisores.</small></div>{preview&&<button type="button" onClick={()=>setZoom(true)}>Ver em tela cheia ↗</button>}</div>
        <div className="model-preview-result">{preview?<img src={preview} alt={`Miniatura completa gerada para ${draft?.model||fullModel}`}/>:<div><Icon name="bike" size={36}/><span>A nova miniatura aparecerá aqui para revisão.</span></div>}</div>
        <p className="model-preview-note">{preview?'Compare tanque, motor, farol, rodas e carenagem. Se a moto estiver diferente, ajuste o nome, use fotos ou gere outra prévia.':queueStatus==='pending'||queueStatus==='processing'?'A fila está preparando uma prévia. Ela aparecerá aqui para revisão.':'Uma tentativa consome parte da cota diária. A miniatura atual só muda após aprovação.'}</p>
        {preview&&<div className="model-preview-review"><div><strong>Revisão final</strong><small>A aprovação compartilha esta imagem com as OS do mesmo modelo.</small></div><button type="button" className={confirmed?'is-confirmed':''} aria-pressed={confirmed} onClick={()=>setConfirmed(value=>!value)}><span aria-hidden="true">{confirmed?'✓':'○'}</span>{confirmed?'Modelo conferido':'Esta é a moto correta'}</button></div>}
        {error&&<p className="model-preview-error" role="alert">{error}</p>}
      </div>
      <footer><button className="model-preview-cancel" onClick={onClose} disabled={busy}>Cancelar</button><button className="model-preview-generate" onClick={()=>void generate()} disabled={busy}>{busy?'Aguarde…':preview?'Gerar novamente':'Gerar prévia'}</button><button className="model-preview-approve" onClick={()=>void approve()} disabled={busy||!preview||!confirmed}>Aprovar miniatura</button></footer>
    </section>
    {zoom&&preview&&<div className="model-preview-zoom-backdrop" role="dialog" aria-modal="true" aria-label="Miniatura em tela cheia" onClick={()=>setZoom(false)}><button type="button" onClick={()=>setZoom(false)} aria-label="Fechar imagem ampliada">✕ Fechar</button><img src={preview} alt={`Miniatura completa de ${draft?.model||fullModel}`} onClick={event=>event.stopPropagation()}/></div>}
  </div>,document.body);
}
