import test from "node:test";
import assert from "node:assert/strict";
import {
  administrador,
  permitirRequisicao,
  lerAcesso,
  cargoSchema,
  rotasCargos,
  tiposAvisos,
} from "../dist/cargos.js";
const admin = { administrador: true, cargo: "Administrador", permissoes: {} };
const consulta = {
  administrador: false,
  cargo: "Consulta",
  permissoes: { ordens: { visualizar: true } },
};
const body = {
  id: null,
  nome: "Atendimento",
  descricao: "",
  ativo: true,
  versao: null,
  membros: [],
  permissoes: { clientes: { visualizar: true, criar: true } },
};
test("administrator remains integral and requires both access fields", () => {
  assert.equal(
    administrador({ cargo: "Administrador", perfil_acesso: "Administrador" }),
    true,
  );
  assert.equal(
    administrador({ cargo: "Administrador", perfil_acesso: "Mecânico" }),
    false,
  );
  assert.equal(permitirRequisicao(admin, "DELETE", "/api/orders/2"), true);
});
test("read-only roles cannot mutate data or cross module boundaries", () => {
  assert.equal(
    permitirRequisicao(consulta, "GET", "/api/orders?search=x"),
    true,
  );
  for (const [m, p] of [
    ["POST", "/api/orders"],
    ["PATCH", "/api/orders/2/status"],
    ["DELETE", "/api/orders/2"],
    ["GET", "/api/clients"],
    ["GET", "/api/orders-evil"],
    ["GET", "/api/admin/settings/activity"],
  ])
    assert.equal(permitirRequisicao(consulta, m, p), false, `${m} ${p}`);
});
test("create edit and delete are independent including nested payment routes", () => {
  const a = {
    ...consulta,
    permissoes: { ordens: { visualizar: true, criar: true } },
  };
  assert.equal(permitirRequisicao(a, "POST", "/api/orders"), true);
  assert.equal(permitirRequisicao(a, "POST", "/api/orders/2/payment"), false);
  a.permissoes.ordens.editar = true;
  assert.equal(permitirRequisicao(a, "POST", "/api/orders/2/payment"), true);
  assert.equal(permitirRequisicao(a, "DELETE", "/api/orders/2"), false);
});
test("custom roles cannot escalate through employee user or role management APIs", () => {
  const a = {
    ...consulta,
    permissoes: {
      funcionarios: {
        visualizar: true,
        criar: true,
        editar: true,
        excluir: true,
      },
    },
  };
  for (const [m, p] of [
    ["PUT", "/api/admin/roles"],
    ["POST", "/api/admin/users"],
    ["PATCH", "/api/employees/2/access"],
    ["PATCH", "/api/employees/2/password"],
    ["GET", "/api/admin/settings/diagnostics"],
  ])
    assert.equal(permitirRequisicao(a, m, p), false);
  assert.equal(permitirRequisicao(a, "GET", "/api/employees"), true);
});
test("own profile preferences and notification state remain accessible", () => {
  for (const p of [
    "/api/admin/profile",
    "/api/admin/preferences/leitura",
    "/api/admin/notifications/2",
  ])
    assert.equal(permitirRequisicao(consulta, "PATCH", p), true);
  assert.equal(
    permitirRequisicao(consulta, "GET", "/api/admin/profile-evil"),
    false,
  );
});
test("notification types are scoped to the modules the role can view", () => {
  assert.equal(tiposAvisos(admin), null);
  assert.deepEqual(tiposAvisos({ ...consulta, permissoes: {} }), []);
  assert.equal(tiposAvisos(consulta).includes("nova_os"), true);
  assert.equal(tiposAvisos(consulta).includes("novo_cliente"), false);
});
test("schema rejects forged permissions admin names and unsupported actions", () => {
  assert.equal(cargoSchema.safeParse(body).success, true);
  for (const p of [
    { ...body, nome: "Administrador" },
    { ...body, permissoes: { seguranca: { visualizar: true } } },
    {
      ...body,
      permissoes: { funcionarios: { visualizar: true, editar: true } },
    },
    { ...body, permissoes: { ordens: { editar: true } } },
    { ...body, administrador: true },
  ])
    assert.equal(cargoSchema.safeParse(p).success, false);
});
const fake = (v, c) => ({
  from(t) {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      async maybeSingle() {
        return { data: t === "cargo_vinculo" ? v : c, error: null };
      },
    };
  },
});
const profile = {
  id_funcionario: 1,
  cargo: "Mecânico",
  perfil_acesso: "Mecânico",
};
test("missing explicit assignment and inactive roles cannot acquire access", async () => {
  assert.equal(await lerAcesso(fake(null, null), profile), null);
  assert.equal(
    await lerAcesso(fake({ id_cargo: "a" }, { ativo: false }), profile),
    null,
  );
  const a = await lerAcesso(
    fake(
      { id_cargo: "a" },
      { ativo: true, nome: "Consulta", permissoes: consulta.permissoes },
    ),
    profile,
  );
  assert.equal(a.cargo, "Consulta");
  assert.equal(a.administrador, false);
});
test("permission database failures fail closed", async () => {
  const db = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: null, error: new Error("offline") };
        },
      };
    },
  };
  await assert.rejects(() => lerAcesso(db, profile), /offline/);
});
test("role router refuses non administrators even after authentication", async () => {
  const r = rotasCargos(async (_req, res) => {
    res.locals.acesso = consulta;
    return {};
  });
  const res = {
    locals: {},
    status(n) {
      this.code = n;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  let next = false;
  await r.stack[0].handle({}, res, () => {
    next = true;
  });
  assert.equal(res.code, 403);
  assert.equal(next, false);
});
test("save actor is derived from session and forged payloads are rejected", async () => {
  const calls = [];
  const db = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: "id", error: null };
    },
  };
  const r = rotasCargos(async () => db),
    save = r.stack.find((x) => x.route?.methods.put).route.stack[0].handle;
  const res = {
    locals: { cargosDb: db, adminUserId: "real-session-owner" },
    status(n) {
      this.code = n;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  await save({ body: { ...body, id_usuario: "forged" } }, res, (e) => {
    throw e;
  });
  assert.equal(res.code, 400);
  assert.equal(calls.length, 0);
  await save({ body }, res, (e) => {
    throw e;
  });
  assert.equal(calls[0].args.p_usuario, "real-session-owner");
});

test('creating a customer does not grant creation of employee or administrator accounts',()=>{const a={administrador:false,cargo:'Atendimento',permissoes:{clientes:{visualizar:true,criar:true}}};assert.equal(permitirRequisicao(a,'POST','/api/admin/users',{position:'Cliente',profile:'Cliente'}),true);assert.equal(permitirRequisicao(a,'POST','/api/admin/users',{position:'Administrador',profile:'Administrador'}),false);assert.equal(permitirRequisicao(a,'POST','/api/admin/users',{position:'Cliente',profile:'Administrador'}),false);assert.equal(permitirRequisicao(a,'POST','/api/admin/users',null),false)});
