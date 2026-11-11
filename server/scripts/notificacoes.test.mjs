import test from "node:test";
import assert from "node:assert/strict";
import {
  definirUsuarioNotificacoes,
  lerConfigNotificacoes,
  salvarConfigNotificacoes,
  padraoNotificacoes,
  estaEmSilencio,
  somDoEvento,
  eventosNotificacao,
  chaveNotificacoes,
} from "../../client/src/services/preferenciasNotificacoes.ts";
import { salvarSomPersonalizado } from "../../client/src/services/sonsNotificacao.ts";
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};
globalThis.window = { dispatchEvent() {} };
test("all nine persisted server event types have configurable rules", () => {
  assert.equal(eventosNotificacao.length, 9);
  assert.equal(Object.keys(padraoNotificacoes().eventos).length, 9);
  for (const id of [
    "novo_cliente",
    "cliente_atualizado",
    "nova_os",
    "os_atualizada",
    "status_os",
    "aguardando_peca",
    "pronta",
    "entregue",
    "cancelada",
  ])
    assert.ok(padraoNotificacoes().eventos[id]);
});
test("notification preferences are isolated by account on the same browser", () => {
  definirUsuarioNotificacoes("admin-a");
  const a = padraoNotificacoes();
  a.ativo = true;
  a.volume = 80;
  salvarConfigNotificacoes(a);
  definirUsuarioNotificacoes("admin-b");
  assert.equal(lerConfigNotificacoes().ativo, false);
  assert.equal(lerConfigNotificacoes().volume, 35);
  definirUsuarioNotificacoes("admin-a");
  assert.equal(lerConfigNotificacoes().volume, 80);
});
test("quiet hours cross midnight with inclusive start and exclusive end", () => {
  const c = {
    ...padraoNotificacoes(),
    silencio: true,
    inicio: "18:00",
    fim: "08:00",
  };
  for (const [h, m, quiet] of [
    [17, 59, false],
    [18, 0, true],
    [23, 0, true],
    [0, 0, true],
    [7, 59, true],
    [8, 0, false],
  ])
    assert.equal(
      estaEmSilencio(c, new Date(2026, 10, 7, h, m)),
      quiet,
      `${h}:${m}`,
    );
  assert.equal(estaEmSilencio({ ...c, inicio: "08:00", fim: "08:00" }), true);
});
test("sound honors master toggle, hidden events, event sound choice, volume and quiet hours", () => {
  const c = padraoNotificacoes();
  assert.equal(somDoEvento("nova_os", c), null);
  c.ativo = true;
  assert.equal(somDoEvento("nova_os", c), "brisa");
  assert.equal(somDoEvento("novo_cliente", c), null);
  c.eventos.novo_cliente.som = true;
  c.eventos.novo_cliente.toque = "sino";
  assert.equal(somDoEvento("novo_cliente", c), "sino");
  c.eventos.novo_cliente.painel = false;
  assert.equal(somDoEvento("novo_cliente", c), null);
  c.volume = 0;
  assert.equal(somDoEvento("nova_os", c), null);
  assert.equal(somDoEvento("unknown", c), null);
});
test("malformed stored values cannot introduce unknown sounds or invalid times", () => {
  definirUsuarioNotificacoes("corrupt");
  localStorage.setItem(
    chaveNotificacoes(),
    JSON.stringify({
      ativo: "false",
      volume: 900,
      toque: "script",
      inicio: "99:70",
      fim: "99:10",
      eventos: { nova_os: { toque: "evil", som: "true", painel: "false" } },
    }),
  );
  const c = lerConfigNotificacoes();
  assert.equal(c.ativo, false);
  assert.equal(c.volume, 100);
  assert.equal(c.toque, "brisa");
  assert.equal(c.inicio, "18:00");
  assert.equal(c.eventos.nova_os.toque, "padrao");
  assert.equal(c.eventos.nova_os.painel, true);
});
test("custom audio rejects unsupported extension, MIME, empty and oversized files before decoding", async () => {
  const cases = [
    new File(["code"], "script.svg", { type: "image/svg+xml" }),
    new File(["code"], "som.mp3", { type: "text/html" }),
    new File([], "vazio.wav", { type: "audio/wav" }),
    new File([new Uint8Array(1500001)], "grande.mp3", { type: "audio/mpeg" }),
  ];
  for (const f of cases) await assert.rejects(salvarSomPersonalizado(f));
});
