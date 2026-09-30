import { useEffect, useState } from 'react';
import { ilustracaoModelo } from './ilustracoesModelos';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
async function imageApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(data?.message || `Erro ao preparar miniatura (HTTP ${response.status}).`);
  return data as T;
}
export function buscarModelosMotocicleta() { return imageApi<{ models: string[] }>('/api/motorcycle-models'); }
export function gerarRascunhoMotocicleta(id: number, model: string, notes: string, references: string[], family?:string) {
  return imageApi<{ draftId: string; model:string; image: string }>(`/api/orders/${id}/model-preview/draft`, { model, family, notes, references });
}
export function aprovarRascunhoMotocicleta(id: number, draftId: string) {
  return imageApi<{ ok: true }>(`/api/orders/${id}/model-preview/approve`, { draftId });
}
export type PesquisaModelo={title:string;summary:string;url:string;matched:boolean;warning:string};
export type SugestaoModelo={name:string;source:'catalog'|'wikipedia';url?:string};
export function buscarPesquisaModelo(model:string) {
  return imageApi<{formattedModel:string;research:PesquisaModelo|null;suggestions:SugestaoModelo[]}>(`/api/motorcycle-models/research?model=${encodeURIComponent(model)}`);
}
export function buscarCandidatoDaFila(id:number) {
  return imageApi<{candidate:string|null;status:string|null}>(`/api/orders/${id}/model-preview/candidate`);
}
export function buscarCandidatoMoto(id:number){return imageApi<{candidate:string|null;status:string|null}>(`/api/motorcycles/${id}/model-preview/candidate`);}
export function aprovarCandidatoMoto(id:number){return imageApi<{ok:true}>(`/api/motorcycles/${id}/model-preview/candidate/approve`,{confirmed:true});}
export function gerarRascunhoMoto(id:number,model:string,notes:string,references:string[]){
  return imageApi<{draftId:string;model:string;image:string}>(`/api/motorcycles/${id}/model-preview/draft`,{model,family:model,notes,references});
}
export function aprovarRascunhoMoto(id:number,draftId:string){return imageApi<{ok:true}>(`/api/motorcycles/${id}/model-preview/approve`,{draftId});}
export function aprovarCandidatoDaFila(id:number) {
  return imageApi<{ok:true}>(`/api/orders/${id}/model-preview/candidate/approve`,{confirmed:true});
}
type Origin = 'catalog' | 'generated' | 'missing';

type Paint = { rgb: [number, number, number]; mode?: 'white' | 'black' | 'silver' };
function paintFor(color: string | null): Paint | null {
  const value = (color || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (!value) return null;
  if (/branc/.test(value)) return { rgb: [255, 255, 255], mode: 'white' };
  if (/pret|negr/.test(value)) return { rgb: [18, 22, 27], mode: 'black' };
  if (/prat|cinz|grafite/.test(value)) return { rgb: [172, 181, 191], mode: 'silver' };
  if (/rox|violet|lilas/.test(value)) return { rgb: [136, 60, 184] };
  if (/ros|pink/.test(value)) return { rgb: [236, 84, 159] };
  if (/marrom|cafe/.test(value)) return { rgb: [126, 76, 42] };
  if (/dourad|ouro/.test(value)) return { rgb: [194, 146, 49] };
  if (/bege|creme/.test(value)) return { rgb: [195, 172, 130] };
  if (/ciano|turquesa/.test(value)) return { rgb: [28, 168, 178] };
  if (/vermelh|bordo/.test(value)) return { rgb: [220, 30, 42] };
  if (/azul/.test(value)) return { rgb: [30, 83, 193] };
  if (/verde/.test(value)) return { rgb: [40, 137, 67] };
  if (/amarel/.test(value)) return { rgb: [246, 179, 28] };
  if (/laranj/.test(value)) return { rgb: [236, 106, 25] };
  // Cores específicas cadastradas como #8844cc, rgb(...), hsl(...) ou nomes CSS.
  if (typeof document !== 'undefined' && CSS.supports('color', value)) {
    const swatch = document.createElement('canvas'); swatch.width = swatch.height = 1;
    const context = swatch.getContext('2d');
    if (context) { context.fillStyle = value; context.fillRect(0, 0, 1, 1); const rgb = context.getImageData(0, 0, 1, 1).data; return { rgb: [rgb[0], rgb[1], rgb[2]] }; }
  }
  return null;
}

function hue(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (!delta) return 0;
  const raw = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
}

// Só altera a pintura vermelha/azul saturada; transparência, pneus e metal permanecem intactos.
export function recolorirPintura(pixels: Uint8ClampedArray, sourceHue: number, target: Paint | null) {
  if (!target) return;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, alpha] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (alpha < 40) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 55 || (max - min) / max < 0.36) continue;
    const distance = Math.abs(hue(r, g, b) - sourceHue);
    if (Math.min(distance, 360 - distance) > 42) continue;
    const brightness = max / 255;
    if (target.mode === 'white') {
      const shade = Math.round(150 + brightness * 105);
      pixels[i] = shade; pixels[i + 1] = shade; pixels[i + 2] = shade;
    } else if (target.mode === 'black') {
      const shade = Math.round(12 + brightness * 47);
      pixels[i] = shade; pixels[i + 1] = shade; pixels[i + 2] = shade + 2;
    } else if (target.mode === 'silver') {
      const shade = Math.round(86 + brightness * 130);
      pixels[i] = shade; pixels[i + 1] = shade + 3; pixels[i + 2] = shade + 7;
    } else {
      const factor = 0.3 + brightness * 0.8;
      pixels[i] = Math.min(255, target.rgb[0] * factor);
      pixels[i + 1] = Math.min(255, target.rgb[1] * factor);
      pixels[i + 2] = Math.min(255, target.rgb[2] * factor);
    }
  }
}

