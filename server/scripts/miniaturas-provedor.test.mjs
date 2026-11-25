import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { executarCloudflare, proximaLiberacaoCota } from '../src/miniaturas/provedor.ts';
import { identidadeSchema, chaveCatalogo } from '../src/miniaturas/identidade.ts';
process.env.URL_SUPABASE = 'https://exemplo.supabase.co';
process.env.CHAVE_PUBLICA_SUPABASE = 'chave-publica-teste';
const { processarProximo } = await import('../src/miniaturas/fila.ts');
const modeloGerador = '@cf/black-forest-labs/flux-2-klein-9b';
const modeloVisual = '@cf/meta/llama-3.2-11b-vision-instruct';
const modeloAlternativo = '@cf/qwen/qwen3.8-27b';
function configurarContas(prefixo) {
  const chaves = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'MODEL_IMAGE_ACCOUNTS_JSON'];
  const anterior = Object.fromEntries(chaves.map((chave) => [chave, process.env[chave]]));
  process.env.CLOUDFLARE_ACCOUNT_ID = `${prefixo}-a`;
  process.env.CLOUDFLARE_API_TOKEN = 'token-simulado';
  process.env.MODEL_IMAGE_ACCOUNTS_JSON = JSON.stringify(
    ['b', 'c'].map((sufixo) => ({
      name: sufixo,
      accountId: `${prefixo}-${sufixo}`,
      apiToken: 'token-simulado',
    })),
  );
  return () => {
    for (const [chave, valor] of Object.entries(anterior)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  };
}
const rejeitar = (status, code, message) =>
  Response.json({ success: false, errors: [{ code, message }] }, { status });

test('CG e nomes de modelos com ano sao aceitos sem misturar anos no catalogo', () => {
  for (const modelo of ['CG', 'Honda CG 160', 'Ténéré 700', 'Moto de teste desconhecida']) {
    const antiga = identidadeSchema.parse({ modelo, ano: 1998 });
    const nova = identidadeSchema.parse({ modelo, ano: 2026 });
    assert.notEqual(chaveCatalogo(antiga), chaveCatalogo(nova));
  }
  assert.equal(identidadeSchema.safeParse({ modelo: ' ' }).success, false);
  assert.equal(identidadeSchema.safeParse({ modelo: '<script>' }).success, false);
});

for (const [codigoProvedor, codigoEsperado] of [
  [5016, 'TERMOS_MODELO'],
  [5035, 'PLANO_MODELO'],
  [5018, 'ACESSO_MODELO'],
]) {
  test(`403/${codigoProvedor} fica restrito ao modelo e nao invalida a geracao`, async () => {
    const prefixo = `acesso-${codigoProvedor}`;
    const restaurar = configurarContas(prefixo);
    const anteriorFetch = globalThis.fetch;
    const chamadas = [];
    globalThis.fetch = async (url) => {
      chamadas.push(String(url));
      if (String(url).includes('vision-instruct'))
        return rejeitar(403, codigoProvedor, 'Model unavailable');
      return Response.json({ success: true, result: { imagem: 'simulada' } });
    };
    try {
      await assert.rejects(executarCloudflare(modeloVisual, {}), { codigo: codigoEsperado });
      assert.equal(chamadas.length, 3);
      await assert.rejects(executarCloudflare(modeloVisual, {}), { codigo: codigoEsperado });
      assert.equal(chamadas.length, 3, 'a recusa do modelo tem cache breve');
      assert.deepEqual(await executarCloudflare(modeloGerador, {}), { imagem: 'simulada' });
      assert.equal(proximaLiberacaoCota(), 0);
    } finally {
      globalThis.fetch = anteriorFetch;
      restaurar();
    }
  });
}

test('permissao corrigida com o mesmo token e reavaliada automaticamente', async () => {
  const restaurar = configurarContas('reavaliar');
  const anteriorFetch = globalThis.fetch;
  const agora = Date.now;
  let valido = false;
  globalThis.fetch = async () =>
    valido
      ? Response.json({ success: true, result: 'ok' })
      : rejeitar(401, 10000, 'Authentication error');
  try {
    await assert.rejects(executarCloudflare(modeloGerador, {}), { codigo: 'CREDENCIAIS' });
    valido = true;
    Date.now = () => agora() + 5 * 60_000 + 1;
    assert.equal(await executarCloudflare(modeloGerador, {}), 'ok');
  } finally {
    Date.now = agora;
    globalThis.fetch = anteriorFetch;
    restaurar();
  }
});

