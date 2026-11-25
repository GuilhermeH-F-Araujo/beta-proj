import { useEffect, useState } from 'react';
import { ilustracaoModelo } from './ilustracoesModelos';

export type SituacaoMiniatura =
  | 'pendente'
  | 'processando'
  | 'aguardando_cota'
  | 'tentar_novamente'
  | 'aguardando_revisao'
  | 'concluido';

const API_URL = ((import.meta.env?.VITE_URL_API ?? import.meta.env?.VITE_API_URL) || '').replace(
  /\/$/,
  '',
);
// Uma unica notificacao atende os cards e as paginas sem exigir recarregamento.
const observadoresMiniaturas = new Set<() => void>();
let relogioMiniaturas: ReturnType<typeof setInterval> | null = null;
function useRevisaoMiniaturas() {
  const [revisao, setRevisao] = useState(0);
  useEffect(() => {
    const atualizar = () => setRevisao((atual) => atual + 1);
    observadoresMiniaturas.add(atualizar);
    window.addEventListener('miniaturas-publicadas', atualizar);
    if (!relogioMiniaturas)
      relogioMiniaturas = setInterval(() => {
        if (document.visibilityState === 'visible')
          observadoresMiniaturas.forEach((acao) => acao());
      }, 60_000);
    return () => {
      observadoresMiniaturas.delete(atualizar);
      window.removeEventListener('miniaturas-publicadas', atualizar);
      if (!observadoresMiniaturas.size && relogioMiniaturas) {
        clearInterval(relogioMiniaturas);
        relogioMiniaturas = null;
      }
    };
  }, []);
  return revisao;
}
type Origem = 'catalog' | 'generated' | 'missing';

type Pintura = { rgb: [number, number, number]; mode?: 'white' | 'black' | 'silver' };
function pintarPara(cor: string | null): Pintura | null {
  const valor = (cor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!valor) return null;
  if (/branc/.test(valor)) return { rgb: [255, 255, 255], mode: 'white' };
  if (/pret|negr/.test(valor)) return { rgb: [18, 22, 27], mode: 'black' };
  if (/prat|cinz|grafite/.test(valor)) return { rgb: [172, 181, 191], mode: 'silver' };
  if (/rox|violet|lilas/.test(valor)) return { rgb: [136, 60, 184] };
  if (/ros|pink/.test(valor)) return { rgb: [236, 84, 159] };
  if (/marrom|cafe/.test(valor)) return { rgb: [126, 76, 42] };
  if (/dourad|ouro/.test(valor)) return { rgb: [194, 146, 49] };
  if (/bege|creme/.test(valor)) return { rgb: [195, 172, 130] };
  if (/ciano|turquesa/.test(valor)) return { rgb: [28, 168, 178] };
  if (/vermelh|bordo/.test(valor)) return { rgb: [220, 30, 42] };
  if (/azul/.test(valor)) return { rgb: [30, 83, 193] };
  if (/verde/.test(valor)) return { rgb: [40, 137, 67] };
  if (/amarel/.test(valor)) return { rgb: [246, 179, 28] };
  if (/laranj/.test(valor)) return { rgb: [236, 106, 25] };
  // Cores especificas cadastradas como #8844cc, rgb(...), hsl(...) ou nomes CSS.
  if (typeof document !== 'undefined' && globalThis.CSS?.supports('color', valor)) {
    const amostraCor = document.createElement('canvas');
    amostraCor.width = amostraCor.height = 1;
    const contexto = amostraCor.getContext('2d');
    if (contexto) {
      contexto.fillStyle = valor;
      contexto.fillRect(0, 0, 1, 1);
      const rgb = contexto.getImageData(0, 0, 1, 1).data;
      return { rgb: [rgb[0], rgb[1], rgb[2]] };
    }
  }
  return null;
}

function matiz(resultadoAtual: number, grupoAtual: number, segundoElemento: number) {
  const maximo = Math.max(resultadoAtual, grupoAtual, segundoElemento);
  const minimo = Math.min(resultadoAtual, grupoAtual, segundoElemento);
  const diferenca = maximo - minimo;
  if (!diferenca) return 0;
  const bruto =
    maximo === resultadoAtual
      ? (grupoAtual - segundoElemento) / diferenca
      : maximo === grupoAtual
        ? (segundoElemento - resultadoAtual) / diferenca + 2
        : (resultadoAtual - grupoAtual) / diferenca + 4;
  return (bruto * 60 + 360) % 360;
}

