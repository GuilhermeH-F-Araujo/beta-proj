import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import express from 'express';
import cookieParser from 'cookie-parser';
import {
  chaveCatalogo,
  escolherFundoChave,
  identidadeSchema,
} from '../src/miniaturas/identidade.ts';
import {
  prepararReferencia,
  criarVariantes,
  recortarMiniatura,
} from '../src/miniaturas/imagens.ts';
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
async function candidataDeTeste() {
  return sharp({ create: { width: 1024, height: 768, channels: 3, background: '#ff00ff' } })
    .composite([
      {
        input: { create: { width: 650, height: 400, channels: 3, background: '#161e27' } },
        left: 165,
        top: 184,
      },
      {
        input: { create: { width: 200, height: 100, channels: 3, background: '#00b8ff' } },
        left: 350,
        top: 220,
      },
    ])
    .png()
    .toBuffer();
}
test('recorte tem alfa no original e nos tamanhos e rejeita candidato sem silhueta', async () => {
  const original = await recortarMiniatura(await candidataDeTeste());
  const variantes = await criarVariantes(original);
  for (const bytes of Object.values(variantes)) {
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(data[3], 0);
    assert.equal(
      data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3],
      255,
    );
  }
  const chapada = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: '#ff00ff' },
  })
    .png()
    .toBuffer();
  await assert.rejects(recortarMiniatura(chapada), /silhueta utilizavel/);
});

test('fundo verde preserva pintura rosa e alterna nas novas tentativas', async () => {
  assert.equal(escolherFundoChave(1, 'pintura rosa'), 'verde');
  assert.equal(escolherFundoChave(2, 'pintura verde'), 'magenta');
  assert.equal(escolherFundoChave(2, ''), 'verde');
  const bytes = await sharp({
    create: { width: 100, height: 100, channels: 3, background: '#00ff00' },
  })
    .composite([
      {
        input: { create: { width: 50, height: 50, channels: 3, background: '#ff00ff' } },
        left: 25,
        top: 25,
      },
    ])
    .png()
    .toBuffer();
  const pixels = await sharp(await recortarMiniatura(bytes, 'verde'))
    .raw()
    .toBuffer();
  assert.equal(pixels[3], 0);
  const centro = (50 * 100 + 50) * 4;
  assert.deepEqual([...pixels.subarray(centro, centro + 4)], [255, 0, 255, 255]);
});

test('recorte remove verde escuro em vazios e preserva detalhes neutros', async () => {
  const bytes = await sharp({
    create: { width: 100, height: 100, channels: 3, background: '#00ff00' },
  })
    .composite([
      {
        input: { create: { width: 50, height: 50, channels: 3, background: '#242424' } },
        left: 25,
        top: 25,
      },
      {
        input: { create: { width: 10, height: 10, channels: 3, background: '#124414' } },
        left: 45,
        top: 45,
      },
    ])
    .png()
    .toBuffer();
  const pixels = await sharp(await recortarMiniatura(bytes, 'verde'))
    .raw()
    .toBuffer();
  assert.equal(pixels[(50 * 100 + 50) * 4 + 3], 0);
  assert.equal(pixels[(35 * 100 + 35) * 4 + 3], 255);
});

test('recorte preserva detalhe fino misturado ao verde, mesmo com brilho semelhante ao fundo', async () => {
  const imagem = await sharp({
    create: { width: 100, height: 100, channels: 3, background: '#00d400' },
  })
    .composite([
      {
        input: { create: { width: 30, height: 40, channels: 3, background: '#323232' } },
        left: 20,
        top: 30,
      },
      {
        input: { create: { width: 1, height: 36, channels: 3, background: '#30c830' } },
        left: 65,
        top: 32,
      },
    ])
    .png()
    .toBuffer();
  const pixels = await sharp(await recortarMiniatura(imagem, 'verde'))
    .raw()
    .toBuffer();
  assert.equal(pixels[(50 * 100 + 64) * 4 + 3], 0);
  assert.ok(pixels[(50 * 100 + 65) * 4 + 3] > 0);
});

