import test from "node:test";
import assert from "node:assert/strict";
import {
  rotasPreferenciasConta,
  validarSomConta,
} from "../dist/preferenciasConta.js";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002";
const response = () => ({
  locals: { adminUserId: A },
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});
const handler = (router, path, method) =>
  router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods[method],
  ).route.stack[0].handle;
function mockDb() {
  const calls = [];
  return {
    calls,
    from(table) {
      const query = {
        select(columns) {
          calls.push({ table, columns });
          return query;
        },
        eq(column, value) {
          calls.push({ column, value });
          return query;
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
        async single() {
          return {
            data: {
              atualizado_em: "2026-11-07T23:00:00Z",
              som_atualizado_em: null,
            },
            error: null,
          };
        },
      };
      return query;
    },
    async rpc(name, input) {
      calls.push({ name, input });
      return { error: null };
    },
  };
}
const leitura = {
  tamanhoTexto: 140,
  tamanhoMenu: 100,
  tamanhoCabecalho: 100,
  tamanhoModais: 120,
  pesoTexto: 600,
  espacoLinhas: 16,
  contraste: false,
  reduzirMovimento: true,
  densidade: "confortavel",
  periodoDashboard: "semanal",
};
test("preferences endpoint refuses access before reading private data", async () => {
  const db = mockDb();
  const res = response();
  await handler(
    rotasPreferenciasConta(async (_req, res) => {
      res.status(403).json({ message: "Negado" });
      return null;
    }),
    "/",
    "get",
  )({ query: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(db.calls, []);
});
test("reads are always restricted to the session account, ignoring an injected owner", async () => {
  const db = mockDb(),
    res = response();
  await handler(
    rotasPreferenciasConta(async () => db),
    "/",
    "get",
  )({ query: { conta: B } }, res);
  assert.ok(db.calls.some((c) => c.column === "id_usuario" && c.value === A));
  assert.equal(res.body.conta, A);
  assert.equal(res.body.leitura, null);
});
test("a write for another account is rejected without calling the database RPC", async () => {
  const db = mockDb(),
    res = response();
  await handler(
    rotasPreferenciasConta(async () => db),
    "/:secao",
    "put",
  )({ params: { secao: "leitura" }, body: { conta: B, valor: leitura } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(
    db.calls.some((c) => c.name),
    false,
  );
});
test("valid settings use the session owner and preserve section boundaries", async () => {
  const db = mockDb(),
    res = response();
  await handler(
    rotasPreferenciasConta(async () => db),
    "/:secao",
    "put",
  )({ params: { secao: "leitura" }, body: { conta: A, valor: leitura } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(db.calls.find((c) => c.name).input, {
    p_usuario: A,
    p_secao: "leitura",
    p_valor: leitura,
  });
});
test("settings reject unsafe scale values, unexpected keys and invalid sections", async () => {
  for (const [section, value] of [
    ["leitura", { ...leitura, tamanhoMenu: 500 }],
    ["leitura", { ...leitura, id_usuario: B }],
    ["seguranca", { inatividade: 999 }],
    ["unknown", {}],
  ]) {
    const db = mockDb(),
      res = response();
    await handler(
      rotasPreferenciasConta(async () => db),
      "/:secao",
      "put",
    )({ params: { secao: section }, body: { conta: A, valor: value } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(
      db.calls.some((c) => c.name),
      false,
    );
  }
});
function wav(seconds = 1) {
  const rate = 8000;
  const data = Buffer.alloc(44 + Math.floor(seconds * rate) * 2);
  data.write("RIFF");
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(data.length - 44, 40);
  return data;
}
test("cloud audio verifies the real WAV header and computes duration on the server", () => {
  const bytes = wav();
  const result = validarSomConta({
    name: "som.wav",
    base64: bytes.toString("base64"),
  });
  assert.equal(result.duration, 1);
  assert.equal(result.size, bytes.length);
  assert.equal(result.mimeType, "audio/wav");
  for (const invalid of [
    Buffer.from("<script>code</script>"),
    wav(9),
    Buffer.concat([wav(), Buffer.from("metadata")]),
  ])
    assert.throws(() =>
      validarSomConta({ name: "fake.wav", base64: invalid.toString("base64") }),
    );
  const invalid = wav();
  invalid.writeUInt16LE(3, 20);
  assert.throws(() =>
    validarSomConta({ name: "codec.wav", base64: invalid.toString("base64") }),
  );
});