// So altera a pintura vermelha/azul saturada; transparencia, pneus e metal permanecem intactos.
export function recolorirPintura(
  pixels: Uint8ClampedArray,
  matizOrigem: number,
  destino: Pintura | null,
) {
  if (!destino) return;
  for (let indice = 0; indice < pixels.length; indice += 4) {
    const [resultadoAtual, grupoAtual, segundoElemento, opacidade] = [
      pixels[indice],
      pixels[indice + 1],
      pixels[indice + 2],
      pixels[indice + 3],
    ];
    if (opacidade < 40) continue;
    const maximo = Math.max(resultadoAtual, grupoAtual, segundoElemento);
    const minimo = Math.min(resultadoAtual, grupoAtual, segundoElemento);
    if (maximo < 55 || (maximo - minimo) / maximo < 0.36) continue;
    const distancia = Math.abs(matiz(resultadoAtual, grupoAtual, segundoElemento) - matizOrigem);
    if (Math.min(distancia, 360 - distancia) > 42) continue;
    const brilho = maximo / 255;
    if (destino.mode === 'white') {
      const tonalidade = Math.round(150 + brilho * 105);
      pixels[indice] = tonalidade;
      pixels[indice + 1] = tonalidade;
      pixels[indice + 2] = tonalidade;
    } else if (destino.mode === 'black') {
      const tonalidade = Math.round(12 + brilho * 47);
      pixels[indice] = tonalidade;
      pixels[indice + 1] = tonalidade;
      pixels[indice + 2] = tonalidade + 2;
    } else if (destino.mode === 'silver') {
      const tonalidade = Math.round(86 + brilho * 130);
      pixels[indice] = tonalidade;
      pixels[indice + 1] = tonalidade + 3;
      pixels[indice + 2] = tonalidade + 7;
    } else {
      const fator = 0.3 + brilho * 0.8;
      pixels[indice] = Math.min(255, destino.rgb[0] * fator);
      pixels[indice + 1] = Math.min(255, destino.rgb[1] * fator);
      pixels[indice + 2] = Math.min(255, destino.rgb[2] * fator);
    }
  }
}

// O FLUX devolve JPEG sem canal alfa. Remove apenas o branco conectado as bordas,
// preservando as pecas claras isoladas no interior da silhueta da moto.
export function removerFundoBranco(pixels: Uint8ClampedArray, largura: number, altura: number) {
  const quantidade = largura * altura;
  const visitados = new Uint8Array(quantidade);
  const fila = new Int32Array(quantidade);
  let inicioFila = 0;
  let fimFila = 0;
  const enfileirar = (indiceLocal: number) => {
    if (visitados[indiceLocal]) return;
    const deslocamento = indiceLocal * 4;
    const resultadoAtual = pixels[deslocamento];
    const grupoAtual = pixels[deslocamento + 1];
    const segundoElemento = pixels[deslocamento + 2];
    if (
      Math.min(resultadoAtual, grupoAtual, segundoElemento) < 229 ||
      Math.max(resultadoAtual, grupoAtual, segundoElemento) -
        Math.min(resultadoAtual, grupoAtual, segundoElemento) >
        23
    )
      return;
    visitados[indiceLocal] = 1;
    fila[fimFila++] = indiceLocal;
  };
  for (let itemAtual = 0; itemAtual < largura; itemAtual++) {
    enfileirar(itemAtual);
    enfileirar((altura - 1) * largura + itemAtual);
  }
  for (let outroItem = 0; outroItem < altura; outroItem++) {
    enfileirar(outroItem * largura);
    enfileirar(outroItem * largura + largura - 1);
  }
  while (inicioFila < fimFila) {
    const indiceLocal = fila[inicioFila++];
    pixels[indiceLocal * 4 + 3] = 0;
    const itemAtual = indiceLocal % largura;
    if (itemAtual > 0) enfileirar(indiceLocal - 1);
    if (itemAtual < largura - 1) enfileirar(indiceLocal + 1);
    if (indiceLocal >= largura) enfileirar(indiceLocal - largura);
    if (indiceLocal < quantidade - largura) enfileirar(indiceLocal + largura);
  }
}

