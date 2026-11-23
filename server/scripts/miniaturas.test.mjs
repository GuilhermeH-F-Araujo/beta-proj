import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import express from 'express';
import cookieParser from 'cookie-parser';
import { chaveCatalogo, identidadeSchema } from '../src/miniaturas/identidade.ts';
import { prepararReferencia, criarVariantes } from '../src/miniaturas/imagens.ts';
import { correspondeModelo, baixarReferenciaPublica } from '../src/miniaturas/pesquisa.ts';
import { montarInstrucao, modeloGeracao } from '../src/miniaturas/provedor.ts';
process.env.URL_SUPABASE = 'https://exemplo.supabase.co';
process.env.CHAVE_PUBLICA_SUPABASE = 'chave-publica-teste';
const { registrarCentralMiniaturas } = await import('../src/miniaturas/rotas.ts');
import { hashToken } from '../src/miniaturas/repositorio.ts';
const identidade = (modelo, ano = null, variante = '', motoId = null) => ({
  modelo,
  ano,
  variante,
  motoId,
});
test('catalogo isola variantes, anos e veiculos sem duplicar grafias equivalentes', () => {
  const comum = chaveCatalogo(identidade('Honda CG 150'));
  assert.equal(comum, chaveCatalogo(identidade('  HONDA  CG 150 ')));
  assert.notEqual(comum, chaveCatalogo(identidade('Honda CG 150', null, 'Spyder')));
  assert.equal(
    chaveCatalogo(identidade('Honda CG 150 Spyder')),
    chaveCatalogo(identidade('Honda CG 150', null, 'Spyder')),
  );
  assert.notEqual(comum, chaveCatalogo(identidade('Honda CG 150', 2010)));
  assert.notEqual(comum, chaveCatalogo(identidade('Honda CG 150', null, '', 42)));
  assert.equal(identidadeSchema.safeParse(identidade('<script>')).success, false);
});
test('pesquisa exige modelo e variante completos, sem aceitar apenas a cilindrada', () => {
  assert.equal(correspondeModelo('Honda CG 150 Spyder', 'Honda CG 150 normal'), false);
  assert.equal(correspondeModelo('BMW R1200GS', 'BMW R 1200 GS motorcycle'), true);
  assert.equal(correspondeModelo('Honda CG 150 2012', 'Honda CG 150 2014'), false);
});
test('download automatico rejeita destinos privados, redirecionamentos e dominios arbitrarios', async () => {
  for (const url of [
    'http://upload.wikimedia.org/a.jpg',
    'https://localhost/a.jpg',
    'https://127.0.0.1/a.jpg',
    'https://upload.wikimedia.org.evil.test/a.jpg',
    'https://upload.wikimedia.org:444/a.jpg',
    'https://user@upload.wikimedia.org/a.jpg',
  ])
    await assert.rejects(baixarReferenciaPublica(url), /Origem/);
});
test('imagem e decodificada, reencodada e tem metadados removidos', async () => {
  const original = await sharp({
    create: { width: 800, height: 600, channels: 3, background: '#e0e0e0' },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Artist: 'Cliente' } } })
    .toBuffer();
  const limpa = await prepararReferencia(original);
  const meta = await sharp(limpa).metadata();
  assert.equal(meta.width, 800);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.format, 'jpeg');
  await assert.rejects(prepararReferencia(Buffer.from('<svg></svg>')));
  const pequena = await sharp({
    create: { width: 120, height: 80, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  await assert.rejects(prepararReferencia(pequena), /320/);
});
test('variantes preservam proporcao e original separado', async () => {
  const original = await sharp({
    create: { width: 1920, height: 1280, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  const variantes = await criarVariantes(original);
  assert.equal((await sharp(variantes.original).metadata()).width, 1920);
  assert.equal((await sharp(variantes.card).metadata()).width, 768);
  assert.equal((await sharp(variantes.tabela).metadata()).width, 320);
});
test('instrucao mantem direcao obrigatoria e trata notas como dados', () => {
  const instrucao = montarInstrucao({
    modelo: 'CG 150 Spyder',
    modo: 'preservar',
    observacoes: 'manter adesivos',
    pesquisa: 'modelo',
    correcao: 'Farol: redondo',
  });
  assert.match(instrucao, /FRONT WHEEL AND HEADLAMP POINT TO THE RIGHT/);
  assert.match(instrucao, /Never mirror/);
  assert.match(instrucao, /untrusted descriptive data/);
  assert.match(instrucao, /Preserve the photographed/);
  assert.match(modeloGeracao(), /flux-2-/);
});
test('token de envio so e armazenado como hash', () => {
  const token = 'a'.repeat(43);
  assert.equal(hashToken(token).length, 64);
  assert.notEqual(hashToken(token), token);
  assert.notEqual(hashToken(token), hashToken('b'.repeat(43)));
});
test('API nega administracao e leitura de candidatos sem sessao; QR nao pode aprovar', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  registrarCentralMiniaturas(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [method, path, body] of [
      ['GET', '/api/admin/miniaturas'],
      ['POST', '/api/admin/miniaturas', {}],
      ['POST', '/api/admin/miniaturas/0f0fa989-a323-4df0-b83b-b530c159d99d/aprovar', {}],
    ]) {
      const response = await fetch(base + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(response.status, 401);
    }
    const qr = await fetch(base + '/api/miniaturas/celular', {
      headers: { Authorization: 'Bearer invalid' },
    });
    assert.ok([401, 410].includes(qr.status));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('fila completa gera e verifica candidata sem publicar, usando referencias persistidas', async () => {
  const { processarProximo } = await import('../src/miniaturas/fila.ts');
  const anteriorFetch = globalThis.fetch;
  const envAnterior = {
    id: process.env.CLOUDFLARE_ACCOUNT_ID,
    token: process.env.CLOUDFLARE_API_TOKEN,
  };
  process.env.CLOUDFLARE_ACCOUNT_ID = 'conta-teste';
  process.env.CLOUDFLARE_API_TOKEN = 'token-simulado';
  const foto = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ddd' } })
    .jpeg()
    .toBuffer();
  const imagem = await sharp({
    create: { width: 1920, height: 1280, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  const atualizacoes = [];
  const arquivos = [];
  const chamadas = [];
  const tarefa = {
    id: 'pedido-teste',
    catalogo: { modelo: 'Honda CG 150', ano: null, variante: 'Spyder', moto_id: null },
    modo: 'referencia',
    observacoes: 'manter adesivo',
    correcao: '',
    tentativas: 1,
    falhas: 0,
    referencias: [{ caminho: 'foto.jpg' }],
    pesquisa: {
      consulta: 'Honda CG 150 Spyder',
      fontes: [],
      avisos: [],
      feita_em: new Date().toISOString(),
    },
  };
  const db = {
    rpc: async (nome) => {
      assert.equal(nome, 'reservar_pedido_miniatura');
      return { data: [{ id: tarefa.id }], error: null };
    },
    from(tabela) {
      assert.equal(tabela, 'miniatura_pedidos');
      let alteracao = null;
      const consulta = {
        select() {
          return consulta;
        },
        eq() {
          return consulta;
        },
        update(valor) {
          alteracao = valor;
          atualizacoes.push(valor);
          return consulta;
        },
        maybeSingle: async () => ({ data: tarefa, error: null }),
        then(resolve, reject) {
          return Promise.resolve({
            data: alteracao ? [{ id: tarefa.id }] : tarefa,
            error: null,
          }).then(resolve, reject);
        },
      };
      return consulta;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'miniaturas-acervo');
        return {
          download: async () => ({ data: new Blob([foto]), error: null }),
          upload: async (caminho) => {
            arquivos.push(caminho);
            return { error: null };
          },
        };
      },
    },
  };
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push(String(url));
    assert.match(String(url), /^https:\/\/api.cloudflare.com/);
    if (String(url).includes('vision-instruct'))
      return Response.json({
        success: true,
        result: { response: JSON.stringify({ direcao: 'direita', inteira: true, problemas: [] }) },
      });
    assert.ok(opcoes.body instanceof FormData);
    assert.equal(opcoes.body.get('width'), '1920');
    assert.ok(opcoes.body.get('input_image_0'));
    return Response.json({ success: true, result: { image: imagem.toString('base64') } });
  };
  try {
    assert.equal(await processarProximo(db), true);
    assert.equal(chamadas.length, 3);
    assert.equal(arquivos.length, 3);
    assert.equal(atualizacoes.at(-1).status, 'revisao');
    assert.equal(atualizacoes.at(-1).verificacao.direcao, 'direita');
    assert.ok(!atualizacoes.some((item) => item.status === 'aprovada'));
  } finally {
    globalThis.fetch = anteriorFetch;
    if (envAnterior.id === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = envAnterior.id;
    if (envAnterior.token === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = envAnterior.token;
  }
});

test('imagem particular exige dono, administrador ou mecanico atribuido a uma OS da moto', async () => {
  const { podeConsultarMoto } = await import('../src/miniaturas/consulta.ts');
  const semBanco = {
    from() {
      throw new Error('Nao deveria consultar');
    },
  };
  assert.equal(
    await podeConsultarMoto(semBanco, 7, 12, {
      administrador: false,
      cliente: 12,
      funcionario: null,
    }),
    true,
  );
  assert.equal(
    await podeConsultarMoto(semBanco, 7, 12, {
      administrador: true,
      cliente: null,
      funcionario: null,
    }),
    true,
  );
  assert.equal(
    await podeConsultarMoto(semBanco, 7, 12, {
      administrador: false,
      cliente: 99,
      funcionario: null,
    }),
    false,
  );
  const filtros = {};
  const db = {
    from(tabela) {
      assert.equal(tabela, 'ordem_servico');
      const q = {
        select() {
          return q;
        },
        eq(campo, valor) {
          filtros[campo] = valor;
          return q;
        },
        async limit() {
          return { data: [], error: null };
        },
      };
      return q;
    },
  };
  assert.equal(
    await podeConsultarMoto(db, 7, 12, { administrador: false, cliente: null, funcionario: 44 }),
    false,
  );
  assert.deepEqual(filtros, { id_moto: 7, id_mecanico: 44 });
});

test('fontes publicas distinguem a versao exata de Adventure, Rallye e anos diferentes', async () => {
  const { mesmoModeloDoIndice } = await import('../src/miniaturas/fontesPublicas.ts');
  assert.equal(
    mesmoModeloDoIndice(
      'BMW R 1200 GS 2012',
      'BMW R 1200 GS',
      '2012',
      'https://bikez.com/motorcycles/bmw_r_1200_gs_2012.php',
      'bmw',
      2012,
    ),
    true,
  );
  assert.equal(
    mesmoModeloDoIndice(
      'BMW R 1200 GS 2012',
      'BMW R 1200 GS Adventure',
      '2012',
      'https://bikez.com/motorcycles/bmw_r_1200_gs_adventure_2012.php',
      'bmw',
      2012,
    ),
    false,
  );
  assert.equal(
    mesmoModeloDoIndice(
      'BMW R1200GS 2012',
      'BMW R 1200 GS',
      '2013',
      'https://bikez.com/motorcycles/bmw_r_1200_gs_2013.php',
      'bmw',
      2012,
    ),
    false,
  );
});
test('cilindrada 1900 nao e confundida com ano sem um ano explicito', async () => {
  const { mesmoModeloDoIndice } = await import('../src/miniaturas/fontesPublicas.ts');
  assert.equal(
    mesmoModeloDoIndice(
      'Yamaha XV 1900',
      'Yamaha XV 1900',
      '',
      'https://bikez.com/motorcycles/yamaha_xv_1900.php',
      'yamaha',
    ),
    true,
  );
});
test('consulta publica respeita robots e rejeita dominios arbitrarios', async () => {
  const { caminhoPermitidoRobots, urlFontePermitida } = await import(
    '../src/miniaturas/fontesPublicas.ts'
  );
  const regras =
    'User-agent: *\nDisallow: /privado\nAllow: /privado/publico\nDisallow: /*?segredo=';
  assert.equal(caminhoPermitidoRobots(regras, '/brand/bmw_motorcycles.php'), true);
  assert.equal(caminhoPermitidoRobots(regras, '/privado/arquivo'), false);
  assert.equal(caminhoPermitidoRobots(regras, '/privado/publico/modelo'), true);
  assert.equal(caminhoPermitidoRobots(regras, '/busca?segredo=123'), false);
  for (const url of [
    'https://localhost/a',
    'http://bikez.com/a',
    'https://bikez.com.evil.test/a',
    'https://user@bikez.com/a',
    'https://bikez.com:8443/a',
  ])
    assert.throws(() => urlFontePermitida(url));
});
test('falha de rede no provedor e recuperavel e nao expoe detalhes da credencial', async () => {
  const { executarCloudflare } = await import('../src/miniaturas/provedor.ts');
  const anterior = globalThis.fetch;
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'conta-teste';
  process.env.CLOUDFLARE_API_TOKEN = 'segredo-de-teste';
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  try {
    await assert.rejects(
      executarCloudflare('@cf/black-forest-labs/flux-2-klein-9b', {}),
      (erro) => erro.codigo === 'TEMPORARIO' && !erro.message.includes('segredo-de-teste'),
    );
  } finally {
    globalThis.fetch = anterior;
    if (id === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = id;
    if (token === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = token;
  }
});
test('busca aberta aceita CC BY com autoria e rejeita foto de outro modelo ou licenca restrita', async () => {
  const { fonteOpenverse, aceitaReferenciaModelo } = await import(
    '../src/miniaturas/buscaFotos.ts'
  );
  const foto = {
    title: 'BMW R 1200 GS',
    license: 'by',
    creator: 'Fotografo',
    url: 'https://live.staticflickr.com/123/foto.jpg',
    foreign_landing_url: 'https://www.flickr.com/photos/exemplo/123/',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
  };
  assert.ok(fonteOpenverse(foto, 'BMW R1200GS'));
  assert.equal(fonteOpenverse({ ...foto, license: 'by-nc' }, 'BMW R1200GS'), null);
  assert.equal(fonteOpenverse({ ...foto, title: 'BMW R1200GS Adventure' }, 'BMW R1200GS'), null);
  assert.equal(fonteOpenverse({ ...foto, url: 'https://localhost/foto.jpg' }, 'BMW R1200GS'), null);
  assert.equal(aceitaReferenciaModelo('BMW R1200GS', 'BMW R1200GS motorcycle transport'), true);
});

test('fila busca foto automaticamente e corrige candidata virada para esquerda sem pedir acao do admin', async () => {
  const { processarProximo } = await import('../src/miniaturas/fila.ts');
  const fetchAnterior = globalThis.fetch;
  const anteriorId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const anteriorToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'teste';
  process.env.CLOUDFLARE_API_TOKEN = 'simulado';
  const foto = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ddd' } })
    .jpeg()
    .toBuffer();
  const imagem = await sharp({
    create: { width: 1920, height: 1280, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  const tarefa = {
    id: 'automatico',
    catalogo: { modelo: 'BMW R1200GS', ano: null, variante: '', moto_id: null },
    modo: 'referencia',
    observacoes: '',
    correcao: '',
    tentativas: 1,
    falhas: 0,
    referencias: [],
    pesquisa: {
      consulta: 'BMW R1200GS',
      fontes: [
        {
          titulo: 'BMW R1200GS',
          imagem: 'https://upload.wikimedia.org/foto.jpg',
          url: 'https://commons.wikimedia.org/wiki/File:Foto.jpg',
          licenca: 'CC BY 4.0',
          autor: 'Autor',
        },
      ],
      avisos: [],
      feita_em: new Date().toISOString(),
    },
  };
  const alteracoes = [];
  let baixou = false;
  const db = {
    rpc: async () => ({ data: [{ id: tarefa.id }], error: null }),
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        update(valor) {
          alteracoes.push(valor);
          return q;
        },
        maybeSingle: async () => ({ data: tarefa, error: null }),
        then(resolve, reject) {
          return Promise.resolve({ data: [{ id: tarefa.id }], error: null }).then(resolve, reject);
        },
      };
      return q;
    },
    storage: {
      from() {
        return { upload: async () => ({ error: null }) };
      },
    },
  };
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://upload.wikimedia.org/')) {
      baixou = true;
      return new Response(foto, { headers: { 'Content-Type': 'image/jpeg' } });
    }
    if (String(url).includes('vision-instruct'))
      return Response.json({
        success: true,
        result: { response: JSON.stringify({ direcao: 'esquerda', inteira: true, problemas: [] }) },
      });
    return Response.json({ success: true, result: { image: imagem.toString('base64') } });
  };
  try {
    await processarProximo(db);
    assert.equal(baixou, true);
    assert.equal(alteracoes.at(-1).status, 'pendente');
    assert.match(alteracoes.at(-1).correcao, /Correcao automatica/);
    assert.equal(alteracoes.at(-1).pesquisa, undefined);
    assert.equal(tarefa.pesquisa.usadas[0].autor, 'Autor');
  } finally {
    globalThis.fetch = fetchAnterior;
    if (anteriorId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = anteriorId;
    if (anteriorToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = anteriorToken;
  }
});
test('fila gera por fonte textual confirmada quando nao existe foto sem inventar comparacao visual', async () => {
  const { processarProximo } = await import('../src/miniaturas/fila.ts');
  const fetchAnterior = globalThis.fetch;
  const anteriorId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const anteriorToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'teste';
  process.env.CLOUDFLARE_API_TOKEN = 'simulado';
  const foto = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ddd' } })
    .jpeg()
    .toBuffer();
  const imagem = await sharp({
    create: { width: 1920, height: 1280, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  const tarefa = {
    id: 'automatico',
    catalogo: { modelo: 'BMW R1200GS', ano: null, variante: '', moto_id: null },
    modo: 'referencia',
    observacoes: '',
    correcao: '',
    tentativas: 1,
    falhas: 0,
    referencias: [],
    pesquisa: {
      consulta: 'BMW R1200GS',
      fontes: [
        {
          titulo: 'BMW R1200GS',
          url: 'https://commons.wikimedia.org/wiki/File:Foto.jpg',
          licenca: 'CC BY 4.0',
          autor: 'Autor',
        },
      ],
      avisos: [],
      feita_em: new Date().toISOString(),
    },
  };
  const alteracoes = [];
  let baixou = false;
  const db = {
    rpc: async () => ({ data: [{ id: tarefa.id }], error: null }),
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        update(valor) {
          alteracoes.push(valor);
          return q;
        },
        maybeSingle: async () => ({ data: tarefa, error: null }),
        then(resolve, reject) {
          return Promise.resolve({ data: [{ id: tarefa.id }], error: null }).then(resolve, reject);
        },
      };
      return q;
    },
    storage: {
      from() {
        return { upload: async () => ({ error: null }) };
      },
    },
  };
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://upload.wikimedia.org/')) {
      baixou = true;
      return new Response(foto, { headers: { 'Content-Type': 'image/jpeg' } });
    }
    if (String(url).includes('vision-instruct'))
      return Response.json({
        success: true,
        result: { response: JSON.stringify({ direcao: 'direita', inteira: true, problemas: [] }) },
      });
    return Response.json({ success: true, result: { image: imagem.toString('base64') } });
  };
  try {
    await processarProximo(db);
    assert.equal(baixou, false);
    assert.equal(alteracoes.at(-1).status, 'revisao');
    assert.equal(alteracoes.at(-1).pesquisa.semFoto, true);
    assert.match(alteracoes.at(-1).verificacao.problemas.join(' '), /sem foto de comparacao/);
    assert.ok(!alteracoes.some((a) => a.status === 'aprovada'));
  } finally {
    globalThis.fetch = fetchAnterior;
    if (anteriorId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = anteriorId;
    if (anteriorToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = anteriorToken;
  }
});
test('erro 3030 preserva motivo e distingue moderacao sem expor token ou trocar modelo', async () => {
  const { executarCloudflare } = await import('../src/miniaturas/provedor.ts');
  const anterior = globalThis.fetch;
  const id = process.env.CLOUDFLARE_ACCOUNT_ID,
    token = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'conta-diagnostico';
  process.env.CLOUDFLARE_API_TOKEN = 'token-privado-diagnostico';
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    return Response.json(
      {
        success: false,
        errors: [
          {
            code: 3030,
            message: 'AiError: Your output has been flagged. token-privado-diagnostico',
          },
        ],
      },
      { status: 400 },
    );
  };
  try {
    await assert.rejects(
      executarCloudflare('@cf/black-forest-labs/flux-2-klein-9b', {}),
      (erro) => {
        assert.equal(erro.codigo, 'MODERACAO');
        assert.match(erro.message, /flagged/);
        assert.doesNotMatch(erro.message, /token-privado-diagnostico/);
        return true;
      },
    );
    assert.equal(chamadas, 1);
    globalThis.fetch = async () =>
      Response.json(
        { success: false, errors: [{ code: 3030, message: 'Unexpected inference failure' }] },
        { status: 400 },
      );
    await assert.rejects(
      executarCloudflare('@cf/black-forest-labs/flux-2-klein-9b', {}),
      (erro) => erro.codigo === 'REQUISICAO' && /Unexpected inference failure/.test(erro.message),
    );
  } finally {
    globalThis.fetch = anterior;
    if (id === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = id;
    if (token === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = token;
  }
});

test('cota diaria do Cloudflare pausa ate a proxima janela sem trocar de conta', async () => {
  const { executarCloudflare, proximaLiberacaoCota } = await import(
    '../src/miniaturas/provedor.ts'
  );
  const fetchAnterior = globalThis.fetch;
  const anteriorId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const anteriorToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'teste';
  process.env.CLOUDFLARE_API_TOKEN = 'simulado';
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    return Response.json(
      { success: false, errors: [{ code: 3036, message: 'Daily free allocation exceeded' }] },
      { status: 429 },
    );
  };
  try {
    await assert.rejects(
      executarCloudflare('@cf/black-forest-labs/flux-2-klein-9b', {}),
      (erro) => erro.codigo === 'COTA',
    );
    assert.equal(chamadas, 1);
    assert.ok(proximaLiberacaoCota() > Date.now());
  } finally {
    globalThis.fetch = fetchAnterior;
    if (anteriorId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = anteriorId;
    if (anteriorToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = anteriorToken;
  }
});

test('pesquisa usa a foto aberta no dominio atual de miniaturas do Commons sem esperar Wikipedia', async () => {
  const { pesquisarReferencias } = await import('../src/miniaturas/pesquisa.ts');
  const anterior = globalThis.fetch;
  let wikipedia = 0;
  globalThis.fetch = async (url) => {
    const host = new URL(String(url)).hostname;
    if (host === 'commons.wikimedia.org')
      return new Response(
        JSON.stringify({
          query: {
            pages: {
              1: {
                title: 'File:Yamaha XJ 650 motocicleta.jpg',
                imageinfo: [
                  {
                    thumburl:
                      'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/moto.jpg/1600px-moto.jpg',
                    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/moto.jpg',
                    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Motorcycle.jpg',
                    extmetadata: {
                      LicenseShortName: { value: 'CC BY 4.0' },
                      Artist: { value: 'Fotografo' },
                      ImageDescription: { value: 'Yamaha XJ 650' },
                    },
                  },
                ],
              },
            },
          },
        }),
      );
    if (host.includes('wikipedia')) wikipedia++;
    return new Response('{}', { status: 403 });
  };
  try {
    const pesquisa = await pesquisarReferencias('Yamaha XJ 650');
    assert.equal(pesquisa.fontes.filter((f) => f.imagem).length, 1);
    assert.equal(pesquisa.fontes[0].autor, 'Fotografo');
    assert.equal(new URL(pesquisa.fontes[0].imagem).hostname, 'thumb.wikimedia.org');
    assert.equal(wikipedia, 0);
  } finally {
    globalThis.fetch = anterior;
  }
});

test('referencia do fabricante exige o modelo, rejeita ano errado e prioriza foto lateral sem menu', async () => {
  const { extrairReferenciaFabricante } = await import('../src/miniaturas/fabricantes.ts');
  const html =
    '<title>Honda CG160 Fan 2027</title><nav><picture><img alt="Honda CG160 Fan" src="/menu.jpg"></picture></nav><main><picture><img alt="Honda CG160 Fan" src="/banner.jpg"></picture><img alt="Honda CG160 Fan lateral" src="/moto-lateral.webp"></main>';
  const url = 'https://www.honda.com.br/motos/produto';
  const fonte = extrairReferenciaFabricante(html, url, 'Honda CG Fan 160', 'honda', null);
  assert.equal(fonte.imagem, 'https://www.honda.com.br/moto-lateral.webp');
  assert.equal(extrairReferenciaFabricante(html, url, 'Honda CG 160 Titan', 'honda', null), null);
  assert.equal(extrairReferenciaFabricante(html, url, 'Honda CG 160 Fan', 'honda', 2020), null);
  assert.equal(extrairReferenciaFabricante(html, url, 'Honda CG 160 Fan', 'honda', 2027)?.url, url);
});

test('descoberta do fabricante prefere Classic 350 a variante Goan da mesma familia', async () => {
  const { pesquisarFabricantes } = await import('../src/miniaturas/fabricantes.ts');
  const anterior = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const caminho = new URL(String(url)).pathname;
    if (caminho === '/robots.txt') return new Response('', { status: 404 });
    if (caminho === '/br/pt/motorcycles/')
      return new Response(
        '<a href="/br/pt/motorcycles/goan-classic-350/">Goan Classic 350</a><a href="/br/pt/motorcycles/classic-350/">Classic 350</a>',
        { headers: { 'content-type': 'text/html' } },
      );
    assert.equal(caminho, '/br/pt/motorcycles/classic-350/');
    return new Response(
      '<title>Royal Enfield Classic 350</title><main><img alt="Classic 350 lateral" src="/moto.webp"></main>',
      { headers: { 'content-type': 'text/html' } },
    );
  };
  try {
    const f = await pesquisarFabricantes('Royal Enfield Classic 350', null);
    assert.equal(f[0]?.url, 'https://www.royalenfield.com/br/pt/motorcycles/classic-350/');
  } finally {
    globalThis.fetch = anterior;
  }
});
