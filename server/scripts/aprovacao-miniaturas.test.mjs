import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
const imagemTransparente = await sharp({
  create: { width: 400, height: 300, channels: 4, background: '#00000000' },
})
  .composite([
    {
      input: { create: { width: 240, height: 150, channels: 4, background: '#222222' } },
      left: 80,
      top: 75,
    },
  ])
  .png()
  .toBuffer();
process.env.URL_SUPABASE = 'https://exemplo.supabase.co';
process.env.CHAVE_PUBLICA_SUPABASE = 'chave-simulada';
const { registrarCentralMiniaturas } = await import('../src/miniaturas/rotas.ts');
const app = express();
registrarCentralMiniaturas(app);
const roteador = app.router.stack.find((c) =>
  c.handle?.stack?.some((r) => r.route?.path === '/:id/aprovar'),
).handle;
const aprovar = roteador.stack.find((c) => c.route?.path === '/:id/aprovar').route.stack[0].handle;
function contexto(verificacao, alteracaoValida = true) {
  const tarefa = {
    id: 'a491521e-04b6-490f-a8eb-70ebd39fb2fa',
    status: 'revisao',
    atualizado_em: new Date().toISOString(),
    candidato: 'candidata/original.png',
    catalogo: { revisao: 2 },
    verificacao,
  };
  const atualizacoes = [],
    rpcs = [];
  const db = {
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([imagemTransparente]), error: null }),
      }),
    },
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        update(v) {
          atualizacoes.push(v);
          return q;
        },
        maybeSingle: async () => ({ data: structuredClone(tarefa), error: null }),
        then(ok, erro) {
          return Promise.resolve({
            data: alteracaoValida ? [{ id: tarefa.id }] : [],
            error: null,
          }).then(ok, erro);
        },
      };
      return q;
    },
    rpc: async (nome, parametros) => {
      rpcs.push({ nome, parametros });
      return { data: 'publicacao', error: null };
    },
  };
  const req = {
    params: { id: tarefa.id },
    body: {
      revisao: 2,
      confirmouIdentidade: true,
      confirmouDireita: true,
      confirmouInteira: true,
      confirmouUso: true,
    },
  };
  const res = {
    statusCode: 200,
    locals: { db, adminUserId: 'e1a5ef2f-3379-4a11-b50f-6f58f619de91' },
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(v) {
      this.body = v;
      return this;
    },
    end() {
      return this;
    },
  };
  return { req, res, atualizacoes, rpcs };
}
const base = {
  automatica: true,
  direcao: 'direita',
  vistaLateral: true,
  inteira: true,
  fundoTransparente: true,
  problemas: [],
};
for (const fidelidade of [undefined, 'inconclusiva', 'divergente', 'compativel']) {
  test(`aprovacao usa conferencia manual explicita quando fidelidade e ${fidelidade}`, async () => {
    const verificacao = {
      ...base,
      ...(fidelidade ? { fidelidade } : {}),
      ...(fidelidade === 'compativel' ? { pontuacaoFidelidade: 100 } : {}),
    };
    const c = contexto(verificacao);
    await aprovar(c.req, c.res);
    assert.equal(c.res.statusCode, 200);
    assert.equal(c.rpcs[0].nome, 'publicar_miniatura');
    assert.equal(c.rpcs[0].parametros.p_revisao, 2);
    const salvo = c.atualizacoes[0].verificacao;
    assert.equal(salvo.fidelidade_confirmada_manualmente, fidelidade !== 'compativel');
    assert.equal(
      salvo.fidelidade,
      verificacao.fidelidade,
      'a analise automatica original nao e adulterada',
    );
    assert.equal(salvo.confirmado_por, c.res.locals.adminUserId);
    assert.ok(Date.parse(salvo.confirmado_em));
  });
}
test('aprovacao conserva as quatro confirmacoes, enquadramento, transparencia e concorrencia', async () => {
  for (const flag of [
    'confirmouIdentidade',
    'confirmouDireita',
    'confirmouInteira',
    'confirmouUso',
  ]) {
    const c = contexto(base);
    c.req.body[flag] = false;
    await aprovar(c.req, c.res);
    assert.equal(c.res.statusCode, 400);
    assert.equal(c.rpcs.length, 0);
  }
  // A analise da IA pode errar: com as quatro confirmacoes do administrador a
  // publicacao segue e o alerta fica registrado.
  for (const patch of [{ direcao: 'esquerda' }, { inteira: false }]) {
    const c = contexto({ ...base, ...patch });
    await aprovar(c.req, c.res);
    assert.notEqual(c.res.statusCode, 422);
    assert.equal(c.rpcs.length, 1);
  }
  const c = contexto(base, false);
  await aprovar(c.req, c.res);
  assert.equal(c.res.statusCode, 409);
  assert.equal(c.rpcs.length, 0);
});

