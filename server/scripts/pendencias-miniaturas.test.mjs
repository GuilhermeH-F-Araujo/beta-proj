import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
process.env.URL_SUPABASE = 'https://exemplo.supabase.co';
process.env.CHAVE_PUBLICA_SUPABASE = 'simulada';
const { registrarCentralMiniaturas } = await import('../src/miniaturas/rotas.ts');
const { miniaturaEmAberto, statusMiniaturaEmAberto } = await import(
  '../src/shared/validacaoMiniatura.ts'
);
const app = express();
registrarCentralMiniaturas(app);
const router = app.router.stack.find((r) =>
  r.handle?.stack?.some((c) => c.route?.path === '/pendencias'),
).handle;
const contar = router.stack.find((r) => r.route?.path === '/pendencias').route.stack[0].handle;
test('menu considera todas as etapas abertas e exclui publicadas e canceladas', () => {
  for (const status of ['rascunho', 'pendente', 'processando', 'revisao', 'informacao', 'falhou'])
    assert.equal(miniaturaEmAberto(status), true);
  for (const status of ['aprovada', 'descartada', 'desconhecido'])
    assert.equal(miniaturaEmAberto(status), false);
});
test('contagem do menu usa count exato sem baixar imagens ou limitar a fila', async () => {
  const chamadas = [];
  const res = {
    locals: {
      db: {
        from(tabela) {
          assert.equal(tabela, 'miniatura_pedidos');
          return {
            select(campos, opcoes) {
              chamadas.push({ campos, opcoes });
              return {
                in(campo, valores) {
                  assert.equal(campo, 'status');
                  assert.deepEqual(valores, [...statusMiniaturaEmAberto]);
                  return Promise.resolve({ count: 731, error: null });
                },
              };
            },
          };
        },
      },
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await contar({}, res);
  assert.deepEqual(chamadas, [{ campos: 'id', opcoes: { count: 'exact', head: true } }]);
  assert.equal(res.body.quantidade, 731);
});
