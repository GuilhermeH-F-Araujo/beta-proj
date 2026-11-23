import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aprovarPreviaModelo,
  obterPreviaModeloEmMemoria,
  obterPreviaCandidata,
  gerarCandidatoModelo,
  modeloPreviaCaminho,
  geradoPreviaCaminho,
  salvarCandidatoPrevia,
  REPOSITORIO_PREVIAS_MODELOS,
  REPOSITORIO_PREVIAS_GRATUITAS,
  aprovadoPreviaCaminho,
} from '../src/previaModelo.ts';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(120)]);
function armazenamentoSimulacao() {
  const arquivos = new Map();
  return {
    files: arquivos,
    db: {
      storage: {
        from: (repositorioArquivos) => ({
          async list(_, { search: busca }) {
            return {
              data: [...arquivos.keys()]
                .filter((chaveAtual) =>
                  chaveAtual.startsWith(`${repositorioArquivos}/approved/${busca}`),
                )
                .map((chaveAtual) => ({
                  name: chaveAtual.split('/').at(-1),
                  updated_at: '2026-09-28',
                })),
              error: null,
            };
          },
          async download(caminho) {
            const bytes = arquivos.get(`${repositorioArquivos}/${caminho}`);
            return {
              data: bytes ? new Blob([bytes]) : null,
              error: bytes ? null : { message: 'not found' },
            };
          },
          async upload(caminho, bytes) {
            arquivos.set(`${repositorioArquivos}/${caminho}`, Buffer.from(bytes));
            return { error: null };
          },
          async remove(caminhos) {
            for (const registroAtual of caminhos)
              arquivos.delete(`${repositorioArquivos}/${registroAtual}`);
            return { error: null };
          },
        }),
        async getBucket() {
          return { data: { id: 'bucket' }, error: null };
        },
      },
    },
  };
}
test('imagem automática antiga não entra no cache compartilhado; candidata exige aprovação', async () => {
  const { db: db, files: arquivos } = armazenamentoSimulacao();
  const modelo = 'Honda CRF1100L Africa Twin';
  assert.equal(
    modeloPreviaCaminho(' HONDA  Africa Twin '),
    modeloPreviaCaminho('honda africa twin'),
  );
  assert.notEqual(modeloPreviaCaminho(modelo), geradoPreviaCaminho(modelo));
  arquivos.set(`${REPOSITORIO_PREVIAS_MODELOS}/${modeloPreviaCaminho(modelo)}`, jpeg);
  arquivos.set(
    `${REPOSITORIO_PREVIAS_GRATUITAS}/${geradoPreviaCaminho(modelo).replace(/png$/, 'jpg')}`,
    jpeg,
  );
  assert.equal(await obterPreviaModeloEmMemoria(db, modelo), null);
  await salvarCandidatoPrevia(db, modelo, jpeg);
  assert.deepEqual(await obterPreviaCandidata(db, modelo), jpeg);
  assert.equal(await obterPreviaModeloEmMemoria(db, modelo), null);
  await aprovarPreviaModelo(db, modelo, jpeg);
  assert.deepEqual(await obterPreviaModeloEmMemoria(db, modelo), jpeg);
  assert(arquivos.has(`moto-modelos-revisados/${aprovadoPreviaCaminho(modelo, 'image/jpeg')}`));
});
test('cota da primeira conta tenta a segunda sem publicar automaticamente', async () => {
  const antes = {
    provider: process.env.MODEL_IMAGE_PROVIDER,
    accounts: process.env.MODEL_IMAGE_ACCOUNTS_JSON,
  };
  const anteriorFetch = globalThis.fetch;
  const { db: db } = armazenamentoSimulacao();
  const chamado = [];
  try {
    process.env.MODEL_IMAGE_PROVIDER = 'cloudflare';
    process.env.MODEL_IMAGE_ACCOUNTS_JSON = JSON.stringify([
      { name: 'a', accountId: 'quota-first', apiToken: 'a' },
      { name: 'b', accountId: 'ready-second', apiToken: 'b' },
    ]);
    globalThis.fetch = async (url, request) => {
      chamado.push(url);
      assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'));
      assert.match(url, /flux-1-schnell$/);
      const entrada = JSON.parse(request.body);
      assert.deepEqual(Object.keys(entrada).sort(), ['prompt', 'steps']);
      assert.equal(entrada.steps, 4);
      return url.includes('quota-first')
        ? new Response(
            JSON.stringify({ success: false, errors: [{ code: 3036, message: 'Daily quota' }] }),
            { status: 429 },
          )
        : Response.json({ success: true, result: { image: jpeg.toString('base64') } });
    };
    assert.deepEqual(
      await gerarCandidatoModelo('Honda CRF1100L Africa Twin', {
        notes: '',
        research: 'Honda Africa Twin trail bicilíndrica',
      }),
      jpeg,
    );
    assert.equal(chamado.length, 2);
    assert.equal(await obterPreviaModeloEmMemoria(db, 'Honda CRF1100L Africa Twin'), null);
  } finally {
    globalThis.fetch = anteriorFetch;
    for (const [chave, valor] of Object.entries(antes)) {
      const nome = chave === 'provider' ? 'MODEL_IMAGE_PROVIDER' : 'MODEL_IMAGE_ACCOUNTS_JSON';
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
  }
});
test('quatro fotos são anexadas como entradas separadas ao FLUX.2', async () => {
  const anterior = {
    provider: process.env.MODEL_IMAGE_PROVIDER,
    accounts: process.env.MODEL_IMAGE_ACCOUNTS_JSON,
  };
  const anteriorFetch = globalThis.fetch;
  try {
    process.env.MODEL_IMAGE_PROVIDER = 'cloudflare';
    process.env.MODEL_IMAGE_ACCOUNTS_JSON = JSON.stringify([
      { name: 'referências', accountId: 'four-reference-test', apiToken: 'test' },
    ]);
    globalThis.fetch = async (url, inicializacao) => {
      assert.match(url, /flux-2-klein-4b$/);
      assert(inicializacao.body instanceof FormData);
      assert(!('Content-Type' in inicializacao.headers));
      for (let indice = 0; indice < 4; indice++)
        assert(inicializacao.body.get(`input_image_${indice}`) instanceof Blob);
      assert.equal(inicializacao.body.get('input_image_4'), null);
      assert.match(inicializacao.body.get('prompt'), /Honda Africa Twin/);
      return Response.json({ success: true, result: { image: jpeg.toString('base64') } });
    };
    const referencias = Array.from({ length: 4 }, () => ({ bytes: jpeg, mime: 'image/jpeg' }));
    assert.deepEqual(
      await gerarCandidatoModelo('Honda Africa Twin', { notes: '', references: referencias }),
      jpeg,
    );
  } finally {
    globalThis.fetch = anteriorFetch;
    for (const [chave, valor] of Object.entries(anterior)) {
      const nome = chave === 'provider' ? 'MODEL_IMAGE_PROVIDER' : 'MODEL_IMAGE_ACCOUNTS_JSON';
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
  }
});
