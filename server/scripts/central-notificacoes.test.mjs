import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configurarCentralNotificacoes,
  atualizarCentralNotificacoes,
  atualizarAvisoLocal,
  estadoNotificacoes,
} from '../../client/src/services/centralNotificacoes.ts';
import {
  setUsuarioNotificacoes,
  padraoNotificacoes,
  salvarConfiguracaoNotificacoes,
} from '../../client/src/services/preferenciasNotificacoes.ts';
import { prepararAudioNotificacoes } from '../../client/src/services/sonsNotificacao.ts';
import { request } from '../../client/src/services/apiAutenticacao.ts';
const valores = new Map();
globalThis.localStorage = {
  getItem: (chaveAtual) => valores.get(chaveAtual) || null,
  setItem: (chaveAtual, valorAtual) => valores.set(chaveAtual, String(valorAtual)),
};
globalThis.window = Object.assign(new EventTarget(), {
  setTimeout,
  clearTimeout,
});
let frequencias = [];
class ContextoAudio {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  async resume() {
    this.state = 'running';
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: {
        setValueAtTime(funcaoAtual) {
          frequencias.push(funcaoAtual);
        },
      },
      connect() {},
      disconnect() {},
      start() {},
      stop() {
        this.onended?.();
      },
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
    };
  }
}
globalThis.AudioContext = ContextoAudio;
const evento = (id, tipoElemento = 'novo_cliente') => ({
  id,
  kind: tipoElemento,
  title: 'Evento',
  body: 'Teste',
  createdAt: new Date().toISOString(),
  read: false,
  orderId: null,
});
const response = (itens) =>
  new Response(JSON.stringify({ items: itens, unreadCount: itens.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
test('chosen beep runs for a new event and is not replayed by navigation or refresh', async () => {
  setUsuarioNotificacoes('som-integrado');
  configurarCentralNotificacoes('som-integrado');
  const configuracao = padraoNotificacoes();
  configuracao.ativo = true;
  configuracao.eventos.novo_cliente.som = true;
  configuracao.eventos.novo_cliente.toque = 'sino';
  salvarConfiguracaoNotificacoes(configuracao);
  await prepararAudioNotificacoes(true);
  globalThis.fetch = async () => response([evento(1)]);
  await atualizarCentralNotificacoes();
  await new Promise(setImmediate);
  assert.deepEqual(frequencias, [], 'old events stay silent');
  globalThis.fetch = async () => response([evento(2), evento(1)]);
  await atualizarCentralNotificacoes();
  await new Promise(setImmediate);
  assert.deepEqual(frequencias, [659, 988, 1318], 'plays selected sino frequencies');
  configurarCentralNotificacoes('som-integrado');
  await atualizarCentralNotificacoes();
  await new Promise(setImmediate);
  assert.equal(frequencias.length, 3, 'navigation must not reset known events');
});
test('completed writes announce a refresh, while reads and failed writes do not', async () => {
  let atualizacoes = 0;
  const observador = () => atualizacoes++;
  window.addEventListener('admin-notifications-refresh', observador);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  await request('/api/clients/1', { method: 'PATCH', body: '{}' });
  assert.equal(atualizacoes, 1);
  await request('/api/orders/1', { method: 'GET' });
  assert.equal(atualizacoes, 1);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'Falha esperada' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  await assert.rejects(request('/api/orders/1', { method: 'PATCH', body: '{}' }));
  assert.equal(atualizacoes, 1);
  window.removeEventListener('admin-notifications-refresh', observador);
});
test('stale refresh cannot undo a successful read action', async () => {
  configurarCentralNotificacoes('race-test');
  globalThis.fetch = async () => response([evento(10)]);
  await atualizarCentralNotificacoes();
  let liberarRecurso;
  globalThis.fetch = () =>
    new Promise((resolver) => {
      liberarRecurso = () => resolver(response([evento(10)]));
    });
  const pendente = atualizarCentralNotificacoes();
  atualizarAvisoLocal(10, 'ler');
  liberarRecurso();
  await pendente;
  assert.equal(estadoNotificacoes().items[0].read, true);
});