async function miniaturaColorida(
  blob: Blob,
  matizOrigem: number,
  cor: string | null,
  recortarMargens = false,
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, 768 / bitmap.width);
  const telaDesenho = document.createElement('canvas');
  telaDesenho.width = Math.max(1, Math.round(bitmap.width * escala));
  telaDesenho.height = Math.max(1, Math.round(bitmap.height * escala));
  const contexto = telaDesenho.getContext('2d', { willReadFrequently: true });
  if (!contexto) throw new Error('Canvas indisponível');
  contexto.drawImage(bitmap, 0, 0, telaDesenho.width, telaDesenho.height);
  bitmap.close();
  const imagem = contexto.getImageData(0, 0, telaDesenho.width, telaDesenho.height);
  const cornerEhWhite =
    imagem.data[3] === 255 && Math.min(imagem.data[0], imagem.data[1], imagem.data[2]) > 229;
  if (blob.type === 'image/jpeg' || cornerEhWhite)
    removerFundoBranco(imagem.data, telaDesenho.width, telaDesenho.height);
  recolorirPintura(imagem.data, matizOrigem, pintarPara(cor));
  contexto.putImageData(imagem, 0, 0);
  let saida = telaDesenho;
  if (recortarMargens) {
    let esquerda = telaDesenho.width;
    let superior = telaDesenho.height;
    let direita = -1;
    let inferior = -1;
    for (let outroItem = 0; outroItem < telaDesenho.height; outroItem++) {
      for (let itemAtual = 0; itemAtual < telaDesenho.width; itemAtual++) {
        if (imagem.data[(outroItem * telaDesenho.width + itemAtual) * 4 + 3] < 96) continue;
        esquerda = Math.min(esquerda, itemAtual);
        superior = Math.min(superior, outroItem);
        direita = Math.max(direita, itemAtual);
        inferior = Math.max(inferior, outroItem);
      }
    }
    if (direita >= esquerda && inferior >= superior) {
      const espacamento = Math.max(
        8,
        Math.round(Math.max(direita - esquerda, inferior - superior) * 0.06),
      );
      esquerda = Math.max(0, esquerda - espacamento);
      superior = Math.max(0, superior - espacamento);
      direita = Math.min(telaDesenho.width - 1, direita + espacamento);
      inferior = Math.min(telaDesenho.height - 1, inferior + espacamento);
      const recortado = document.createElement('canvas');
      recortado.width = direita - esquerda + 1;
      recortado.height = inferior - superior + 1;
      const recortadoContexto = recortado.getContext('2d');
      if (recortadoContexto) {
        recortadoContexto.drawImage(
          telaDesenho,
          esquerda,
          superior,
          recortado.width,
          recortado.height,
          0,
          0,
          recortado.width,
          recortado.height,
        );
        saida = recortado;
      }
    }
  }
  return new Promise((resolver, rejeitar) =>
    saida.toBlob(
      (resultado) =>
        resultado ? resolver(resultado) : rejeitar(new Error('Falha ao converter miniatura')),
      'image/webp',
      0.85,
    ),
  );
}

// Cinza que reproduz exatamente a base neutra gerada no servidor (luz * 200).
const CINZA_NEUTRO = { rgb: [200, 200, 200] };
export function aplicarMascaraPintura(
  pixels: Uint8ClampedArray,
  mascara: Uint8ClampedArray,
  cor: string | null,
) {
  const pintura = pintarPara(cor);
  const destino = pintura || CINZA_NEUTRO;
  if (pixels.length !== mascara.length) return;
  for (let i = 0; i < pixels.length; i += 4) {
    if (!mascara[i + 3]) continue;
    // Mascara de luz (azul zero): guarda a luz do painel. A tinta substitui o pixel,
    // tanto na base neutra completa quanto na base vazada antiga (alfa zero ali).
    if (mascara[i + 2] < 10) {
      const luz = mascara[i] / 200;
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(Math.min(255, destino.rgb[c] * luz));
      pixels[i + 3] = Math.max(pixels[i + 3], mascara[i + 3]);
      continue;
    }
    // Mascara classica: sem cor escolhida, a base neutra ja e a imagem final.
    if (!pintura || !pixels[i + 3]) continue;
    const cobertura = Math.min(1, mascara[i + 3] / pixels[i + 3]);
    const brilho = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 200;
    for (let canal = 0; canal < 3; canal++) {
      const pintado = Math.min(255, destino.rgb[canal] * brilho);
      pixels[i + canal] = Math.round(pixels[i + canal] * (1 - cobertura) + pintado * cobertura);
    }
  }
}
async function pintarMiniaturaPublicada(
  blob: Blob,
  mascaraUrl: string | null | undefined,
  cor: string | null | undefined,
  signal: AbortSignal,
): Promise<Blob> {
  if (!mascaraUrl) return blob;
  const resposta = await fetch(mascaraUrl, { signal }).catch(() => null);
  if (!resposta?.ok) return blob;
  const base = await createImageBitmap(blob);
  let mascara: ImageBitmap | null = null;
  try {
    mascara = await createImageBitmap(await resposta.blob());
    const canvas = document.createElement('canvas');
    canvas.width = base.width;
    canvas.height = base.height;
    const contexto = canvas.getContext('2d', { willReadFrequently: true });
    const telaMascara = document.createElement('canvas');
    telaMascara.width = base.width;
    telaMascara.height = base.height;
    const contextoMascara = telaMascara.getContext('2d', { willReadFrequently: true });
    if (!contexto || !contextoMascara) return blob;
    contexto.drawImage(base, 0, 0);
    contextoMascara.drawImage(mascara, 0, 0, base.width, base.height);
    const imagem = contexto.getImageData(0, 0, base.width, base.height);
    aplicarMascaraPintura(
      imagem.data,
      contextoMascara.getImageData(0, 0, base.width, base.height).data,
      cor ?? null,
    );
    contexto.putImageData(imagem, 0, 0);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((resultado) => resolve(resultado || blob), 'image/webp', 0.92),
    );
  } catch {
    return blob;
  } finally {
    base.close();
    mascara?.close();
  }
}

