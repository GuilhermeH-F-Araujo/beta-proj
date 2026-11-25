import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resolverUrlCliente,
  origensClienteConfiaveis,
  alteracaoPainelConfiavel,
} from './url-cliente.mjs';

const espacoDesenvolvimento = {
  CODESPACES: 'true',
  CODESPACE_NAME: 'fluffy-parakeet-q7vq5x4q6569fx9wr',
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
};
const encaminhado = 'https://fluffy-parakeet-q7vq5x4q6569fx9wr-5173.app.github.dev';

test('Codespaces troca localhost pelo endereço real do navegador', () => {
  assert.equal(
    resolverUrlCliente({ ...espacoDesenvolvimento, CLIENT_URL: 'http://localhost:5173' }),
    encaminhado,
  );
  assert.equal(
    resolverUrlCliente({ ...espacoDesenvolvimento, CLIENT_URL: 'http://127.0.0.1:5173' }),
    encaminhado,
  );
  assert.equal(resolverUrlCliente(espacoDesenvolvimento), encaminhado);
});

test('a URL encaminhada funciona mesmo sem o marcador CODESPACES', () => {
  const { CODESPACES, ...withoutFlag } = espacoDesenvolvimento;
  assert.equal(
    resolverUrlCliente({ ...withoutFlag, CLIENT_URL: 'http://localhost:5173' }),
    encaminhado,
  );
});

test('mutações aceitam somente origens locais e do Codespace conhecido no desenvolvimento', () => {
  const permitido = origensClienteConfiaveis({
    ...espacoDesenvolvimento,
    CLIENT_URL: 'http://localhost:5173',
  });
  assert.equal(permitido.has(encaminhado), true);
  assert.equal(permitido.has('http://localhost:5173'), true);
  assert.equal(permitido.has('https://outro-5173.app.github.dev'), false);
  assert.equal(permitido.has('https://evil.example'), false);
  const producao = origensClienteConfiaveis({
    CLIENT_URL: 'https://painel.example.com',
    NODE_ENV: 'production',
  });
  assert.deepEqual([...producao], ['https://painel.example.com']);
});

test('o proxy aceita requisição da mesma origem e rejeita sites externos', () => {
  const ambiente = { ...espacoDesenvolvimento, CLIENT_URL: 'http://localhost:5173' };
  assert.equal(
    alteracaoPainelConfiavel('https://nova-url-do-painel.example', 'same-origin', ambiente),
    true,
  );
  assert.equal(
    alteracaoPainelConfiavel('https://nova-url-do-painel.example', 'cross-site', ambiente),
    false,
  );
  assert.equal(
    alteracaoPainelConfiavel('https://nova-url-do-painel.example', undefined, ambiente),
    false,
  );
  assert.equal(alteracaoPainelConfiavel(undefined, 'cross-site', ambiente), false);
});

test('Codespaces corrige um link de workspace anterior e usa o domínio fornecido pelo GitHub', () => {
  assert.equal(
    resolverUrlCliente({ ...espacoDesenvolvimento, CLIENT_URL: 'https://old-5173.app.github.dev' }),
    encaminhado,
  );
  assert.equal(
    resolverUrlCliente({
      ...espacoDesenvolvimento,
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'ports.example.dev',
    }),
    'https://fluffy-parakeet-q7vq5x4q6569fx9wr-5173.ports.example.dev',
  );
});

test('uma origem própria explícita e um ambiente fora do Codespaces permanecem estáveis', () => {
  assert.equal(
    resolverUrlCliente({ ...espacoDesenvolvimento, CLIENT_URL: 'https://painel.example.com' }),
    'https://painel.example.com',
  );
  assert.equal(
    resolverUrlCliente({ CLIENT_URL: 'http://localhost:5173' }),
    'http://localhost:5173',
  );
});

test('não monta endereço a partir de metadados inesperados', () => {
  assert.equal(
    resolverUrlCliente({
      ...espacoDesenvolvimento,
      CODESPACE_NAME: 'x.evil.com',
      CLIENT_URL: 'http://localhost:5173',
    }),
    'http://localhost:5173',
  );
});
