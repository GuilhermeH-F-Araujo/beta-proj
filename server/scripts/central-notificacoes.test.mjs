import test from "node:test";
import assert from "node:assert/strict";
import {
  configurarCentralNotificacoes,
  atualizarCentralNotificacoes,
  atualizarAvisoLocal,
  estadoNotificacoes,
} from "../../client/src/services/centralNotificacoes.ts";
import {
  definirUsuarioNotificacoes,
  padraoNotificacoes,
  salvarConfigNotificacoes,
} from "../../client/src/services/preferenciasNotificacoes.ts";
import { prepararAudioNotificacoes } from "../../client/src/services/sonsNotificacao.ts";
import { request } from "../../client/src/services/apiAutenticacao.ts";
const values = new Map();
globalThis.localStorage = {
  getItem: (k) => values.get(k) || null,
  setItem: (k, v) => values.set(k, String(v)),
};
globalThis.window = Object.assign(new EventTarget(), {
  setTimeout,
  clearTimeout,
});
let frequencias = [];
class ContextoAudio {
  state = "suspended";
  currentTime = 0;
  destination = {};
  async resume() {
    this.state = "running";
  }
  createOscillator() {
    return {
      type: "sine",
      frequency: {
        setValueAtTime(f) {
          frequencias.push(f);
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
const event = (id, kind = "novo_cliente") => ({
  id,
  kind,
  title: "Evento",
  body: "Teste",
  createdAt: new Date().toISOString(),
  read: false,
  orderId: null,
});
const response = (items) =>
  new Response(JSON.stringify({ items, unreadCount: items.length }), {
    headers: { "Content-Type": "application/json" },
  });
test("chosen beep runs for a new event and is not replayed by navigation or refresh", async () => {
  definirUsuarioNotificacoes("som-integrado");
  configurarCentralNotificacoes("som-integrado");
  const config = padraoNotificacoes();
  config.ativo = true;
  config.eventos.novo_cliente.som = true;
  config.eventos.novo_cliente.toque = "sino";
  salvarConfigNotificacoes(config);
  await prepararAudioNotificacoes(true);
  globalThis.fetch = async () => response([event(1)]);
  await atualizarCentralNotificacoes();
  await new Promise(setImmediate);
  assert.deepEqual(frequencias, [], "old events stay silent");
  globalThis.fetch = async () => response([event(2), event(1)]);
  await atualizarCentralNotificacoes();
  await new Promise(setImmediate);
  assert.deepEqual(
    frequencias,
    [659, 988, 1318],
    "plays selected sino frequencies",
  );
  configurarCentralNotificacoes("som-integrado");
  await atualizarCentralNotificacoes();
  await new Promise(setImmediate);
  assert.equal(frequencias.length, 3, "navigation must not reset known events");
});
test("completed writes announce a refresh, while reads and failed writes do not", async () => {
  let updates = 0;
  const listener = () => updates++;
  window.addEventListener("admin-notifications-refresh", listener);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  await request("/api/clients/1", { method: "PATCH", body: "{}" });
  assert.equal(updates, 1);
  await request("/api/orders/1", { method: "GET" });
  assert.equal(updates, 1);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Falha esperada" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  await assert.rejects(
    request("/api/orders/1", { method: "PATCH", body: "{}" }),
  );
  assert.equal(updates, 1);
  window.removeEventListener("admin-notifications-refresh", listener);
});
test("stale refresh cannot undo a successful read action", async () => {
  configurarCentralNotificacoes("race-test");
  globalThis.fetch = async () => response([event(10)]);
  await atualizarCentralNotificacoes();
  let release;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      release = () => resolve(response([event(10)]));
    });
  const pending = atualizarCentralNotificacoes();
  atualizarAvisoLocal(10, "ler");
  release();
  await pending;
  assert.equal(estadoNotificacoes().items[0].read, true);
});
