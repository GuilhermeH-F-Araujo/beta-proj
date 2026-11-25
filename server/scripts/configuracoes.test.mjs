import test from 'node:test';
import assert from 'node:assert/strict';
import { rotasConfiguracoes } from '../dist/configuracoes.js';
function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(corpo) {
      this.body = corpo;
      return this;
    },
  };
}
function tratarAcao(roteador, caminho) {
  return roteador.stack.find((camada) => camada.route?.path === caminho).route.stack[0].handle;
}
function bancoSimulacao(dados = {}, falhar = []) {
  const chamadas = [];
  return {
    calls: chamadas,
    from(tabela) {
      chamadas.push(tabela);
      const resultado = {
        data: dados[tabela] || [],
        error: falhar.includes(tabela) ? new Error('database unavailable') : null,
      };
      const consulta = {
        then(resolver, rejeitar) {
          return Promise.resolve(resultado).then(resolver, rejeitar);
        },
        select() {
          return consulta;
        },
        limit() {
          return Promise.resolve(resultado);
        },
        neq() {
          return consulta;
        },
        or() {
          return consulta;
        },
        range() {
          return Promise.resolve(resultado);
        },
        gte() {
          return consulta;
        },
        lt() {
          return consulta;
        },
        in() {
          return consulta;
        },
        order() {
          return consulta;
        },
      };
      return consulta;
    },
  };
}
test('diagnostics requires administrator authorization before querying', async () => {
  const res = response();
  const caminhoRota = rotasConfiguracoes(async (_req, res) => {
    res.status(403).json({ message: 'Acesso negado' });
    return null;
  });
  await tratarAcao(caminhoRota, '/diagnostics')({ query: {} }, res);
  assert.equal(res.statusCode, 403);
});
test('diagnostics reports a failed resource without claiming all services are connected', async () => {
  const db = bancoSimulacao({}, ['admin_notify']);
  const res = response();
  await tratarAcao(
    rotasConfiguracoes(async () => db),
    '/diagnostics',
  )({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.checks.length, 4);
  assert.equal(
    res.body.checks.find((elementoAtual) => elementoAtual.id === 'notificacoes').ok,
    false,
  );
  assert.equal(res.body.checks.filter((elementoAtual) => elementoAtual.ok).length, 3);
});
test('activity rejects unbounded periods and invalid categories', async () => {
  const db = bancoSimulacao();
  for (const consulta of [{ days: '365' }, { days: '30', kind: 'anything' }, { days: 'NaN' }]) {
    const res = response();
    await tratarAcao(
      rotasConfiguracoes(async () => db),
      '/activity',
    )({ query: consulta }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.deepEqual(db.calls, []);
});
test('activity merges histories in chronological order and resolves known authors', async () => {
  const db = bancoSimulacao({
    logs: [
      {
        id: 2,
        entidade: 'cliente',
        id_cliente: 4,
        tipo: 'arquivar',
        criado_em: '2026-11-07T13:00:00Z',
      },
      {
        id: 1,
        entidade: 'ordem_servico',
        id_os: 21,
        tipo: 'status',
        id_usuario: 'user-1',
        criado_em: '2026-11-07T12:00:00Z',
        anterior: 'aguardando',
        novo: 'em andamento',
      },
    ],
    funcionario: [{ auth_user_id: 'user-1', nome: 'Administrador' }],
  });
  const res = response();
  await tratarAcao(
    rotasConfiguracoes(async () => db),
    '/activity',
  )({ query: { days: '30', kind: 'all' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items[0].kind, 'clients');
  assert.equal(res.body.items[1].actor, 'Administrador');
  assert.equal(res.body.items[1].detail, 'De aguardando para em andamento.');
  assert.equal(res.body.items[0].actor, 'Sistema');
});
test('activity handles database failure without returning partial history as complete', async () => {
  const db = bancoSimulacao({}, ['logs']);
  const res = response();
  await tratarAcao(
    rotasConfiguracoes(async () => db),
    '/activity',
  )({ query: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.items, undefined);
});

test('activity rejects invalid, reversed and excessive custom date intervals', async () => {
  const db = bancoSimulacao();
  for (const consulta of [
    { dateFrom: '2026-02-30', dateTo: '2026-03-01' },
    { dateFrom: '2026-11-02', dateTo: '2026-11-01' },
    { dateFrom: '2024-01-01', dateTo: '2026-01-01' },
    { dateFrom: '2026-11-01' },
  ]) {
    const res = response();
    await tratarAcao(
      rotasConfiguracoes(async () => db),
      '/activity',
    )({ query: consulta }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.deepEqual(db.calls, []);
});
