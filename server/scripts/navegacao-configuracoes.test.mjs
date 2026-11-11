import test from "node:test";
import assert from "node:assert/strict";
import {
  proximaOpcao,
  selecionarAbaConfiguracao,
} from "../../client/src/services/navegacaoConfiguracao.ts";
test("horizontal tabs wrap with arrow keys and support Home and End", () => {
  assert.equal(proximaOpcao("ArrowRight", 2, 3), 0);
  assert.equal(proximaOpcao("ArrowLeft", 0, 3), 2);
  assert.equal(proximaOpcao("Home", 2, 3), 0);
  assert.equal(proximaOpcao("End", 0, 3), 2);
  assert.equal(proximaOpcao("ArrowDown", 0, 3), null);
});
test("vertical preferences use vertical keys without swallowing unrelated shortcuts", () => {
  assert.equal(proximaOpcao("ArrowDown", 2, 3, true), 0);
  assert.equal(proximaOpcao("ArrowUp", 0, 3, true), 2);
  assert.equal(proximaOpcao("ArrowRight", 1, 3, true), null);
  assert.equal(proximaOpcao("Tab", 1, 3, true), null);
  assert.equal(proximaOpcao("Home", 0, 0, true), null);
});
test("deep links restore the requested section while disallowed and deleted topics fall back safely", () => {
  assert.equal(selecionarAbaConfiguracao("notificacoes", true), "notificacoes");
  assert.equal(selecionarAbaConfiguracao("preferencias", true), "preferencias");
  assert.equal(selecionarAbaConfiguracao("seguranca", false), "preferencias");
  assert.equal(selecionarAbaConfiguracao("usuarios", true), "geral");
  assert.equal(selecionarAbaConfiguracao("inventado", true), "geral");
  assert.equal(selecionarAbaConfiguracao(null, false), "preferencias");
  assert.equal(
    selecionarAbaConfiguracao("notificacoes", false),
    "notificacoes",
  );
});
