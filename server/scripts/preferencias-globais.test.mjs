import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarLeitura,
  lerPreferenciasLeitura,
  salvarPreferenciasLeitura,
  aplicarPreferenciasLeitura,
  iniciarPreferenciasGlobais,
} from '../../client/src/services/preferenciasGlobais.ts';
const valores = new Map();
globalThis.localStorage = {
  getItem: (chaveAtual) => valores.get(chaveAtual) || null,
  setItem: (chaveAtual, valorAtual) => valores.set(chaveAtual, String(valorAtual)),
};
const variaveis = new Map();
const raiz = {
  dataset: {},
  style: {
    setProperty: (chaveAtual, valorAtual) => variaveis.set(chaveAtual, valorAtual),
    getPropertyValue: (chaveAtual) => variaveis.get(chaveAtual) || '',
  },
};
class ElementoStub {
  matches() {
    return false;
  }
  querySelectorAll() {
    return [];
  }
  constructor(id = '') {
    this.id = id;
    this.dataset = {};
    this.tagName = 'DIV';
    this.parentElement = null;
  }
}
globalThis.Element = ElementoStub;
globalThis.HTMLElement = ElementoStub;
const corpo = { children: [] };
globalThis.document = { documentElement: raiz, body: corpo };
globalThis.window = new EventTarget();
let alteracao;
globalThis.MutationObserver = class {
  constructor(funcao) {
    alteracao = funcao;
  }
  observe() {}
  disconnect() {}
};
test('reading settings apply immediately to the shared root and survive navigation/reload', () => {
  const continuar = {
    ...normalizarLeitura(),
    tamanhoTexto: 140,
    tamanhoBotoes: 125,
    pesoTexto: 650,
    espacoLinhas: 18,
  };
  salvarPreferenciasLeitura(continuar);
  assert.equal(variaveis.get('--app-content-scale'), '1.4');
  assert.equal(variaveis.get('--app-menu-scale'), '1');
  assert.equal(variaveis.get('--app-header-scale'), '1');
  assert.equal(variaveis.get('--app-modal-scale'), '1');
  assert.equal(variaveis.get('--app-button-scale'), '1.25');
  assert.equal(variaveis.get('--app-font-weight'), '650');
  assert.equal(variaveis.get('--app-heading-weight'), '850');
  assert.equal(variaveis.get('--app-line-height'), '1.8');
  assert.equal(raiz.dataset.appReading, 'true');
  assert.deepEqual(lerPreferenciasLeitura(), continuar);
  raiz.dataset = {};
  aplicarPreferenciasLeitura();
  assert.equal(raiz.dataset.appTextScale, '140');
  assert.equal(variaveis.get('--app-button-scale'), '1.25');
});
test('a single global observer includes new portals and leaves the React root unscaled', () => {
  const portal = new ElementoStub();
  portal.parentElement = corpo;
  const reactRaiz = new ElementoStub('root');
  reactRaiz.parentElement = corpo;
  corpo.children = [reactRaiz];
  const parar = iniciarPreferenciasGlobais();
  alteracao([{ addedNodes: [portal, reactRaiz] }]);
  assert.equal(portal.dataset.appPortalRoot, 'true');
  assert.equal(reactRaiz.dataset.appPortalRoot, undefined);
  parar();
});
test('corrupt settings cannot set nonfinite scale or invalid weight/spacing', () => {
  const preferencias = normalizarLeitura({
    tamanhoTexto: Infinity,
    tamanhoBotoes: Infinity,
    pesoTexto: -9,
    espacoLinhas: 99,
  });
  assert.equal(preferencias.tamanhoTexto, 110);
  assert.equal(preferencias.tamanhoBotoes, 100);
  assert.equal(normalizarLeitura({ tamanhoBotoes: 30 }).tamanhoBotoes, 80);
  assert.equal(normalizarLeitura({ tamanhoBotoes: 300 }).tamanhoBotoes, 150);
  assert.equal(preferencias.pesoTexto, 400);
  assert.equal(preferencias.espacoLinhas, 18);
});
