import { contaPreferenciasAtual,enviarSomConta,buscarSomConta } from './sincronizacaoConta';
import {
  chaveNotificacoes,
  lerConfigNotificacoes,
  somDoEvento,
} from "./preferenciasNotificacoes";
export type SomPredefinido = "brisa" | "sino" | "madeira" | "toque";
export type SomNotificacao = SomPredefinido | "personalizado";

export const sonsPredefinidos: {
  id: SomPredefinido;
  nome: string;
  descricao: string;
}[] = [
  { id: "brisa", nome: "Brisa", descricao: "Dois tons leves e curtos" },
  {
    id: "sino",
    nome: "Sino suave",
    descricao: "Um toque discreto e acolhedor",
  },
  { id: "madeira", nome: "Madeira", descricao: "Dois cliques macios" },
  { id: "toque", nome: "Toque curto", descricao: "Um único tom breve" },
];

const DB_NAME = "estacao-motos-preferencias";
const STORE_NAME = "sons";
const recordKey = () => chaveNotificacoes("audio");
const MAX_BYTES = 1_500_000;
const MAX_SECONDS = 8;
const acceptedExtensions = new Set([
  "wav",
  "mp3",
  "ogg",
  "oga",
  "m4a",
  "aac",
  "webm",
  "flac",
]);
const acceptedMimeTypes = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/x-m4a",
  "audio/mp3",
  "audio/x-flac",
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
  "audio/flac",
  "application/ogg",
]);

export type SomPersonalizadoMeta = {
  name: string;
  duration: number;
  size: number;
};
type SomRecord = SomPersonalizadoMeta & {
  versao?:string|null; blob: Blob; mimeType: string };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window))
      return reject(
        new Error(
          "Este navegador não oferece armazenamento seguro para o som.",
        ),
      );
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Não foi possível abrir o armazenamento local."));
  });
}

function storeRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = action(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          db.close();
          reject(
            new Error("Não foi possível salvar o arquivo neste navegador."),
          );
        };
        tx.onabort = () => {
          db.close();
          reject(new Error("O armazenamento local cancelou a operação."));
        };
      }),
  );
}

function getExtension(name: string): string {
  return name.split(".").pop()?.trim().toLowerCase() ?? "";
}

function validateDeclaredType(file: File): void {
  const extension = getExtension(file.name);
  if (!acceptedExtensions.has(extension))
    throw new Error("Use um arquivo WAV, MP3, OGG, M4A, AAC, WEBM ou FLAC.");
  if (file.type && !acceptedMimeTypes.has(file.type.toLowerCase()))
    throw new Error(
      "O tipo do arquivo não corresponde a um formato de áudio aceito.",
    );
  if (file.size <= 0)
    throw new Error("O arquivo está vazio. Escolha outro áudio.");
  if (file.size > MAX_BYTES)
    throw new Error("O arquivo deve ter no máximo 1,5 MB.");
}

async function verificarDuracao(file: File): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const timer = window.setTimeout(
      () =>
        finish(
          new Error(
            "O áudio demorou demais para ser verificado. Escolha outro arquivo.",
          ),
        ),
      5000,
    );
    let finished = false;
    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      error ? reject(error) : resolve();
    }
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      finish(
        !Number.isFinite(audio.duration) ||
          audio.duration < 0.25 ||
          audio.duration > MAX_SECONDS
          ? new Error("O som precisa ter entre 0,25 e 8 segundos.")
          : undefined,
      );
    audio.onerror = () =>
      finish(
        new Error(
          "O áudio não pôde ser validado. Escolha um arquivo de áudio válido.",
        ),
      );
    audio.src = url;
  });
}
function audioLimpo(decoded: AudioBuffer): Blob {
  const rate = Math.min(44100, decoded.sampleRate),
    channels = decoded.numberOfChannels,
    length = Math.floor(decoded.duration * rate);
  const buffer = new ArrayBuffer(44 + length * channels * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, buffer.byteLength - 44, true);
  const data = Array.from({ length: channels }, (_, i) =>
    decoded.getChannelData(i),
  );
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const source = Math.min(
      decoded.length - 1,
      Math.floor((i * decoded.sampleRate) / rate),
    );
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][source])) * 0.85;
      view.setInt16(offset, Math.round(sample * 32767), true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}