export function useMiniaturaMotocicleta(
  idOrdem: number,
  modelo: string | undefined,
  cor: string | null | undefined,
  revisao = 0,
) {
  const atualizacao = useRevisaoMiniaturas();
  const [imagem, setImagem] = useState<{
    url: string | null;
    origin: Origem;
    loading: boolean;
    error: string | null;
  }>({ url: null, origin: 'missing', loading: true, error: null });
  useEffect(() => {
    let ativo = true;
    let urlObjeto: string | null = null;
    const controlador = new AbortController();
    if (!modelo || !Number.isSafeInteger(idOrdem)) {
      setImagem({ url: null, origin: 'missing', loading: false, error: null });
      return () => {
        ativo = false;
        controlador.abort();
      };
    }
    setImagem({ url: null, origin: 'missing', loading: true, error: null });
    const catalogo = ilustracaoModelo(modelo);
    (async () => {
      let origem: Origem = 'generated';
      // A miniatura aprovada pelo administrador prevalece inclusive sobre o catalogo local.
      let response: Response;
      while (true) {
        response = await fetch(`${API_URL}/api/orders/${idOrdem}/model-preview`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controlador.signal,
        });
        if (response.status !== 202) break;
        const tarefa = (await response.json().catch(() => ({}))) as {
          status?: SituacaoMiniatura;
          nextRetryAt?: string;
        };
        if (tarefa.status === 'aguardando_revisao') {
          if (ativo)
            setImagem({
              url: null,
              origin: 'missing',
              loading: false,
              error: 'Prévia criada. Aguardando revisão do administrador.',
            });
          return;
        }
        if (ativo)
          setImagem({
            url: null,
            origin: 'missing',
            loading: true,
            error:
              tarefa.status === 'aguardando_cota'
                ? 'Aguardando renovação da cota para criar a miniatura…'
                : 'Miniatura na fila de geração…',
          });
        await new Promise((resolver) =>
          setTimeout(resolver, tarefa.status === 'aguardando_cota' ? 300_000 : 5_000),
        );
        if (!ativo) return;
      }
      if (!response.ok && catalogo) {
        response = await fetch(catalogo.src, { signal: controlador.signal });
        origem = 'catalog';
      }
      if (!response.ok) {
        const detalhes = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(detalhes?.message || `Miniatura indisponível (HTTP ${response.status}).`);
      }
      if (!(response.headers.get('content-type') || '').startsWith('image/'))
        throw new Error('Miniatura indisponível');
      const arquivo = await response.blob();
      const miniatura =
        response.headers.get('x-preview-origin') === 'published'
          ? await pintarMiniaturaPublicada(
              arquivo,
              response.headers.get('x-preview-paint-mask'),
              cor,
              controlador.signal,
            )
          : await miniaturaColorida(
              arquivo,
              origem === 'catalog' && !catalogo?.src.includes('urbana-160') ? 217 : 0,
              cor || 'prata',
            );
      if (!ativo) return;
      urlObjeto = URL.createObjectURL(miniatura);
      setImagem({ url: urlObjeto, origin: origem, loading: false, error: null });
    })().catch((erro) => {
      if (ativo)
        setImagem({
          url: null,
          origin: 'missing',
          loading: false,
          error: erro instanceof Error ? erro.message : 'Não foi possível preparar a miniatura.',
        });
    });
    return () => {
      ativo = false;
      controlador.abort();
      if (urlObjeto) URL.revokeObjectURL(urlObjeto);
    };
  }, [idOrdem, modelo, cor, revisao, atualizacao]);
  return imagem;
}

