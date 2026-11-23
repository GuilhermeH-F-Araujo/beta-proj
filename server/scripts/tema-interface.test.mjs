import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../../client/src/', import.meta.url);
const tema = readFileSync(new URL('styles/tema.css', root), 'utf8');
const contraste = (a, b) => {
  const lum = (hex) => {
    const rgb = hex
      .replace('#', '')
      .match(/../g)
      .map((x) => parseInt(x, 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
test('paleta escura garante contraste de leitura, texto secundario e botoes primarios', () => {
  const valor = (chave) => tema.match(new RegExp(`--theme-${chave}: (#[a-f0-9]{6})`))[1];
  for (const [texto, fundo] of [
    ['text', 'surface'],
    ['muted', 'surface'],
    ['white', 'red'],
    ['white', 'blue'],
  ])
    assert.ok(contraste(valor(texto), valor(fundo)) >= 4.5, `${texto}/${fundo}`);
  // Os fundos dos icones precisam se distinguir do cartao e do proprio icone.
  for (const cor of ['red', 'blue', 'green', 'amber', 'purple', 'cyan']) {
    assert.notEqual(valor(`${cor}-soft`), valor('surface'));
    assert.ok(contraste(valor(`${cor}-text`), valor(`${cor}-soft`)) >= 4.5, cor);
  }
  assert.notEqual(valor('surface'), valor('canvas'));
  assert.notEqual(valor('surface'), valor('raised'));
  assert.doesNotMatch(tema, /filter:[^;]*invert/);
});
test('todos os tokens de cor usados pelas telas estao definidos no tema compartilhado', () => {
  const definidos = new Set([...tema.matchAll(/(--theme-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  let telas = 0;
  function ler(dir) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) ler(caminho);
      else if (caminho.endsWith('.css') && entrada.name !== 'tema.css') {
        const texto = readFileSync(caminho, 'utf8');
        telas++;
        for (const token of texto.matchAll(/var\((--theme-[a-z0-9-]+)/g))
          assert.ok(definidos.has(token[1]), `${caminho}: ${token[1]}`);
      }
    }
  }
  ler(root.pathname);
  assert.ok(telas >= 39);
});
