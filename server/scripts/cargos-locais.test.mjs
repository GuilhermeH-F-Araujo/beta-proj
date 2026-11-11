import test from "node:test";
import assert from "node:assert/strict";
import { definirAcessoConta } from "../../client/src/services/acessoConta.ts";
import {
  lerCatalogoServicos,
  salvarCatalogoServicos,
} from "../../client/src/services/catalogoServicos.ts";
const data = new Map();
global.localStorage = {
  getItem: (k) => data.get(k) ?? null,
  setItem: (k, v) => data.set(k, v),
};
global.window = { dispatchEvent() {} };
global.CustomEvent = class {};
let revision=0;
global.fetch=async (_url,init={})=>{const input=init.method==='PUT'?JSON.parse(init.body):null;if(input)revision++;return new Response(JSON.stringify({dados:input?.dados??null,versao:revision}),{headers:{'Content-Type':'application/json'}})};

test("local catalog checks separate create edit delete permissions before persistence", async () => {
  definirAcessoConta({
    administrador: false,
    cargo: "Consulta",
    permissoes: { servicos: { visualizar: true } },
  });
  const base = lerCatalogoServicos(),
    add = structuredClone(base);
  add.servicos.push({ ...base.servicos[0], id: "new-test" });
  await assert.rejects(() => salvarCatalogoServicos(add), /não permite/);
  assert.equal(data.size, 0);
  definirAcessoConta({
    administrador: false,
    cargo: "Criar",
    permissoes: { servicos: { visualizar: true, criar: true } },
  });
  await salvarCatalogoServicos(add);
  const edit = structuredClone(add);
  edit.servicos[0].nome = "Outra descrição";
  await assert.rejects(() => salvarCatalogoServicos(edit), /não permite/);
  const remove = structuredClone(add);
  remove.servicos.pop();
  await assert.rejects(() => salvarCatalogoServicos(remove), /não permite/);
  definirAcessoConta({
    administrador: true,
    cargo: "Administrador",
    permissoes: {},
  });
  await salvarCatalogoServicos(base);
});
