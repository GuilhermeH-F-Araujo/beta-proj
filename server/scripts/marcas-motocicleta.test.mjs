import assert from 'node:assert/strict';
import test from 'node:test';
import { sugestoesMarcasMotocicleta } from '../src/marcasMotocicleta.ts';

test('marcas locais continuam disponíveis e a API acrescenta sugestões sem duplicar', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        Results: [{ MakeName: 'HONDA' }, { MakeName: 'NOVA MOTO' }, { MakeName: 'nova moto' }],
      }),
    });
    const marcas = await sugestoesMarcasMotocicleta();
    assert.equal(marcas[0], 'Honda');
    assert.equal(marcas.filter((nome) => nome.toLowerCase() === 'honda').length, 1);
    assert.equal(marcas.filter((nome) => nome.toLowerCase() === 'nova moto').length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
