import test from "node:test";
import assert from "node:assert/strict";
import { rotasConfiguracoes } from "../dist/configuracoes.js";
function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
function handler(router, path) {
  return router.stack.find((layer) => layer.route?.path === path).route.stack[0]
    .handle;
}
function dbMock(data = {}, fail = []) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(table);
      const result = {
        data: data[table] || [],
        error: fail.includes(table) ? new Error("database unavailable") : null,
      };
      const query = {
        then(resolve, reject) {
          return Promise.resolve(result).then(resolve, reject);
        },
        select() {
          return query;
        },
        limit() {
          return Promise.resolve(result);
        },
        gte() {
          return query;
        },
        lt() { return query; },
        in() {
          return query;
        },
        order() {
          return query;
        },
      };
      return query;
    },
  };
}
test("diagnostics requires administrator authorization before querying", async () => {
  const res = response();
  const route = rotasConfiguracoes(async (_req, res) => {
    res.status(403).json({ message: "Acesso negado" });
    return null;
  });
  await handler(route, "/diagnostics")({ query: {} }, res);
  assert.equal(res.statusCode, 403);
});
test("diagnostics reports a failed resource without claiming all services are connected", async () => {
  const db = dbMock({}, ["admin_notify"]);
  const res = response();
  await handler(
    rotasConfiguracoes(async () => db),
    "/diagnostics",
  )({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.checks.length, 4);
  assert.equal(res.body.checks.find((c) => c.id === "notificacoes").ok, false);
  assert.equal(res.body.checks.filter((c) => c.ok).length, 3);
});
test("activity rejects unbounded periods and invalid categories", async () => {
  const db = dbMock();
  for (const query of [
    { days: "365" },
    { days: "30", kind: "anything" },
    { days: "NaN" },
  ]) {
    const res = response();
    await handler(
      rotasConfiguracoes(async () => db),
      "/activity",
    )({ query }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.deepEqual(db.calls, []);
});
test("activity merges histories in chronological order and resolves known authors", async () => {
  const db = dbMock({
    os_historico: [
      {
        id: 1,
        id_os: 21,
        tipo: "status",
        id_usuario: "user-1",
        criado_em: "2026-11-07T12:00:00Z",
        anterior: "aguardando",
        novo: "em andamento",
      },
    ],
    cliente_historico: [
      {
        id: 2,
        id_cliente: 4,
        acao: "arquivar",
        id_usuario: null,
        criado_em: "2026-11-07T13:00:00Z",
      },
    ],
    funcionario: [{ auth_user_id: "user-1", nome: "Administrador" }],
  });
  const res = response();
  await handler(
    rotasConfiguracoes(async () => db),
    "/activity",
  )({ query: { days: "30", kind: "all" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items[0].kind, "clients");
  assert.equal(res.body.items[1].actor, "Administrador");
  assert.equal(res.body.items[1].detail, "aguardando → em andamento");
  assert.equal(res.body.items[0].actor, "Autor não registrado");
});
test("activity handles database failure without returning partial history as complete", async () => {
  const db = dbMock({}, ["os_historico"]);
  const res = response();
  await handler(
    rotasConfiguracoes(async () => db),
    "/activity",
  )({ query: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.items, undefined);
});

test('activity rejects invalid, reversed and excessive custom date intervals',async()=>{const db=dbMock();for(const query of [{dateFrom:'2026-02-30',dateTo:'2026-03-01'},{dateFrom:'2026-11-02',dateTo:'2026-11-01'},{dateFrom:'2024-01-01',dateTo:'2026-01-01'},{dateFrom:'2026-11-01'}]){const res=response();await handler(rotasConfiguracoes(async()=>db),'/activity')({query},res);assert.equal(res.statusCode,400)}assert.deepEqual(db.calls,[])});
