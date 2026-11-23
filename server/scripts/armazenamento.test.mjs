import testar from 'node:test';
import verificar from 'node:assert/strict';
import {
  normalizarChaveArmazenamento,
  migrarArmazenamentoLocal,
} from '../../client/src/services/migrarArmazenamento.ts';

function armazenamentoSimulado(registros) {
  const dados = new Map(Object.entries(registros));
  return {
    get length() {
      return dados.size;
    },
    key: (indice) => [...dados.keys()][indice],
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, valor),
    removeItem: (chave) => dados.delete(chave),
  };
}

testar('migracao reconhece rotulos antigos sem alterar chaves de terceiros', () => {
  verificar.equal(
    normalizarChaveArmazenamento('estacao-rascunho-v123:conta:campo'),
    'estacao-rascunho:conta:campo',
  );
  verificar.equal(normalizarChaveArmazenamento('outra-aplicacao-v123'), 'outra-aplicacao-v123');
});

testar('migracao preserva o destino existente e conserva os valores dos rascunhos', () => {
  globalThis.localStorage = armazenamentoSimulado({
    'estacao-catalogo-v123': 'antigo',
    'estacao-catalogo': 'atual',
  });
  globalThis.sessionStorage = armazenamentoSimulado({
    'estacao-rascunho-v123:conta:campo': 'conteudo',
  });
  try {
    migrarArmazenamentoLocal();
    verificar.equal(localStorage.getItem('estacao-catalogo'), 'atual');
    verificar.equal(localStorage.getItem('estacao-catalogo-v123'), null);
    verificar.equal(sessionStorage.getItem('estacao-rascunho:conta:campo'), 'conteudo');
  } finally {
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
  }
});
