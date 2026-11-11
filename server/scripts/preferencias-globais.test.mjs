import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizarLeitura,
  lerPreferenciasLeitura,
  salvarPreferenciasLeitura,
  aplicarPreferenciasLeitura,
  iniciarPreferenciasGlobais,
} from "../../client/src/services/preferenciasGlobais.ts";
const values = new Map();
globalThis.localStorage = {
  getItem: (k) => values.get(k) || null,
  setItem: (k, v) => values.set(k, String(v)),
};
const vars = new Map();
const root = {
  dataset: {},
  style: {
    setProperty: (k, v) => vars.set(k, v),
    getPropertyValue: (k) => vars.get(k) || "",
  },
};
class ElementStub {
  matches(){return false}
  querySelectorAll(){return []}
  constructor(id = "") {
    this.id = id;
    this.dataset = {};
    this.tagName = "DIV";
    this.parentElement = null;
  }
}
globalThis.Element = ElementStub;
globalThis.HTMLElement = ElementStub;
const body = { children: [] };
globalThis.document = { documentElement: root, body };
globalThis.window = new EventTarget();
let mutation;
globalThis.MutationObserver = class {
  constructor(fn) {
    mutation = fn;
  }
  observe() {}
  disconnect() {}
};
test("reading settings apply immediately to the shared root and survive navigation/reload", () => {
  const next = {
    ...normalizarLeitura(),
    tamanhoTexto: 140,
    pesoTexto: 650,
    espacoLinhas: 18,
  };
  salvarPreferenciasLeitura(next);
  assert.equal(vars.get("--app-content-scale"), "1.4");
  assert.equal(vars.get("--app-menu-scale"), "1");
  assert.equal(vars.get("--app-header-scale"), "1");
  assert.equal(vars.get("--app-modal-scale"), "1");
  assert.equal(vars.get("--app-font-weight"), "650");
  assert.equal(vars.get("--app-heading-weight"), "850");
  assert.equal(vars.get("--app-line-height"), "1.8");
  assert.equal(root.dataset.appReading, "true");
  assert.deepEqual(lerPreferenciasLeitura(), next);
  root.dataset = {};
  aplicarPreferenciasLeitura();
  assert.equal(root.dataset.appTextScale, "140");
});
test("a single global observer includes new portals and leaves the React root unscaled", () => {
  const portal = new ElementStub();
  portal.parentElement = body;
  const reactRoot = new ElementStub("root");
  reactRoot.parentElement = body;
  body.children = [reactRoot];
  const stop = iniciarPreferenciasGlobais();
  mutation([{ addedNodes: [portal, reactRoot] }]);
  assert.equal(portal.dataset.appPortalRoot, "true");
  assert.equal(reactRoot.dataset.appPortalRoot, undefined);
  stop();
});
test("corrupt settings cannot set nonfinite scale or invalid weight/spacing", () => {
  const prefs = normalizarLeitura({
    tamanhoTexto: Infinity,
    pesoTexto: -9,
    espacoLinhas: 99,
  });
  assert.equal(prefs.tamanhoTexto, 110);
  assert.equal(prefs.pesoTexto, 400);
  assert.equal(prefs.espacoLinhas, 18);
});