export function useMiniaturaModeloMotocicleta(
  modelo: string,
  cor: string | null,
  revisao = 0,
  motoId?: number,
) {
  const atualizacao = useRevisaoMiniaturas();
  const [imagem, setImagem] = useState<string | null>(null);
  useEffect(() => {
    setImagem(null);
    if (!modelo) return;
    let ativo = true;
    let url: string | null = null;
    const controlador = new AbortController();
    const catalogo = ilustracaoModelo(modelo);
    (async () => {
      const respostaPublicada = await fetch(
        `${API_URL}/api/miniaturas/publicada?modelo=${encodeURIComponent(modelo)}${motoId ? `&motoId=${motoId}` : ''}`,
        { credentials: 'include', cache: 'no-store', signal: controlador.signal },
      );
      if (respostaPublicada.ok) {
        const publicada = (await respostaPublicada.json()) as {
          imagem: string | null;
          mascara?: string | null;
        };
        if (publicada.imagem) {
          const arquivo = await fetch(publicada.imagem, { signal: controlador.signal });
          if (arquivo.ok) {
            const blob = await pintarMiniaturaPublicada(
              await arquivo.blob(),
              publicada.mascara,
              cor,
              controlador.signal,
            );
            if (ativo) {
              url = URL.createObjectURL(blob);
              setImagem(url);
            }
            return;
          }
        }
      }
      let response = await fetch(
        `${API_URL}/api/motorcycle-thumbnails/image?model=${encodeURIComponent(modelo)}`,
        {
          credentials: 'include',
          cache: 'no-store',
          signal: controlador.signal,
        },
      );
      let origem: 'generated' | 'catalog' = 'generated';
      if ((!response.ok || response.status === 202) && catalogo) {
        response = await fetch(catalogo.src, { signal: controlador.signal });
        origem = 'catalog';
      }
      if (
        !response.ok ||
        response.status === 202 ||
        !(response.headers.get('content-type') || '').startsWith('image/')
      )
        return;
      const blob = await miniaturaColorida(
        await response.blob(),
        origem === 'catalog' && !catalogo?.src.includes('urbana-160') ? 217 : 0,
        cor,
      );
      if (!ativo) return;
      url = URL.createObjectURL(blob);
      setImagem(url);
    })().catch(() => {});
    return () => {
      ativo = false;
      controlador.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [modelo, cor, revisao, atualizacao, motoId]);
  return imagem;
}

// Previa do cadastro: consulta miniaturas prontas sem enfileirar os fragmentos
// digitados pelo usuario como se fossem novos modelos.
export function useMiniaturaExistente(modelo: string, cor: string | null) {
  const [imagem, setImagem] = useState<string | null>(null);
  useEffect(() => {
    setImagem(null);
    if (modelo.trim().length < 4) return;
    const controlador = new AbortController();
    let urlObjeto: string | null = null;
    let ativo = true;
    const temporizador = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/motorcycle-thumbnails/preview-existing?model=${encodeURIComponent(modelo.trim())}`,
          { credentials: 'include', cache: 'no-store', signal: controlador.signal },
        );
        if (!response.ok || !(response.headers.get('content-type') || '').startsWith('image/'))
          return;
        const catalogo = ilustracaoModelo(modelo);
        const matizOrigem =
          response.headers.get('x-preview-origin') === 'catalog' &&
          !catalogo?.src.includes('urbana-160')
            ? 217
            : 0;
        const arquivo = await response.blob();
        const blob =
          response.headers.get('x-preview-origin') === 'published'
            ? await pintarMiniaturaPublicada(
                arquivo,
                response.headers.get('x-preview-paint-mask'),
                cor,
                controlador.signal,
              )
            : await miniaturaColorida(arquivo, matizOrigem, cor, true);
        if (!ativo) return;
        urlObjeto = URL.createObjectURL(blob);
        setImagem(urlObjeto);
      } catch {}
    }, 500);
    return () => {
      ativo = false;
      window.clearTimeout(temporizador);
      controlador.abort();
      if (urlObjeto) URL.revokeObjectURL(urlObjeto);
    };
  }, [modelo, cor]);
  return imagem;
}