for (const [fundo, cor] of [
  ['magenta', '#ff00ff'],
  ['verde', '#00ff00'],
]) {
  test(`recorte ${fundo} vaza aros e quadro preservando tanque branco em todas as variantes`, async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">
      <rect width="1024" height="768" fill="${cor}"/>
      <circle cx="280" cy="520" r="150" fill="#222"/>
      <circle cx="280" cy="520" r="105" fill="${cor}"/>
      <path d="M175 520H385M280 415V625" stroke="#ccc" stroke-width="12"/>
      <rect x="490" y="260" width="330" height="330" fill="#333"/>
      <rect x="530" y="370" width="230" height="100" fill="${cor}"/>
      <rect x="530" y="280" width="230" height="60" fill="white"/>
    </svg>`);
    const variantes = await criarVariantes(
      await recortarMiniatura(await sharp(svg).png().toBuffer(), fundo),
    );
    for (const [nome, bytes] of Object.entries(variantes)) {
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const pixel = (x, y) => {
        const i =
          (Math.floor((y * info.height) / 768) * info.width + Math.floor((x * info.width) / 1024)) *
          4;
        return [...data.subarray(i, i + 4)];
      };
      for (const [x, y] of [
        [20, 20],
        [240, 480],
        [330, 570],
        [600, 410],
      ])
        assert.equal(pixel(x, y)[3], 0, `${nome}: vao ${x},${y}`);
      for (const [x, y] of [
        [280, 520],
        [280, 390],
        [600, 310],
        [510, 410],
      ])
        assert.equal(pixel(x, y)[3], 255, `${nome}: peca ${x},${y}`);
      assert.ok(
        pixel(600, 310)
          .slice(0, 3)
          .every((v) => v > 235),
        `${nome}: pintura branca preservada`,
      );
      for (const background of ['#1639c2', '#f49812']) {
        const { data: composed, info: dimensions } = await sharp(bytes)
          .flatten({ background })
          .raw()
          .toBuffer({ resolveWithObject: true });
        const at =
          (Math.floor((410 * dimensions.height) / 768) * dimensions.width +
            Math.floor((600 * dimensions.width) / 1024)) *
          3;
        const expected = background.match(/[0-9a-f]{2}/g).map((v) => parseInt(v, 16));
        assert.deepEqual(
          [...composed.subarray(at, at + 3)],
          expected,
          `${nome}: cor do sistema aparece no vao`,
        );
      }
    }
    const instrucao = montarInstrucao({
      modelo: 'Honda CG',
      modo: 'preservar',
      pesquisa: '',
      fundoChave: fundo,
    });
    assert.match(instrucao, /EVERY visible opening/);
    assert.match(instrucao, /Preserve the geometry of the fuel tank/);
  });
}

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
  const imagem = await candidataDeTeste();
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
    if (!String(url).startsWith('https://api.cloudflare.com')) return Response.json({});
    chamadas.push(String(url));
    assert.match(String(url), /^https:\/\/api.cloudflare.com/);
    if (String(url).includes('vision-instruct'))
      return Response.json({
        success: true,
        result: { response: JSON.stringify({ direcao: 'direita', inteira: true, problemas: [] }) },
      });
    assert.ok(opcoes.body instanceof FormData);
    assert.equal(opcoes.body.get('width'), '1024');
    assert.ok(opcoes.body.get('input_image_0'));
    return Response.json({ success: true, result: { image: imagem.toString('base64') } });
  };
  try {
    assert.equal(await processarProximo(db), true);
    assert.equal(chamadas.length, 3);
    // original, card, tabela, pintura, previa (base neutra) e recorte vazado.
    assert.equal(arquivos.length, 6);
    assert.equal(atualizacoes.at(-1).status, 'revisao');
    assert.equal(atualizacoes.at(-1).verificacao.direcao, 'direita');
    assert.equal(atualizacoes.at(-1).verificacao.fundoTransparente, true);
    assert.ok(!atualizacoes.some((item) => item.status === 'aprovada'));

    let chamadasRecusadas = 0;
    globalThis.fetch = async (url) => {
      if (!String(url).startsWith('https://api.cloudflare.com')) return Response.json({});
      chamadasRecusadas++;
      return Response.json(
        {
          success: false,
          errors: [{ code: 3030, message: 'Your output has been flagged' }],
        },
        { status: 400 },
      );
    };
    assert.equal(await processarProximo(db), true);
    assert.equal(chamadasRecusadas, 1);
    assert.equal(arquivos.length, 6);
    assert.equal(atualizacoes.at(-1).status, 'informacao');
    assert.equal(atualizacoes.at(-1).tentativas, 0);
    assert.equal(atualizacoes.at(-1).executor, null);
    assert.match(atualizacoes.at(-1).erro, /pedido foi salvo/);
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
  const foto = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#fff' },
  })
    .composite([
      {
        input: { create: { width: 700, height: 400, channels: 3, background: '#222' } },
        left: 250,
        top: 200,
      },
    ])
    .jpeg()
    .toBuffer();
  const imagem = await candidataDeTeste();
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
      fontes: [0, 1, 2, 3].map((indice) => ({
        titulo: 'BMW R1200GS',
        imagem: `https://upload.wikimedia.org/foto-${indice}.jpg`,
        url: `https://commons.wikimedia.org/wiki/File:Foto-${indice}.jpg`,
        licenca: 'CC BY 4.0',
        autor: 'Autor',
        correspondencia: 'exata',
      })),
      avisos: [],
      feita_em: new Date().toISOString(),
    },
  };
  const alteracoes = [];
  let baixou = false;
  let geracoes = 0;
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
  globalThis.fetch = async (url, opcoes) => {
    if (!/api.cloudflare.com|upload.wikimedia.org/.test(String(url))) return Response.json({});
    if (String(url).startsWith('https://upload.wikimedia.org/')) {
      baixou = true;
      return new Response(foto, { headers: { 'Content-Type': 'image/jpeg' } });
    }
    if (String(url).includes('vision-instruct'))
      return Response.json({
        success: true,
        result: { response: JSON.stringify({ direcao: 'esquerda', inteira: true, problemas: [] }) },
      });
    assert.ok(opcoes.body.has('input_image_3'), 'usa quatro fotos para orientar o padrao');
    geracoes++;
    return Response.json({ success: true, result: { image: imagem.toString('base64') } });
  };
  try {
    await processarProximo(db);
    assert.equal(baixou, true);
    assert.equal(alteracoes.find((a) => a.referencias)?.referencias.length, 4);
    assert.equal(geracoes, 1, 'foto de estudio tambem passa pela geracao com fundo chave');
    assert.equal(alteracoes.at(-1).status, 'pendente');
    assert.match(alteracoes.at(-1).correcao, /Correcao automatica/);
    assert.equal(alteracoes.at(-1).pesquisa, undefined);
    assert.ok(alteracoes.some((a) => a.pesquisa?.usadas?.[0]?.autor === 'Autor'));
    assert.equal(tarefa.pesquisa.usadas, undefined);
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
  const imagem = await candidataDeTeste();
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
  let prompt = '';
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
  globalThis.fetch = async (url, opcoes) => {
    if (!/api.cloudflare.com|upload.wikimedia.org/.test(String(url))) return Response.json({});
    if (String(url).startsWith('https://upload.wikimedia.org/')) {
      baixou = true;
      return new Response(foto, { headers: { 'Content-Type': 'image/jpeg' } });
    }
    if (String(url).includes('vision-instruct'))
      return Response.json({
        success: true,
        result: { response: JSON.stringify({ direcao: 'direita', inteira: true, problemas: [] }) },
      });
    prompt = opcoes.body.get('prompt');
    assert.equal(opcoes.body.get('width'), '1024');
    assert.equal(opcoes.body.get('height'), '1280');
    return Response.json({ success: true, result: { image: imagem.toString('base64') } });
  };
  try {
    await processarProximo(db);
    assert.equal(baixou, false);
    assert.equal(alteracoes.at(-1).status, 'revisao');
    assert.equal(alteracoes.at(-1).pesquisa.semFoto, true);
    assert.match(alteracoes.at(-1).verificacao.problemas.join(' '), /sem foto de comparacao/);
    assert.equal(alteracoes.at(-1).pesquisa.identidadeNaoConfirmada, false);

    tarefa.catalogo.ano = 1994;
    tarefa.catalogo.variante = 'Edição especial';
    tarefa.pesquisa.fontes[0].correspondencia = 'familia';
    await processarProximo(db);
    // Sem foto e sem fonte confirmada, o sistema pede uma referencia em vez de inventar.
    assert.equal(alteracoes.at(-1).status, 'informacao');
    assert.match(alteracoes.at(-1).erro, /Envie uma foto/);
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
      (erro) => erro.codigo === 'TEMPORARIO' && /Unexpected inference failure/.test(erro.message),
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

test('Workers AI usa todas as contas antes de pausar por cota', async () => {
  const { executarCloudflare, proximaLiberacaoCota } = await import(
    '../src/miniaturas/provedor.ts'
  );
  const fetchAnterior = globalThis.fetch;
  const ambiente = Object.fromEntries(
    ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'MODEL_IMAGE_ACCOUNTS_JSON'].map((chave) => [
      chave,
      process.env[chave],
    ]),
  );
  process.env.CLOUDFLARE_ACCOUNT_ID = 'rodizio-a';
  process.env.CLOUDFLARE_API_TOKEN = 'simulado';
  process.env.MODEL_IMAGE_ACCOUNTS_JSON = JSON.stringify(
    ['rodizio-a', 'rodizio-b', 'rodizio-c'].map((accountId) => ({
      name: accountId,
      accountId,
      apiToken: 'simulado',
    })),
  );
  const chamadas = [];
  let ultimaComCota = true;
  globalThis.fetch = async (url) => {
    const conta = new URL(url).pathname.split('/')[4];
    chamadas.push(conta);
    if (conta === 'rodizio-c' && ultimaComCota)
      return Response.json({ success: true, result: { imagem: 'teste' } });
    return Response.json(
      { success: false, errors: [{ code: 4006, message: 'Daily free allocation exceeded' }] },
      { status: 429 },
    );
  };
  try {
    const modelo = '@cf/black-forest-labs/flux-2-klein-9b';
    assert.deepEqual(await executarCloudflare(modelo, new FormData()), { imagem: 'teste' });
    assert.deepEqual(chamadas, ['rodizio-a', 'rodizio-b', 'rodizio-c']);
    assert.equal(proximaLiberacaoCota(), 0);
    ultimaComCota = false;
    await assert.rejects(executarCloudflare(modelo, {}), { codigo: 'COTA' });
    await assert.rejects(executarCloudflare(modelo, {}), { codigo: 'COTA' });
    assert.deepEqual(chamadas, ['rodizio-a', 'rodizio-b', 'rodizio-c', 'rodizio-c']);
    assert.ok(proximaLiberacaoCota() > Date.now());
  } finally {
    globalThis.fetch = fetchAnterior;
    for (const [chave, valor] of Object.entries(ambiente)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
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
    assert.equal(wikipedia, 2);
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

test('pesquisa resolve uma foto CC BY-SA pela categoria do modelo quando a busca direta falha', async () => {
  const { pesquisarReferencias, baixarFotoDaFonte } = await import('../src/miniaturas/pesquisa.ts');
  const anterior = globalThis.fetch;
  const miniatura = 'https://thumb.wikimedia.org/foto.jpg';
  const original = 'https://upload.wikimedia.org/foto.jpg';
  const arquivo = {
    title: 'File:Ducati Monster 900 lateral.jpg',
    imageinfo: [
      {
        thumburl: miniatura,
        url: original,
        extmetadata: {
          LicenseShortName: { value: 'CC BY-SA 4.0' },
          Artist: { value: 'Autora Teste' },
          ImageDescription: { value: 'Ducati Monster 900, model year 1993' },
        },
      },
    ],
  };
  globalThis.fetch = async (entrada) => {
    const url = new URL(String(entrada));
    if (url.href === miniatura) return new Response(null, { status: 429 });
    if (url.href === original)
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
    if (url.hostname !== 'commons.wikimedia.org') return new Response('{}', { status: 503 });
    if (url.searchParams.get('gsrnamespace') === '14')
      return Response.json({ query: { pages: [{ title: 'Category:Ducati Monster 900' }] } });
    if (url.searchParams.get('generator') === 'categorymembers')
      return Response.json({ query: { pages: [arquivo] } });
    return Response.json({ query: { pages: [] } });
  };
  try {
    const pesquisa = await pesquisarReferencias('Ducati Monster 900', 1993);
    const fonte = pesquisa.fontes.find((item) => item.imagem);
    assert.equal(fonte?.correspondencia, 'exata');
    assert.equal(fonte?.autor, 'Autora Teste');
    assert.deepEqual(await baixarFotoDaFonte(fonte), Buffer.from([1, 2, 3]));
    const outroAno = await pesquisarReferencias('Ducati Monster 900', 1998);
    assert.equal(outroAno.fontes.find((item) => item.imagem)?.correspondencia, 'familia');
  } finally {
    globalThis.fetch = anterior;
  }
});

test('identidade fotografica nao mistura cilindrada ou edicao mencionadas na mesma pagina', async () => {
  const { aceitaReferenciaModelo, licencaFotoAberta } = await import(
    '../src/miniaturas/buscaFotos.ts'
  );
  assert.ok(aceitaReferenciaModelo('Honda CG 125', 'Honda CG125 vista lateral'));
  assert.equal(aceitaReferenciaModelo('Honda CG 150', 'Honda CG125 e Yamaha 150'), false);
  assert.equal(aceitaReferenciaModelo('BMW R 1250 GS', 'BMW R1250GS Adventure'), false);
  assert.equal(aceitaReferenciaModelo('Yamaha RD 350', 'Yamaha RD350LC'), false);
  assert.ok(licencaFotoAberta('CC BY-SA 4.0'));
  assert.equal(licencaFotoAberta('CC BY-NC 4.0'), false);
});

test('fidelidade exige correspondencia em todos os criterios', async () => {
  const { calcularFidelidade } = await import('../src/miniaturas/imagens.ts');
  const detalhes = {
    rodas: 'igual',
    freios: 'igual',
    carenagem: 'igual',
    iluminacao: 'igual',
    motor: 'igual',
    escape: 'igual',
    pintura: 'igual',
  };
  assert.deepEqual(calcularFidelidade(detalhes), {
    pontuacaoFidelidade: 100,
    fidelidade: 'compativel',
  });
  assert.equal(
    calcularFidelidade({ ...detalhes, escape: 'inconclusivo' }).fidelidade,
    'inconclusiva',
  );
  assert.deepEqual(calcularFidelidade({ ...detalhes, escape: 'diferente', freios: 'diferente' }), {
    pontuacaoFidelidade: 80,
    fidelidade: 'divergente',
  });
  assert.deepEqual(calcularFidelidade({ ...detalhes, rodas: 'diferente' }), {
    pontuacaoFidelidade: 80,
    fidelidade: 'divergente',
  });
  assert.equal(
    calcularFidelidade({ ...detalhes, rodas: 'parcial', pintura: 'diferente' }).fidelidade,
    'divergente',
  );
});

test('401 tenta a proxima conta no mesmo pedido e preserva o multipart', async () => {
  const { executarCloudflare, proximaLiberacaoCota } = await import(
    '../src/miniaturas/provedor.ts'
  );
  const chaves = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'MODEL_IMAGE_ACCOUNTS_JSON'];
  const ambiente = Object.fromEntries(chaves.map((chave) => [chave, process.env[chave]]));
  const anterior = globalThis.fetch;
  const modelo = '@cf/black-forest-labs/flux-2-klein-9b';
  const chamadas = [];
  const form = new FormData();
  form.set('prompt', 'moto de teste');
  form.set('input_image_0', new Blob(['foto simulada']), 'foto.jpg');
  process.env.CLOUDFLARE_ACCOUNT_ID = 'credenciais-a';
  process.env.CLOUDFLARE_API_TOKEN = 'token-simulado-a';
  process.env.MODEL_IMAGE_ACCOUNTS_JSON = JSON.stringify([
    { name: 'segunda', accountId: 'credenciais-b', apiToken: 'token-simulado-b' },
  ]);
  let resposta = 'sucesso';
  globalThis.fetch = async (url, opcoes) => {
    const conta = new URL(url).pathname.split('/')[4];
    chamadas.push(conta);
    assert.equal(opcoes.body, form);
    assert.equal(opcoes.body.get('prompt'), 'moto de teste');
    assert.equal(await opcoes.body.get('input_image_0').text(), 'foto simulada');
    if (conta === 'credenciais-a' || resposta === 'credenciais')
      return Response.json(
        { success: false, errors: [{ code: 10000, message: 'Authentication error' }] },
        { status: 401 },
      );
    if (resposta === 'cota')
      return Response.json(
        { success: false, errors: [{ code: 3036, message: 'Daily free allocation exceeded' }] },
        { status: 429 },
      );
    return Response.json({ success: true, result: { image: 'simulada' } });
  };
  try {
    assert.deepEqual(await executarCloudflare(modelo, form), { image: 'simulada' });
    assert.deepEqual(chamadas, ['credenciais-a', 'credenciais-b']);
    resposta = 'cota';
    await assert.rejects(executarCloudflare(modelo, form), { codigo: 'COTA' });
    const liberacao = proximaLiberacaoCota();
    assert.ok(liberacao > Date.now());
    const quantidade = chamadas.length;
    await assert.rejects(executarCloudflare(modelo, form), { codigo: 'COTA' });
    assert.equal(chamadas.length, quantidade);
    // Simula a renovacao da janela sem aguardar um dia real.
    const agora = Date.now;
    Date.now = () => liberacao + 1;
    try {
      resposta = 'sucesso';
      assert.deepEqual(await executarCloudflare(modelo, form), { image: 'simulada' });
      resposta = 'credenciais';
      await assert.rejects(
        executarCloudflare(modelo, form),
        (erro) => erro.codigo === 'CREDENCIAIS' && /Erro de configuracao/.test(erro.message),
      );
      assert.equal(proximaLiberacaoCota(), 0);
      // O token corrigido volta a ser avaliado.
      process.env.CLOUDFLARE_API_TOKEN = 'token-corrigido-simulado';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'credenciais-b';
      resposta = 'sucesso';
      assert.deepEqual(await executarCloudflare(modelo, form), { image: 'simulada' });
    } finally {
      Date.now = agora;
    }
  } finally {
    globalThis.fetch = anterior;
    for (const [chave, valor] of Object.entries(ambiente)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  }
});

for (const cenario of ['cota', 'credenciais', 'moderacao']) {
  test(`fila apos 401 e ${cenario} preserva o estado correto do pedido`, async () => {
    const { processarProximo } = await import('../src/miniaturas/fila.ts');
    const { proximaLiberacaoCota } = await import('../src/miniaturas/provedor.ts');
    const chaves = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'MODEL_IMAGE_ACCOUNTS_JSON'];
    const ambiente = Object.fromEntries(chaves.map((chave) => [chave, process.env[chave]]));
    const anterior = globalThis.fetch;
    const prefixo = `fila-${cenario}`;
    process.env.CLOUDFLARE_ACCOUNT_ID = `${prefixo}-a`;
    process.env.CLOUDFLARE_API_TOKEN = 'simulado';
    process.env.MODEL_IMAGE_ACCOUNTS_JSON = JSON.stringify([
      { name: 'segunda', accountId: `${prefixo}-b`, apiToken: 'simulado' },
      { name: 'terceira', accountId: `${prefixo}-c`, apiToken: 'simulado' },
    ]);
    const foto = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#ddd' },
    })
      .jpeg()
      .toBuffer();
    const tarefa = {
      id: prefixo,
      catalogo: { modelo: 'Honda CG 150', ano: null, variante: '', moto_id: null },
      modo: 'referencia',
      observacoes: 'manter adesivo',
      correcao: '',
      tentativas: 1,
      falhas: 0,
      referencias: [{ caminho: 'foto.jpg' }],
      pesquisa: {
        consulta: 'Honda CG 150',
        fontes: [],
        avisos: [],
        feita_em: new Date().toISOString(),
      },
    };
    const alteracoes = [],
      chamadas = [];
    let reservas = 0;
    const db = {
      rpc: async () => {
        reservas++;
        return { data: [{ id: tarefa.id }], error: null };
      },
      from() {
        const q = {
          select: () => q,
          eq: () => q,
          update(valor) {
            alteracoes.push(valor);
            return q;
          },
          maybeSingle: async () => ({ data: tarefa, error: null }),
          then(resolve, reject) {
            return Promise.resolve({ data: [{ id: tarefa.id }], error: null }).then(
              resolve,
              reject,
            );
          },
        };
        return q;
      },
      storage: {
        from: () => ({ download: async () => ({ data: new Blob([foto]), error: null }) }),
      },
    };
    globalThis.fetch = async (url) => {
      if (!String(url).startsWith('https://api.cloudflare.com')) return Response.json({});
      const conta = new URL(url).pathname.split('/')[4];
      chamadas.push(conta);
      const tipo = conta.endsWith('-a') ? 'credenciais' : cenario;
      const [status, code, message] =
        tipo === 'credenciais'
          ? [401, 10000, 'Authentication error']
          : tipo === 'cota'
            ? [429, 3036, 'Daily free allocation exceeded']
            : [400, 3030, 'Your output has been flagged'];
      return Response.json({ success: false, errors: [{ code, message }] }, { status });
    };
    try {
      assert.equal(await processarProximo(db), true);
      const ultima = alteracoes.at(-1);
      assert.equal(ultima.executor, null);
      if (cenario === 'cota') {
        assert.equal(ultima.status, 'pendente');
        assert.equal(ultima.tentativas, 0);
        assert.equal(Date.parse(ultima.tentar_em), proximaLiberacaoCota());
        assert.ok(Date.parse(ultima.tentar_em) > Date.now());
        assert.equal(await processarProximo(db), false);
        assert.equal(reservas, 1);
      } else if (cenario === 'credenciais') {
        assert.equal(ultima.status, 'falhou');
        assert.match(ultima.erro, /Erro de configuracao/);
      } else {
        assert.equal(ultima.status, 'informacao');
        assert.equal(ultima.tentativas, 0);
        assert.match(ultima.erro, /pedido foi salvo.*Adicione uma foto/);
      }
      assert.deepEqual(
        chamadas,
        (cenario === 'moderacao' ? ['a', 'b'] : ['a', 'b', 'c']).map(
          (sufixo) => `${prefixo}-${sufixo}`,
        ),
      );
    } finally {
      globalThis.fetch = anterior;
      for (const [chave, valor] of Object.entries(ambiente)) {
        if (valor === undefined) delete process.env[chave];
        else process.env[chave] = valor;
      }
    }
  });
}
