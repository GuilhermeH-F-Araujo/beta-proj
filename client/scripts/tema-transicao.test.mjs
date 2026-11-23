import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><button>Tema</button>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
for (const nome of ['window', 'document', 'localStorage', 'Event'])
  globalThis[nome] = dom.window[nome];
globalThis.innerWidth = 1200;
globalThis.innerHeight = 800;
window.matchMedia = () => ({ matches: false });
const { alternarTema } = await import('../src/services/temaInterface.ts');
const { receberPreferenciasLeitura, lerPreferenciasLeitura } = await import(
  '../src/services/preferenciasGlobais.ts'
);
let chamadas = [];
let concluir;
document.startViewTransition = (callback) => {
  callback();
  return { ready: Promise.resolve(), finished: Promise.resolve(), skipTransition() {} };
};
document.documentElement.animate = (quadros, opcoes) => {
  chamadas.push({ quadros, opcoes });
  return {
    finished: new Promise((resolve) => {
      concluir = resolve;
    }),
    cancel() {},
  };
};
const origem = { currentTarget: document.querySelector('button') };
origem.currentTarget.getBoundingClientRect = () => ({ left: 100, top: 20, width: 40, height: 40 });
test('todos os destinos animam a captura nativa com 61 quadros e sem copiar o painel', async () => {
  receberPreferenciasLeitura({ tema: 'claro' });
  document.body.cloneNode = () => {
    throw new Error('nao deve copiar o painel');
  };
  for (const destino of ['escuro', 'claro', undefined]) {
    const antes = lerPreferenciasLeitura().tema;
    const promessa = alternarTema(origem, destino);
    await Promise.resolve();
    assert.notEqual(lerPreferenciasLeitura().tema, antes);
    const ultima = chamadas.at(-1);
    assert.equal(ultima.opcoes.duration, 850);
    assert.equal(ultima.opcoes.pseudoElement, '::view-transition-old(root)');
    assert.equal(ultima.quadros.length, 61);
    assert.match(ultima.quadros[20].maskImage, /120px 40px/);
    concluir();
    await promessa;
    assert.equal(document.documentElement.hasAttribute('data-tema-spotlight'), false);
  }
});
test('preferencia antiga de reduzir movimento nao suprime a troca manual', async () => {
  receberPreferenciasLeitura({ tema: 'claro', reduzirMovimento: true });
  const mudanca = alternarTema(origem, 'escuro');
  await Promise.resolve();
  assert.equal(chamadas.at(-1).opcoes.duration, 850);
  assert.equal(chamadas.at(-1).quadros.length, 61);
  concluir();
  await mudanca;
});

test('falha na captura libera o proximo clique e preserva a troca', async () => {
  document.startViewTransition = (callback) => {
    callback();
    return {
      ready: Promise.reject(Error('captura')),
      finished: Promise.resolve(),
      skipTransition() {},
    };
  };
  await alternarTema(origem, 'claro');
  await alternarTema(origem, 'escuro');
  assert.equal(lerPreferenciasLeitura().tema, 'escuro');
});