export async function salvarSomPersonalizado(
  file: File,
): Promise<SomPersonalizadoMeta> {
  const owner=contaPreferenciasAtual();const key=recordKey();
  validateDeclaredType(file);
  if (!("AudioContext" in window))
    throw new Error("Este navegador não consegue verificar arquivos de áudio.");
  await verificarDuracao(file);
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (
      !Number.isFinite(decoded.duration) ||
      decoded.duration < 0.25 ||
      decoded.duration > MAX_SECONDS
    )
      throw new Error("O som precisa ter entre 0,25 e 8 segundos.");
    if (
      decoded.sampleRate > 192000 ||
      decoded.numberOfChannels < 1 ||
      decoded.numberOfChannels > 2
    )
      throw new Error("O arquivo tem características de áudio não aceitas.");
    const blob = audioLimpo(decoded);
    const meta = {
      name: file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 100),
      duration: decoded.duration,
      size: blob.size,
    };
    if(owner!==contaPreferenciasAtual())throw new Error('A conta mudou durante o envio do áudio.');
    const versao=owner?await enviarSomConta({name:meta.name,base64:await base64DoBlob(blob)}):undefined;
    versaoRemotaSom=versao;
    await storeRequest<IDBValidKey>('readwrite',store=>store.put({...meta,blob,mimeType:'audio/wav',versao},key));
    if(owner!==contaPreferenciasAtual())throw new Error('A conta mudou durante o envio do áudio.');
    return meta;
  } catch (error) {
    if (
      error instanceof Error &&
      /O som|características|armazenamento|navegador|conta|conexão|salva|áudio/.test(error.message)
    )
      throw error;
    throw new Error(
      "O áudio não pôde ser validado. Tente outro arquivo WAV, MP3 ou OGG.",
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}

let versaoRemotaSom:string|null|undefined;
export function definirVersaoSomConta(value:string|null){versaoRemotaSom=value;}
async function base64DoBlob(blob:Blob):Promise<string>{const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
async function registroSomConta():Promise<SomRecord|undefined>{
 const owner=contaPreferenciasAtual();const key=recordKey();
 let local=await storeRequest<SomRecord|undefined>('readonly',store=>store.get(key));
 if(owner!==contaPreferenciasAtual())throw new Error('A conta mudou durante a consulta do áudio.');
 if(!contaPreferenciasAtual()||versaoRemotaSom===undefined)return local;
 if(local&&versaoRemotaSom===null){const versao=await enviarSomConta({name:local.name,base64:await base64DoBlob(local.blob)});local={...local,versao};versaoRemotaSom=versao;await storeRequest<IDBValidKey>('readwrite',store=>store.put(local,key));return local;}
 if(local&&local.versao===versaoRemotaSom)return local;
 if(!local&&versaoRemotaSom===null)return undefined;
 const remote=await buscarSomConta();if(!remote?.som){await storeRequest<undefined>('readwrite',store=>store.delete(key));return undefined;}
 const bytes=Uint8Array.from(atob(remote.som.base64),c=>c.charCodeAt(0));const record:SomRecord={name:remote.som.name,duration:remote.som.duration,size:bytes.length,blob:new Blob([bytes],{type:'audio/wav'}),mimeType:'audio/wav',versao:remote.versao};versaoRemotaSom=remote.versao;await storeRequest<IDBValidKey>('readwrite',store=>store.put(record,key));return record;
}
export async function buscarSomPersonalizadoMeta():Promise<SomPersonalizadoMeta|null>{const record=await registroSomConta();return record?{name:record.name,duration:record.duration,size:record.size}:null;}
export async function removerSomPersonalizado():Promise<void>{const key=recordKey();if(contaPreferenciasAtual())versaoRemotaSom=await enviarSomConta(null);await storeRequest<undefined>('readwrite',store=>store.delete(key));}

let contextoCompartilhado: AudioContext | null = null;
const fontesPrevia = new Set<AudioScheduledSourceNode>();
export function pararPreviaSom() {
  for (const fonte of fontesPrevia) {
    try {
      fonte.stop();
    } catch {}
  }
  fontesPrevia.clear();
}
function contextoAudio() {
  if (!contextoCompartilhado || contextoCompartilhado.state === "closed")
    contextoCompartilhado = new AudioContext();
  return contextoCompartilhado;
}
export async function prepararAudioNotificacoes(
  forcar = false,
): Promise<boolean> {
  try {
    if (!forcar && !lerConfigNotificacoes().ativo) return false;
    const context = contextoAudio();
    if (context.state === "running") return true;
    await context.resume();
    return String(context.state) === "running";
  } catch {
    return false;
  }
}
const patterns: Record<
  SomPredefinido,
  { notes: [number, number, OscillatorType, number][]; volume: number }
> = {
  brisa: {
    notes: [
      [740, 0, "sine", 0.16],
      [988, 0.19, "sine", 0.2],
    ],
    volume: 0.035,
  },
  sino: {
    notes: [
      [659, 0, "sine", 0.34],
      [988, 0.015, "sine", 0.27],
      [1318, 0.03, "sine", 0.2],
    ],
    volume: 0.025,
  },
  madeira: {
    notes: [
      [523, 0, "triangle", 0.12],
      [659, 0.16, "triangle", 0.13],
    ],
    volume: 0.035,
  },
  toque: { notes: [[784, 0, "sine", 0.18]], volume: 0.032 },
};

async function contextoPronto() {
  const context = contextoAudio();
  if (context.state !== "running") {
    await Promise.race([
      context.resume(),
      new Promise((_, reject) =>
        window.setTimeout(
          () =>
            reject(
              new Error(
                "Clique em “Ouvir som” para habilitar o áudio neste navegador.",
              ),
            ),
          1500,
        ),
      ),
    ]);
  }
  if (context.state !== "running")
    throw new Error(
      "O áudio ainda está bloqueado pelo navegador. Clique em “Ouvir som”.",
    );
  return context;
}
export async function reproduzirSom(
  id: SomNotificacao,
  preview = true,
  volume = 35,
): Promise<void> {
  if (!["brisa", "sino", "madeira", "toque", "personalizado"].includes(id))
    throw new Error("Som inválido. Escolha um dos sons disponíveis.");
  volume = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 35;
  if (preview) pararPreviaSom();
  if (volume === 0) return;
  const context = await contextoPronto();
  if (id === "personalizado") {
    const record = await registroSomConta();
    if (!record)
      throw new Error("Adicione um áudio personalizado antes de selecioná-lo.");
    const buffer = await context.decodeAudioData(
      await record.blob.arrayBuffer(),
    );
    if (buffer.duration > 8.01)
      throw new Error("O áudio armazenado excede a duração permitida.");
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = (volume / 100) * 0.7;
    source.connect(gain);
    gain.connect(context.destination);
    if (preview) fontesPrevia.add(source);
    source.onended = () => {
      fontesPrevia.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    return;
  }
  const start = context.currentTime + 0.025;
  for (const [frequency, offset, waveform, duration] of patterns[id].notes) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    envelope.gain.setValueAtTime(0.0001, start + offset);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, (patterns[id].volume * volume) / 35),
      start + offset + 0.025,
    );
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      start + offset + duration,
    );
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    if (preview) fontesPrevia.add(oscillator);
    oscillator.onended = () => {
      fontesPrevia.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(start + offset);
    oscillator.stop(start + offset + duration + 0.015);
  }
}
let ultimaNotificacao = 0;
export async function reproduzirSomDeNotificacaoNovo(
  tipos: string[],
): Promise<void> {
  try {
    const config = lerConfigNotificacoes();
    const som = tipos.map((tipo) => somDoEvento(tipo, config)).find(Boolean);
    if (!som || Date.now() - ultimaNotificacao < 1500) return;
    await reproduzirSom(som, false, config.volume);
    ultimaNotificacao = Date.now();
  } catch {
    /* Uma falha de áudio nunca bloqueia os avisos. */
  }
}