// O FLUX devolve JPEG sem canal alfa. Remove apenas o branco conectado às bordas,
// preservando as peças claras isoladas no interior da silhueta da moto.
export function removerFundoBranco(pixels: Uint8ClampedArray, width: number, height: number) {
  const count = width * height;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  const enqueue = (index: number) => {
    if (visited[index]) return;
    const offset = index * 4;
    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    if (Math.min(r, g, b) < 229 || Math.max(r, g, b) - Math.min(r, g, b) > 23) return;
    visited[index] = 1; queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++];
    pixels[index * 4 + 3] = 0;
    const x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < count - width) enqueue(index + width);
  }
}

async function coloredThumbnail(blob: Blob, sourceHue: number, color: string | null, trimMargins = false): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 768 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas indisponível');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const cornerIsWhite = image.data[3] === 255 && Math.min(image.data[0], image.data[1], image.data[2]) > 229;
  if (blob.type === 'image/jpeg' || cornerIsWhite) removerFundoBranco(image.data, canvas.width, canvas.height);
  recolorirPintura(image.data, sourceHue, paintFor(color));
  context.putImageData(image, 0, 0);
  let output = canvas;
  if (trimMargins) {
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (image.data[(y * canvas.width + x) * 4 + 3] < 96) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    if (right >= left && bottom >= top) {
      const padding = Math.max(8, Math.round(Math.max(right - left, bottom - top) * 0.06));
      left = Math.max(0, left - padding); top = Math.max(0, top - padding);
      right = Math.min(canvas.width - 1, right + padding);
      bottom = Math.min(canvas.height - 1, bottom + padding);
      const cropped = document.createElement('canvas');
      cropped.width = right - left + 1; cropped.height = bottom - top + 1;
      const croppedContext = cropped.getContext('2d');
      if (croppedContext) {
        croppedContext.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
        output = cropped;
      }
    }
  }
  return new Promise((resolve, reject) => output.toBlob(result => result ? resolve(result) : reject(new Error('Falha ao converter miniatura')), 'image/webp', 0.85));
}

