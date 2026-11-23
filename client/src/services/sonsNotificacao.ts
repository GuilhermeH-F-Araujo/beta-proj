import {
  chaveNotificacoes,
  lerConfiguracaoNotificacoes,
  somDoEvento,
} from './preferenciasNotificacoes';
import { buscarSomConta, contaPreferenciasAtual, enviarSomConta } from './sincronizacaoConta';
export type SomPredefinido = 'brisa' | 'sino' | 'madeira' | 'toque';
export type SomNotificacao = SomPredefinido | 'personalizado';

export const sonsPredefinidos: {
  id: SomPredefinido;
  nome: string;
  descricao: string;
}[] = [
  { id: 'brisa', nome: 'Brisa', descricao: 'Dois tons leves e curtos' },
  {
    id: 'sino',
    nome: 'Sino suave',
    descricao: 'Um toque discreto e acolhedor',
  },
  { id: 'madeira', nome: 'Madeira', descricao: 'Dois cliques macios' },
  { id: 'toque', nome: 'Toque curto', descricao: 'Um único tom breve' },
];

const NOME_BANCO = 'estacao-motos-preferencias';
const NOME_ARMAZENAMENTO = 'sons';
const registroChave = () => chaveNotificacoes('audio');
const MAXIMO_BYTES = 1_500_000;
const MAXIMO_SEGUNDOS = 8;
const acceptedExtensions = new Set(['wav', 'mp3', 'ogg', 'oga', 'm4a', 'aac', 'webm', 'flac']);
const acceptedTipoArquivoTypes = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/x-m4a',
  'audio/mp3',
  'audio/x-flac',
  'audio/mpeg',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/webm',
  'audio/flac',
  'application/ogg',
]);

export type SomPersonalizadoMeta = {
  name: string;
  duration: number;
  size: number;
};
type SomRegistro = SomPersonalizadoMeta & {
  versao?: string | null;
  blob: Blob;
  mimeType: string;
};

function abertoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    if (!('indexedDB' in window))
      return rejeitar(new Error('Este navegador não oferece armazenamento seguro para o som.'));
    const request = indexedDB.open(NOME_BANCO, 1);
    request.onupgradeneeded = () => {
      const banco = request.result;
      if (!banco.objectStoreNames.contains(NOME_ARMAZENAMENTO))
        banco.createObjectStore(NOME_ARMAZENAMENTO);
    };
    request.onsuccess = () => resolver(request.result);
    request.onerror = () => rejeitar(new Error('Não foi possível abrir o armazenamento local.'));
  });
}

