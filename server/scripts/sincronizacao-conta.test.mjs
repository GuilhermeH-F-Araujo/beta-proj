import test from "node:test";
import assert from "node:assert/strict";
import { carregarPreferenciasDaConta } from "../../client/src/services/carregarPreferenciasConta.ts";
import {
  iniciarSincronizacaoConta,
  sincronizarPreferenciasConta,
  enfileirarPreferenciaConta,
  suspenderSincronizacaoConta,
  estadoSincronizacao,
} from "../../client/src/services/sincronizacaoConta.ts";
import {
  normalizarLeitura,
  salvarPreferenciasLeitura,
  lerPreferenciasLeitura,
} from "../../client/src/services/preferenciasGlobais.ts";
import {
  padraoNotificacoes,
  salvarConfigNotificacoes,
  lerConfigNotificacoes,
} from "../../client/src/services/preferenciasNotificacoes.ts";
import {
  salvarInatividadeConta,
  minutosInatividade,
} from "../../client/src/services/configuracoesSistema.ts";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002";
const cache = new Map();
globalThis.localStorage = {
  getItem: (k) => cache.get(k) || null,
  setItem: (k, v) => cache.set(k, String(v)),
  clear: () => cache.clear(),
};
globalThis.window = Object.assign(new EventTarget(), {
  setTimeout,
  clearTimeout,
});
const variables = new Map();
globalThis.document = {
  documentElement: {
    dataset: {},
    style: {
      setProperty: (k, v) => variables.set(k, v),
      getPropertyValue: (k) => variables.get(k) || "",
    },
  },
};
const cloud = new Map();
let active = A;
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function server() {
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (!init.method || init.method === "GET")
      return json({
        conta: active,
        leitura: null,
        notificacoes: null,
        seguranca: null,
        somVersao: null,
        ...cloud.get(active),
      });
    const data = JSON.parse(init.body);
    assert.equal(data.conta, active);
    const section = path.split("/").pop();
    cloud.set(active, { ...cloud.get(active), [section]: data.valor });
    return json({ ok: true, conta: active });
  };
}
test("a fresh computer restores reading, independent region sizes, sounds and inactivity from the same account", async () => {
  cache.clear();
  server();
  await carregarPreferenciasDaConta(A);
  const prefs = {
    ...normalizarLeitura(),
    tamanhoTexto: 150,
    tamanhoMenu: 95,
    tamanhoCabecalho: 110,
    tamanhoModais: 125,
    pesoTexto: 650,
    espacoLinhas: 17,
  };
  salvarPreferenciasLeitura(prefs);
  const notif = padraoNotificacoes();
  notif.ativo = true;
  notif.toque = "sino";
  notif.eventos.novo_cliente.som = true;
  salvarConfigNotificacoes(notif);
  salvarInatividadeConta(A, 60);
  await sincronizarPreferenciasConta();
  assert.equal(cloud.get(A).leitura.tamanhoTexto, 150);
  suspenderSincronizacaoConta();
  cache.clear();
  await carregarPreferenciasDaConta(A);
  assert.deepEqual(lerPreferenciasLeitura(), prefs);
  assert.equal(variables.get("--app-content-scale"), "1.5");
  assert.equal(variables.get("--app-menu-scale"), "0.95");
  assert.equal(variables.get("--app-modal-scale"), "1.25");
  assert.equal(lerConfigNotificacoes().toque, "sino");
  assert.equal(lerConfigNotificacoes().eventos.novo_cliente.som, true);
  assert.equal(minutosInatividade(A), 60);
  await sincronizarPreferenciasConta();
  suspenderSincronizacaoConta();
});
test("another account does not inherit the previous account preferences or pending writes", async () => {
  active = B;
  server();
  await carregarPreferenciasDaConta(B);
  assert.equal(lerPreferenciasLeitura().tamanhoTexto, 110);
  assert.equal(lerConfigNotificacoes().ativo, false);
  await sincronizarPreferenciasConta();
  assert.equal(cloud.get(A).leitura.tamanhoTexto, 150);
  assert.equal(cloud.get(B).leitura.tamanhoTexto, 110);
  suspenderSincronizacaoConta();
});
test("a newer edit made while a request is pending is sent after the first response", async () => {
  active = A;
  iniciarSincronizacaoConta(A);
  let release;
  const values = [];
  globalThis.fetch = async (_url, init) => {
    const data = JSON.parse(init.body);
    values.push(data.valor.tamanhoTexto);
    if (values.length === 1)
      await new Promise((resolve) => (release = resolve));
    return json({ ok: true, conta: A });
  };
  enfileirarPreferenciaConta("leitura", {
    ...normalizarLeitura(),
    tamanhoTexto: 120,
  });
  const pending = sincronizarPreferenciasConta();
  enfileirarPreferenciaConta("leitura", {
    ...normalizarLeitura(),
    tamanhoTexto: 145,
  });
  release();
  await pending;
  assert.deepEqual(values, [120, 145]);
  assert.equal(estadoSincronizacao().estado, "salvo");
  suspenderSincronizacaoConta();
});
test("failed synchronization keeps the draft and only reports saved after a successful retry", async () => {
  iniciarSincronizacaoConta(A);
  globalThis.fetch = async () => json({ message: "Conexão indisponível" }, 503);
  enfileirarPreferenciaConta("seguranca", { inatividade: 20 });
  await sincronizarPreferenciasConta();
  assert.equal(estadoSincronizacao().estado, "erro");
  assert.match(
    localStorage.getItem(`estacao-conta-${A}-alteracoes-pendentes`),
    /20/,
  );
  suspenderSincronizacaoConta();
  iniciarSincronizacaoConta(A);
  server();
  await sincronizarPreferenciasConta();
  assert.equal(cloud.get(A).seguranca.inatividade, 20);
  assert.equal(estadoSincronizacao().estado, "salvo");
  suspenderSincronizacaoConta();
});