for (const alternativaDisponivel of [true, false]) {
  test(`CG e Tenere 700 seguem ate revisao apos 401 e 5016; visao alternativa ${alternativaDisponivel}`, async () => {
    const prefixo = `fila-visao-${alternativaDisponivel}`;
    const restaurar = configurarContas(prefixo);
    const anteriorFetch = globalThis.fetch;
    const foto = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#ddd' },
    })
      .jpeg()
      .toBuffer();
    const imagem = await sharp({
      create: { width: 1024, height: 768, channels: 3, background: '#ff00ff' },
    })
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
    const alteracoes = [],
      chamadas = [],
      prompts = [];
    let tarefa;
    const db = {
      rpc: async () => ({ data: [{ id: tarefa.id }], error: null }),
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
        from: () => ({
          download: async () => ({ data: new Blob([foto]), error: null }),
          upload: async () => ({ error: null }),
        }),
      },
    };
    globalThis.fetch = async (url, opcoes) => {
      const conta = new URL(url).pathname.split('/')[4];
      chamadas.push({ conta, url: String(url) });
      if (conta === `${prefixo}-a`) return rejeitar(401, 10000, 'Authentication error');
      if (String(url).includes('vision-instruct'))
        return rejeitar(403, 5016, 'Model Agreement: submit agree');
      if (String(url).includes(modeloAlternativo)) {
        if (!alternativaDisponivel) return rejeitar(403, 5035, 'Model requires Workers Paid plan');
        const entrada = JSON.parse(opcoes.body);
        assert.ok(entrada.messages[0].content.some((item) => item.type === 'image_url'));
        assert.ok(!opcoes.body.includes('"agree"'), 'nao aceitar termos automaticamente');
        const resposta = entrada.messages[0].content[0].text.startsWith('Compare')
          ? {
              detalhes: Object.fromEntries(
                ['rodas', 'freios', 'carenagem', 'iluminacao', 'motor', 'escape', 'pintura'].map(
                  (parte) => [parte, 'igual'],
                ),
              ),
              problemas: [],
            }
          : { direcao: 'direita', inteira: true, problemas: [] };
        return Response.json({
          success: true,
          result: { choices: [{ message: { content: JSON.stringify(resposta) } }] },
        });
      }
      assert.ok(opcoes.body instanceof FormData);
      prompts.push(opcoes.body.get('prompt'));
      return Response.json({ success: true, result: { image: imagem.toString('base64') } });
    };
    try {
      for (const [modelo, ano] of [
        ['CG', 2008],
        ['Yamaha Ténéré 700', 2026],
      ]) {
        tarefa = {
          id: `${prefixo}-${ano}`,
          catalogo: { modelo, ano, variante: '', moto_id: null },
          modo: 'referencia',
          observacoes: 'manter pintura',
          correcao: '',
          tentativas: 1,
          falhas: 0,
          referencias: [{ caminho: 'foto.jpg' }],
          pesquisa: {
            consulta: modelo,
            fontes: [],
            avisos: [],
            feita_em: new Date().toISOString(),
          },
        };
        assert.equal(await processarProximo(db), true);
        const ultima = alteracoes.at(-1);
        assert.equal(ultima.status, 'revisao');
        const pesquisaSalva = alteracoes.filter((a) => a.pesquisa?.progresso).at(-1).pesquisa;
        assert.deepEqual(
          pesquisaSalva.progresso.map((e) => e.etapa),
          ['pesquisa', 'referencias', 'geracao', 'conferencia', 'arquivos', 'revisao'],
        );
        assert.ok(pesquisaSalva.progresso.every((e) => e.concluido_em && e.duracao_ms >= 0));
        assert.ok(ultima.candidato.endsWith('/original.png'));
        assert.equal(ultima.erro, null);
        assert.equal(ultima.verificacao.automatica, alternativaDisponivel);
        if (!alternativaDisponivel) {
          assert.equal(ultima.verificacao.direcao, 'incerta');
          assert.match(ultima.verificacao.problemas.join(' '), /manualmente/);
        }
        assert.equal(proximaLiberacaoCota(), 0);
      }
      assert.equal(prompts.length, 2);
      assert.match(prompts[0], /CG 2008/);
      assert.match(prompts[1], /Ténéré 700 2026/);
      assert.equal(chamadas.filter((c) => c.conta === `${prefixo}-a`).length, 1);
      // Qwen e o modelo de visao principal; o Llama (que exige "agree") so entra se ele falhar.
      assert.equal(
        chamadas.filter((c) => c.url.includes('vision-instruct')).length,
        alternativaDisponivel ? 0 : 2,
      );
      assert.ok(!alteracoes.some((a) => a.status === 'falhou' || a.status === 'aprovada'));
    } finally {
      globalThis.fetch = anteriorFetch;
      restaurar();
    }
  });
}