function armazenamentoRequisicao<T>(
  modo: IDBTransactionMode,
  acao: (armazenamento: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abertoDatabase().then(
    (banco) =>
      new Promise<T>((resolver, rejeitar) => {
        const transacao = banco.transaction(NOME_ARMAZENAMENTO, modo);
        const request = acao(transacao.objectStore(NOME_ARMAZENAMENTO));
        transacao.oncomplete = () => {
          banco.close();
          resolver(request.result);
        };
        transacao.onerror = () => {
          banco.close();
          rejeitar(new Error('Não foi possível salvar o arquivo neste navegador.'));
        };
        transacao.onabort = () => {
          banco.close();
          rejeitar(new Error('O armazenamento local cancelou a operação.'));
        };
      }),
  );
}

function obterExtensao(nomeLocal: string): string {
  return nomeLocal.split('.').pop()?.trim().toLowerCase() ?? '';
}

function validateDeclaredTipo(arquivo: File): void {
  const extensao = obterExtensao(arquivo.name);
  if (!acceptedExtensions.has(extensao))
    throw new Error('Use um arquivo WAV, MP3, OGG, M4A, AAC, WEBM ou FLAC.');
  if (arquivo.type && !acceptedTipoArquivoTypes.has(arquivo.type.toLowerCase()))
    throw new Error('O tipo do arquivo não corresponde a um formato de áudio aceito.');
  if (arquivo.size <= 0) throw new Error('O arquivo está vazio. Escolha outro áudio.');
  if (arquivo.size > MAXIMO_BYTES) throw new Error('O arquivo deve ter no máximo 1,5 MB.');
}

async function verificarDuracao(arquivo: File): Promise<void> {
  await new Promise<void>((resolver, rejeitar) => {
    const url = URL.createObjectURL(arquivo);
    const audio = new Audio();
    const temporizador = window.setTimeout(
      () =>
        finalizar(new Error('O áudio demorou demais para ser verificado. Escolha outro arquivo.')),
      5000,
    );
    let finalizado = false;
    function finalizar(erro?: Error) {
      if (finalizado) return;
      finalizado = true;
      window.clearTimeout(temporizador);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      erro ? rejeitar(erro) : resolver();
    }
    audio.preload = 'metadata';
    audio.onloadedmetadata = () =>
      finalizar(
        !Number.isFinite(audio.duration) ||
          audio.duration < 0.25 ||
          audio.duration > MAXIMO_SEGUNDOS
          ? new Error('O som precisa ter entre 0,25 e 8 segundos.')
          : undefined,
      );
    audio.onerror = () =>
      finalizar(new Error('O áudio não pôde ser validado. Escolha um arquivo de áudio válido.'));
    audio.src = url;
  });
}
function audioLimpo(decodificado: AudioBuffer): Blob {
  const taxa = Math.min(44100, decodificado.sampleRate);
  const canais = decodificado.numberOfChannels;
  const comprimento = Math.floor(decodificado.duration * taxa);
  const buffer = new ArrayBuffer(44 + comprimento * canais * 2);
  const visualizacao = new DataView(buffer);
  const texto = (deslocamento: number, valor: string) => {
    for (let indice = 0; indice < valor.length; indice++)
      visualizacao.setUint8(deslocamento + indice, valor.charCodeAt(indice));
  };
  texto(0, 'RIFF');
  visualizacao.setUint32(4, buffer.byteLength - 8, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  visualizacao.setUint32(16, 16, true);
  visualizacao.setUint16(20, 1, true);
  visualizacao.setUint16(22, canais, true);
  visualizacao.setUint32(24, taxa, true);
  visualizacao.setUint32(28, taxa * canais * 2, true);
  visualizacao.setUint16(32, canais * 2, true);
  visualizacao.setUint16(34, 16, true);
  texto(36, 'data');
  visualizacao.setUint32(40, buffer.byteLength - 44, true);
  const dados = Array.from({ length: canais }, (_, indice) => decodificado.getChannelData(indice));
  let deslocamento = 44;
  for (let indice = 0; indice < comprimento; indice++) {
    const origemDados = Math.min(
      decodificado.length - 1,
      Math.floor((indice * decodificado.sampleRate) / taxa),
    );
    for (let canal = 0; canal < canais; canal++) {
      const amostra = Math.max(-1, Math.min(1, dados[canal][origemDados])) * 0.85;
      visualizacao.setInt16(deslocamento, Math.round(amostra * 32767), true);
      deslocamento += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
export async function salvarSomPersonalizado(arquivo: File): Promise<SomPersonalizadoMeta> {
  const responsavel = contaPreferenciasAtual();
  const chave = registroChave();
  validateDeclaredTipo(arquivo);
  if (!('AudioContext' in window))
    throw new Error('Este navegador não consegue verificar arquivos de áudio.');
  await verificarDuracao(arquivo);
  const contexto = new AudioContext();
  try {
    const decodificado = await contexto.decodeAudioData(await arquivo.arrayBuffer());
    if (
      !Number.isFinite(decodificado.duration) ||
      decodificado.duration < 0.25 ||
      decodificado.duration > MAXIMO_SEGUNDOS
    )
      throw new Error('O som precisa ter entre 0,25 e 8 segundos.');
    if (
      decodificado.sampleRate > 192000 ||
      decodificado.numberOfChannels < 1 ||
      decodificado.numberOfChannels > 2
    )
      throw new Error('O arquivo tem características de áudio não aceitas.');
    const blob = audioLimpo(decodificado);
    const meta = {
      name: arquivo.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100),
      duration: decodificado.duration,
      size: blob.size,
    };
    if (responsavel !== contaPreferenciasAtual())
      throw new Error('A conta mudou durante o envio do áudio.');
    const versao = responsavel
      ? await enviarSomConta({ name: meta.name, base64: await base64DoBlob(blob) })
      : undefined;
    versaoRemotaSom = versao;
    await armazenamentoRequisicao<IDBValidKey>('readwrite', (armazenamento) =>
      armazenamento.put({ ...meta, blob, mimeType: 'audio/wav', versao }, chave),
    );
    if (responsavel !== contaPreferenciasAtual())
      throw new Error('A conta mudou durante o envio do áudio.');
    return meta;
  } catch (erro) {
    if (
      erro instanceof Error &&
      /O som|características|armazenamento|navegador|conta|conexão|salva|áudio/.test(erro.message)
    )
      throw erro;
    throw new Error('O áudio não pôde ser validado. Tente outro arquivo WAV, MP3 ou OGG.');
  } finally {
    await contexto.close().catch(() => undefined);
  }
}

let versaoRemotaSom: string | null | undefined;
export function setVersaoSomConta(valor: string | null) {
  versaoRemotaSom = valor;
}
async function base64DoBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (let indice = 0; indice < bytes.length; indice += 32768)
    binario += String.fromCharCode(...bytes.subarray(indice, indice + 32768));
  return btoa(binario);
}
async function registroSomConta(): Promise<SomRegistro | undefined> {
  const responsavel = contaPreferenciasAtual();
  const chave = registroChave();
  let local = await armazenamentoRequisicao<SomRegistro | undefined>('readonly', (armazenamento) =>
    armazenamento.get(chave),
  );
  if (responsavel !== contaPreferenciasAtual())
    throw new Error('A conta mudou durante a consulta do áudio.');
  if (!contaPreferenciasAtual() || versaoRemotaSom === undefined) return local;
  if (local && versaoRemotaSom === null) {
    const versao = await enviarSomConta({
      name: local.name,
      base64: await base64DoBlob(local.blob),
    });
    local = { ...local, versao };
    versaoRemotaSom = versao;
    await armazenamentoRequisicao<IDBValidKey>('readwrite', (armazenamento) =>
      armazenamento.put(local, chave),
    );
    return local;
  }
  if (local && local.versao === versaoRemotaSom) return local;
  if (!local && versaoRemotaSom === null) return undefined;
  const remoto = await buscarSomConta();
  if (!remoto?.som) {
    await armazenamentoRequisicao<undefined>('readwrite', (armazenamento) =>
      armazenamento.delete(chave),
    );
    return undefined;
  }
  const bytes = Uint8Array.from(atob(remoto.som.base64), (elementoAtual) =>
    elementoAtual.charCodeAt(0),
  );
  const registro: SomRegistro = {
    name: remoto.som.name,
    duration: remoto.som.duration,
    size: bytes.length,
    blob: new Blob([bytes], { type: 'audio/wav' }),
    mimeType: 'audio/wav',
    versao: remoto.versao,
  };
  versaoRemotaSom = remoto.versao;
  await armazenamentoRequisicao<IDBValidKey>('readwrite', (armazenamento) =>
    armazenamento.put(registro, chave),
  );
  return registro;
}
export async function buscarSomPersonalizadoMeta(): Promise<SomPersonalizadoMeta | null> {
  const registro = await registroSomConta();
  return registro
    ? { name: registro.name, duration: registro.duration, size: registro.size }
    : null;
}
export async function removerSomPersonalizado(): Promise<void> {
  const chave = registroChave();
  if (contaPreferenciasAtual()) versaoRemotaSom = await enviarSomConta(null);
  await armazenamentoRequisicao<undefined>('readwrite', (armazenamento) =>
    armazenamento.delete(chave),
  );
}

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
  if (!contextoCompartilhado || contextoCompartilhado.state === 'closed')
    contextoCompartilhado = new AudioContext();
  return contextoCompartilhado;
}
export async function prepararAudioNotificacoes(forcar = false): Promise<boolean> {
  try {
    if (!forcar && !lerConfiguracaoNotificacoes().ativo) return false;
    const contexto = contextoAudio();
    if (contexto.state === 'running') return true;
    await contexto.resume();
    return String(contexto.state) === 'running';
  } catch {
    return false;
  }
}
const padroesSonoros: Record<
  SomPredefinido,
  { notes: [number, number, OscillatorType, number][]; volume: number }
> = {
  brisa: {
    notes: [
      [740, 0, 'sine', 0.16],
      [988, 0.19, 'sine', 0.2],
    ],
    volume: 0.035,
  },
  sino: {
    notes: [
      [659, 0, 'sine', 0.34],
      [988, 0.015, 'sine', 0.27],
      [1318, 0.03, 'sine', 0.2],
    ],
    volume: 0.025,
  },
  madeira: {
    notes: [
      [523, 0, 'triangle', 0.12],
      [659, 0.16, 'triangle', 0.13],
    ],
    volume: 0.035,
  },
  toque: { notes: [[784, 0, 'sine', 0.18]], volume: 0.032 },
};

async function contextoPronto() {
  const contexto = contextoAudio();
  if (contexto.state !== 'running') {
    await Promise.race([
      contexto.resume(),
      new Promise((_, rejeitar) =>
        window.setTimeout(
          () =>
            rejeitar(new Error('Clique em “Ouvir som” para habilitar o áudio neste navegador.')),
          1500,
        ),
      ),
    ]);
  }
  if (contexto.state !== 'running')
    throw new Error('O áudio ainda está bloqueado pelo navegador. Clique em “Ouvir som”.');
  return contexto;
}
export async function reproduzirSom(id: SomNotificacao, previa = true, volume = 35): Promise<void> {
  if (!['brisa', 'sino', 'madeira', 'toque', 'personalizado'].includes(id))
    throw new Error('Som inválido. Escolha um dos sons disponíveis.');
  volume = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 35;
  if (previa) pararPreviaSom();
  if (volume === 0) return;
  const contexto = await contextoPronto();
  if (id === 'personalizado') {
    const registro = await registroSomConta();
    if (!registro) throw new Error('Adicione um áudio personalizado antes de selecioná-lo.');
    const buffer = await contexto.decodeAudioData(await registro.blob.arrayBuffer());
    if (buffer.duration > 8.01) throw new Error('O áudio armazenado excede a duração permitida.');
    const origemDados = contexto.createBufferSource();
    const ganho = contexto.createGain();
    origemDados.buffer = buffer;
    ganho.gain.value = (volume / 100) * 0.7;
    origemDados.connect(ganho);
    ganho.connect(contexto.destination);
    if (previa) fontesPrevia.add(origemDados);
    origemDados.onended = () => {
      fontesPrevia.delete(origemDados);
      origemDados.disconnect();
      ganho.disconnect();
    };
    origemDados.start();
    return;
  }
  const inicio = contexto.currentTime + 0.025;
  for (const [frequencia, deslocamento, formaOnda, duracao] of padroesSonoros[id].notes) {
    const oscilador = contexto.createOscillator();
    const envoltoria = contexto.createGain();
    oscilador.type = formaOnda;
    oscilador.frequency.setValueAtTime(frequencia, inicio + deslocamento);
    envoltoria.gain.setValueAtTime(0.0001, inicio + deslocamento);
    envoltoria.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, (padroesSonoros[id].volume * volume) / 35),
      inicio + deslocamento + 0.025,
    );
    envoltoria.gain.exponentialRampToValueAtTime(0.0001, inicio + deslocamento + duracao);
    oscilador.connect(envoltoria);
    envoltoria.connect(contexto.destination);
    if (previa) fontesPrevia.add(oscilador);
    oscilador.onended = () => {
      fontesPrevia.delete(oscilador);
      oscilador.disconnect();
      envoltoria.disconnect();
    };
    oscilador.start(inicio + deslocamento);
    oscilador.stop(inicio + deslocamento + duracao + 0.015);
  }
}
let ultimaNotificacao = 0;
export async function reproduzirSomDeNotificacaoNovo(tipos: string[]): Promise<void> {
  try {
    const configuracao = lerConfiguracaoNotificacoes();
    const som = tipos.map((tipo) => somDoEvento(tipo, configuracao)).find(Boolean);
    if (!som || Date.now() - ultimaNotificacao < 1500) return;
    await reproduzirSom(som, false, configuracao.volume);
    ultimaNotificacao = Date.now();
  } catch {
    /* Uma falha de audio nunca bloqueia os avisos. */
  }
}
