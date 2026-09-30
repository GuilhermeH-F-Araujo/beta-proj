import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveClientUrl, trustedClientOrigins, isTrustedPanelMutation } from './url-cliente.mjs';

const codespace = {
  CODESPACES: 'true',
  CODESPACE_NAME: 'fluffy-parakeet-q7vq5x4q6569fx9wr',
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
};
const forwarded = 'https://fluffy-parakeet-q7vq5x4q6569fx9wr-5173.app.github.dev';

test('Codespaces troca localhost pelo endereço real do navegador', () => {
  assert.equal(resolveClientUrl({ ...codespace, CLIENT_URL: 'http://localhost:5173' }), forwarded);
  assert.equal(resolveClientUrl({ ...codespace, CLIENT_URL: 'http://127.0.0.1:5173' }), forwarded);
  assert.equal(resolveClientUrl(codespace), forwarded);
});

test('a URL encaminhada funciona mesmo sem o marcador CODESPACES', () => {
  const { CODESPACES, ...withoutFlag } = codespace;
  assert.equal(resolveClientUrl({ ...withoutFlag, CLIENT_URL: 'http://localhost:5173' }), forwarded);
});

test('mutações aceitam somente origens locais e do Codespace conhecido no desenvolvimento', () => {
  const allowed = trustedClientOrigins({ ...codespace, CLIENT_URL: 'http://localhost:5173' });
  assert.equal(allowed.has(forwarded), true);
  assert.equal(allowed.has('http://localhost:5173'), true);
  assert.equal(allowed.has('https://outro-5173.app.github.dev'), false);
  assert.equal(allowed.has('https://evil.example'), false);
  const production = trustedClientOrigins({ CLIENT_URL: 'https://painel.example.com', NODE_ENV: 'production' });
  assert.deepEqual([...production], ['https://painel.example.com']);
});

test('o proxy aceita requisição da mesma origem e rejeita sites externos', () => {
  const env = { ...codespace, CLIENT_URL: 'http://localhost:5173' };
  assert.equal(isTrustedPanelMutation('https://nova-url-do-painel.example', 'same-origin', env), true);
  assert.equal(isTrustedPanelMutation('https://nova-url-do-painel.example', 'cross-site', env), false);
  assert.equal(isTrustedPanelMutation('https://nova-url-do-painel.example', undefined, env), false);
  assert.equal(isTrustedPanelMutation(undefined, 'cross-site', env), false);
});

test('Codespaces corrige um link de workspace anterior e usa o domínio fornecido pelo GitHub', () => {
  assert.equal(resolveClientUrl({ ...codespace, CLIENT_URL: 'https://old-5173.app.github.dev' }), forwarded);
  assert.equal(resolveClientUrl({ ...codespace, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'ports.example.dev' }),
    'https://fluffy-parakeet-q7vq5x4q6569fx9wr-5173.ports.example.dev');
});

test('uma origem própria explícita e um ambiente fora do Codespaces permanecem estáveis', () => {
  assert.equal(resolveClientUrl({ ...codespace, CLIENT_URL: 'https://painel.example.com' }), 'https://painel.example.com');
  assert.equal(resolveClientUrl({ CLIENT_URL: 'http://localhost:5173' }), 'http://localhost:5173');
});

test('Render usa sua URL pública para a origem e para os links de recuperação', () => {
  const env = { RENDER_EXTERNAL_URL: 'https://estacao-motos.onrender.com', NODE_ENV: 'production' };
  assert.equal(resolveClientUrl(env), env.RENDER_EXTERNAL_URL);
  assert.deepEqual([...trustedClientOrigins(env)], [env.RENDER_EXTERNAL_URL]);
  assert.equal(resolveClientUrl({ ...env, CLIENT_URL: 'https://painel.example.com' }), 'https://painel.example.com');
});

test('não monta endereço a partir de metadados inesperados', () => {
  assert.equal(resolveClientUrl({ ...codespace, CODESPACE_NAME: 'x.evil.com', CLIENT_URL: 'http://localhost:5173' }), 'http://localhost:5173');
});
