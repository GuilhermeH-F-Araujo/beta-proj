import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
process.env.URL_SUPABASE = 'https://exemplo.supabase.co';
process.env.CHAVE_PUBLICA_SUPABASE = 'simulada';
process.env.CLOUDFLARE_ACCOUNT_ID = 'conta-teste';
process.env.CLOUDFLARE_API_TOKEN = 'token-teste';
process.env.MODEL_IMAGE_ACCOUNTS_JSON = JSON.stringify([
  { name: 'teste', accountId: 'conta-teste', apiToken: 'token-teste' },
]);
process.env.MINIATURAS_CONTAS_JSON = process.env.MODEL_IMAGE_ACCOUNTS_JSON;
process.env.MINIATURAS_PAUSAR_GERACAO = 'false';
const { registrarCentralMiniaturas } = await import('../src/miniaturas/rotas.ts');
const app = express();
registrarCentralMiniaturas(app);
const router = app.router.stack.find((c) =>
  c.handle?.stack?.some((r) => r.route?.path === '/:id/gerar'),
).handle;
const gerar = router.stack.find((r) => r.route?.path === '/:id/gerar').route.stack[0].handle;
function contexto(status = 'revisao', concorrencia = false) {
  const tarefa = {
    id: '9a984ac7-f78b-48da-ad3f-99e418501012',
    status,
    atualizado_em: new Date().toISOString(),
    tentativas: 2,
    modo: 'referencia',
    observacoes: 'anterior',
    referencias: [{ caminho: 'foto' }],
  };
  const gravacoes = [];
  const db = {
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: structuredClone(tarefa), error: null }),
        update(valor) {
          gravacoes.push(valor);
          if (concorrencia) tarefa.status = 'processando';
          return q;
        },
        then(ok, erro) {
          return Promise.resolve({
            data: concorrencia ? [] : [{ id: tarefa.id }],
            error: null,
          }).then(ok, erro);
        },
      };
      return q;
    },
  };
  const req = {
    params: { id: tarefa.id },
    body: { observacoes: 'Preservar detalhes', modo: 'preservar', correcao: 'Corrigir tanque' },
  };
  const res = {
    locals: { db },
    statusCode: 200,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return { req, res, tarefa, gravacoes };
}
test('gerar salva observacoes, modo e fila na mesma atualizacao', async () => {
  const c = contexto();
  await gerar(c.req, c.res);
  assert.equal(c.res.statusCode, 202);
  assert.equal(c.gravacoes.length, 1);
  assert.equal(c.gravacoes[0].status, 'pendente');
  assert.equal(c.gravacoes[0].observacoes, 'Preservar detalhes');
  assert.equal(c.gravacoes[0].modo, 'preservar');
});
for (const status of ['pendente', 'processando'])
  test(`gerar novamente em ${status} nao edita nem duplica solicitacao`, async () => {
    const c = contexto(status);
    await gerar(c.req, c.res);
    assert.equal(c.res.statusCode, 202);
    assert.equal(c.res.body.jaNaFila, true);
    assert.equal(c.gravacoes.length, 0);
    assert.equal(c.tarefa.observacoes, 'anterior');
  });
test('concorrencia ao gerar recupera pedido que ja foi enfileirado', async () => {
  const c = contexto('revisao', true);
  await gerar(c.req, c.res);
  assert.equal(c.res.statusCode, 202);
  assert.equal(c.res.body.jaNaFila, true);
});
for (const status of ['aprovada', 'descartada'])
  test(`gerar ${status} informa encerramento sem editar`, async () => {
    const c = contexto(status);
    await gerar(c.req, c.res);
    assert.equal(c.res.statusCode, 409);
    assert.equal(c.res.body.code, 'PEDIDO_ENCERRADO');
    assert.equal(c.gravacoes.length, 0);
  });
test('modo preservar exige foto mesmo quando escolhido junto com gerar', async () => {
  const c = contexto();
  c.tarefa.referencias = [];
  await gerar(c.req, c.res);
  assert.equal(c.res.statusCode, 400);
  assert.equal(c.gravacoes.length, 0);
});