export function useMiniaturaMotocicleta(orderId: number, model: string | undefined, color: string | null | undefined, revision = 0) {
  const [image, setImage] = useState<{ url: string | null; origin: Origin; loading: boolean; error: string | null }>({ url: null, origin: 'missing', loading: true, error: null });
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    if (!model || !Number.isSafeInteger(orderId)) {
      setImage({ url: null, origin: 'missing', loading: false, error: null });
      return () => { active = false; controller.abort(); };
    }
    setImage({ url: null, origin: 'missing', loading: true, error: null });
    const catalog = ilustracaoModelo(model);
    (async () => {
      let origin: Origin = 'generated';
      // A miniatura aprovada pelo administrador prevalece inclusive sobre o catálogo local.
      let response: Response;
      while (true) {
        response = await fetch(`${API_URL}/api/orders/${orderId}/model-preview`, {
          credentials: 'include', cache: 'no-store', signal: controller.signal,
        });
        if (response.status !== 202) break;
        const job = await response.json().catch(() => ({})) as { status?: string; nextRetryAt?: string };
        if (job.status === 'needs_review') {
          if (active) setImage({url:null,origin:'missing',loading:false,error:'Prévia criada. Aguardando revisão do administrador.'});
          return;
        }
        if (active) setImage({ url:null,origin:'missing',loading:true,error:job.status === 'waiting_quota' ? 'Aguardando renovação da cota para criar a miniatura…' : 'Miniatura na fila de geração…' });
        await new Promise(resolve => setTimeout(resolve, job.status === 'waiting_quota' ? 300_000 : 5_000));
        if (!active) return;
      }
      if (!response.ok && catalog) {
        response = await fetch(catalog.src, { signal: controller.signal });
        origin = 'catalog';
      }
      if (!response.ok) {
        const details = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(details?.message || `Miniatura indisponível (HTTP ${response.status}).`);
      }
      if (!(response.headers.get('content-type') || '').startsWith('image/')) throw new Error('Miniatura indisponível');
      const thumb = await coloredThumbnail(await response.blob(), origin === 'catalog' && !catalog?.src.includes('urbana-160') ? 217 : 0, color || 'prata');
      if (!active) return;
      objectUrl = URL.createObjectURL(thumb);
      setImage({ url: objectUrl, origin, loading: false, error: null });
    })().catch(error => { if (active) setImage({ url: null, origin: 'missing', loading: false,
      error: error instanceof Error ? error.message : 'Não foi possível preparar a miniatura.' }); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [orderId, model, color, revision]);
  return image;
}

export function useMiniaturaModeloMotocicleta(model:string,color:string|null,revision=0){
  const [image,setImage]=useState<string|null>(null);
  useEffect(()=>{
    setImage(null);
    if(!model)return;
    let active=true;let url:string|null=null;
    const controller=new AbortController();
    const catalog=ilustracaoModelo(model);
    (async()=>{
      let response=await fetch(`${API_URL}/api/motorcycle-thumbnails/image?model=${encodeURIComponent(model)}`,{
        credentials:'include',cache:'no-store',signal:controller.signal,
      });
      let origin:'generated'|'catalog'='generated';
      if((!response.ok||response.status===202)&&catalog){response=await fetch(catalog.src,{signal:controller.signal});origin='catalog';}
      if(!response.ok||response.status===202||!(response.headers.get('content-type')||'').startsWith('image/'))return;
      const blob=await coloredThumbnail(await response.blob(),origin==='catalog'&&!catalog?.src.includes('urbana-160')?217:0,color);
      if(!active)return;url=URL.createObjectURL(blob);setImage(url);
    })().catch(()=>{});
    return()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url);};
  },[model,color,revision]);
  return image;
}

// Prévia do cadastro: consulta miniaturas prontas sem enfileirar os fragmentos
// digitados pelo usuário como se fossem novos modelos.
export function useMiniaturaExistente(model:string,color:string|null){
  const [image,setImage]=useState<string|null>(null);
  useEffect(()=>{
    setImage(null);
    if(model.trim().length<4)return;
    const controller=new AbortController();let objectUrl:string|null=null;let active=true;
    const timer=window.setTimeout(async()=>{
      try{
        const response=await fetch(`${API_URL}/api/motorcycle-thumbnails/preview-existing?model=${encodeURIComponent(model.trim())}`,{credentials:'include',cache:'no-store',signal:controller.signal});
        if(!response.ok||!(response.headers.get('content-type')||'').startsWith('image/'))return;
        const catalog=ilustracaoModelo(model);
        const sourceHue=response.headers.get('x-preview-origin')==='catalog'&&!catalog?.src.includes('urbana-160')?217:0;
        const blob=await coloredThumbnail(await response.blob(),sourceHue,color,true);
        if(!active)return;
        objectUrl=URL.createObjectURL(blob);setImage(objectUrl);
      }catch{}
    },500);
    return()=>{active=false;window.clearTimeout(timer);controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[model,color]);
  return image;
}