test('verificador indisponivel aceita conferencia manual com transparencia e confirmacoes', async () => {
  const c = contexto({ ...base, automatica: false, direcao: 'incerta', inteira: false });
  await aprovar(c.req, c.res);
  assert.equal(c.res.statusCode, 200);
  assert.equal(c.rpcs.length, 1);
  assert.equal(c.atualizacoes[0].verificacao.fidelidade_confirmada_manualmente, true);
  assert.equal(c.atualizacoes[0].verificacao.automatica, false);
});

test('importacao web rejeita protocolos e destinos privados', async () => {
  const { baixarReferenciaWeb } = await import('../src/miniaturas/fontesPublicas.ts');
  for (const url of [
    'http://example.com/a.jpg',
    'file:///foto.jpg',
    'https://usuario:senha@example.com/foto.jpg',
    'https://127.0.0.1/foto.jpg',
    'https://169.254.169.254/foto.jpg',
    'https://10.0.0.1/foto.jpg',
    'https://localhost/foto.jpg',
  ])
    await assert.rejects(() => baixarReferenciaWeb(url));
});

test('cancelamento interrompe a reserva e revoga o envio pelo celular', async () => {
  const cancelar = roteador.stack.find((c) => c.route?.path === '/:id/descartar').route.stack[0]
    .handle;
  const c = contexto(base);
  const gravacoes = [];
  let estados;
  c.res.locals.db = {
    from(tabela) {
      const q = {
        update(valor) {
          gravacoes.push({ tabela, valor });
          return q;
        },
        eq() {
          return q;
        },
        in(_campo, valores) {
          estados = valores;
          return q;
        },
        select() {
          return q;
        },
        then(ok, erro) {
          return Promise.resolve({ data: [{ id: c.req.params.id }], error: null }).then(ok, erro);
        },
      };
      return q;
    },
  };
  await cancelar(c.req, c.res);
  assert.equal(c.res.statusCode, 200);
  assert.equal(gravacoes[0].valor.status, 'descartada');
  assert.equal(gravacoes[0].valor.executor, null);
  assert.ok(estados.includes('processando'));
  assert.ok(estados.includes('pendente'));
  assert.equal(gravacoes[1].tabela, 'miniatura_envios');
  assert.equal(gravacoes[1].valor.cancelado, true);
});

test('metadados antigos de transparencia sao recuperados pelo arquivo real', async () => {
  for (const valor of [undefined, false]) {
    const c = contexto({ ...base, fundoTransparente: valor });
    await aprovar(c.req, c.res);
    assert.equal(c.res.statusCode, 200);
    assert.equal(c.atualizacoes[0].verificacao.fundoTransparente, true);
  }
});
test('publicacao rejeita arquivo opaco ou ausente antes de gravar a confirmacao', async () => {
  const opaca = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  for (const data of [new Blob([opaca]), null]) {
    const c = contexto(base);
    c.res.locals.db.storage.from = () => ({ download: async () => ({ data, error: null }) });
    await aprovar(c.req, c.res);
    assert.ok([409, 422].includes(c.res.statusCode));
    assert.equal(c.rpcs.length, 0);
    assert.equal(c.atualizacoes.length, 0);
  }
});

test('aprovacao exige mascara valida para base personalizavel', async () => {
  const c = contexto({ ...base, pinturaPersonalizavel: true });
  c.res.locals.db.storage.from = () => ({
    download: async (caminho) => ({
      data: caminho.endsWith('pintura.png') ? null : new Blob([imagemTransparente]),
      error: null,
    }),
  });
  await aprovar(c.req, c.res);
  assert.equal(c.res.statusCode, 422);
  assert.equal(c.rpcs.length, 0);
  const mascara = await sharp({
    create: { width: 400, height: 300, channels: 4, background: '#00000000' },
  })
    .composite([
      {
        input: { create: { width: 80, height: 40, channels: 4, background: '#fff' } },
        left: 120,
        top: 100,
      },
    ])
    .png()
    .toBuffer();
  c.res.statusCode = 200;
  c.res.locals.db.storage.from = () => ({
    download: async (caminho) => ({
      data: new Blob([caminho.endsWith('pintura.png') ? mascara : imagemTransparente]),
      error: null,
    }),
  });
  await aprovar(c.req, c.res);
  assert.equal(c.res.statusCode, 200);
  assert.equal(c.rpcs.length, 1);
});
