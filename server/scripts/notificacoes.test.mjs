import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setUsuarioNotificacoes,
  lerConfiguracaoNotificacoes,
  salvarConfiguracaoNotificacoes,
  padraoNotificacoes,
  estaEmSilencio,
  somDoEvento,
  eventosNotificacao,
  chaveNotificacoes,
} from '../../client/src/services/preferenciasNotificacoes.ts';
import { notificacoesSchema } from '../src/preferenciasConta.ts';
import { tiposAvisos } from '../src/cargos.ts';
import { readFileSync } from 'node:fs';
import { salvarSomPersonalizado } from '../../client/src/services/sonsNotificacao.ts';
const armazenamento = new Map();
globalThis.localStorage = {
  getItem: (chave) => armazenamento.get(chave) ?? null,
  setItem: (chave, valor) => armazenamento.set(chave, String(valor)),
};
globalThis.window = { dispatchEvent() {} };
test('catalogo abrange os tipos produzidos pelo banco e tem regras para todos os eventos', () => {
  const tipos = eventosNotificacao.map(({ id }) => id);
  const sql = readFileSync(
    new URL(
      '../../supabase/migrations/20261118154500_notificacoes_miniaturas.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const permitidos = sql.match(/check \(tipo in \(([\s\S]*?)\)\)/)[1];
  assert.deepEqual(
    [...permitidos.matchAll(/'([^']+)'/g)].map((resultado) => resultado[1]).sort(),
    tipos.toSorted(),
  );
  assert.deepEqual(Object.keys(padraoNotificacoes().eventos), tipos);
});

test('regras antigas continuam validas e eventos novos respeitam o modulo da conta', () => {
  const anterior = padraoNotificacoes();
  delete anterior.eventos.nova_moto;
  delete anterior.eventos.agendamento_confirmado;
  assert.equal(notificacoesSchema.safeParse(anterior).success, true);
  assert.equal(
    notificacoesSchema.safeParse({
      ...anterior,
      eventos: { ...anterior.eventos, inexistente: anterior.eventos.nova_os },
    }).success,
    false,
  );
  assert.deepEqual(
    tiposAvisos({
      administrador: false,
      cargo: 'Recepção',
      permissoes: { motocicletas: { visualizar: true } },
    }),
    ['nova_moto', 'moto_atualizada'],
  );
});
test('notification preferences are isolated by account on the same browser', () => {
  setUsuarioNotificacoes('admin-a');
  const primeiroElemento = padraoNotificacoes();
  primeiroElemento.ativo = true;
  primeiroElemento.volume = 80;
  salvarConfiguracaoNotificacoes(primeiroElemento);
  setUsuarioNotificacoes('admin-b');
  assert.equal(lerConfiguracaoNotificacoes().ativo, false);
  assert.equal(lerConfiguracaoNotificacoes().volume, 35);
  setUsuarioNotificacoes('admin-a');
  assert.equal(lerConfiguracaoNotificacoes().volume, 80);
});
test('quiet hours cross midnight with inclusive start and exclusive end', () => {
  const elementoAtual = {
    ...padraoNotificacoes(),
    silencio: true,
    inicio: '18:00',
    fim: '08:00',
  };
  for (const [alturaAtual, mesAtual, silencioso] of [
    [17, 59, false],
    [18, 0, true],
    [23, 0, true],
    [0, 0, true],
    [7, 59, true],
    [8, 0, false],
  ])
    assert.equal(
      estaEmSilencio(elementoAtual, new Date(2026, 10, 7, alturaAtual, mesAtual)),
      silencioso,
      `${alturaAtual}:${mesAtual}`,
    );
  assert.equal(estaEmSilencio({ ...elementoAtual, inicio: '08:00', fim: '08:00' }), true);
});
test('sound honors master toggle, hidden events, event sound choice, volume and quiet hours', () => {
  const elementoAtual = padraoNotificacoes();
  assert.equal(somDoEvento('nova_os', elementoAtual), null);
  elementoAtual.ativo = true;
  assert.equal(somDoEvento('nova_os', elementoAtual), 'brisa');
  assert.equal(somDoEvento('novo_cliente', elementoAtual), null);
  elementoAtual.eventos.novo_cliente.som = true;
  elementoAtual.eventos.novo_cliente.toque = 'sino';
  assert.equal(somDoEvento('novo_cliente', elementoAtual), 'sino');
  elementoAtual.eventos.novo_cliente.painel = false;
  assert.equal(somDoEvento('novo_cliente', elementoAtual), null);
  elementoAtual.volume = 0;
  assert.equal(somDoEvento('nova_os', elementoAtual), null);
  assert.equal(somDoEvento('unknown', elementoAtual), null);
});
test('malformed stored values cannot introduce unknown sounds or invalid times', () => {
  setUsuarioNotificacoes('corrupt');
  localStorage.setItem(
    chaveNotificacoes(),
    JSON.stringify({
      ativo: 'false',
      volume: 900,
      toque: 'script',
      inicio: '99:70',
      fim: '99:10',
      eventos: { nova_os: { toque: 'evil', som: 'true', painel: 'false' } },
    }),
  );
  const elementoAtual = lerConfiguracaoNotificacoes();
  assert.equal(elementoAtual.ativo, false);
  assert.equal(elementoAtual.volume, 100);
  assert.equal(elementoAtual.toque, 'brisa');
  assert.equal(elementoAtual.inicio, '18:00');
  assert.equal(elementoAtual.eventos.nova_os.toque, 'padrao');
  assert.equal(elementoAtual.eventos.nova_os.painel, true);
});
test('custom audio rejects unsupported extension, MIME, empty and oversized files before decoding', async () => {
  const casos = [
    new File(['code'], 'script.svg', { type: 'image/svg+xml' }),
    new File(['code'], 'som.mp3', { type: 'text/html' }),
    new File([], 'vazio.wav', { type: 'audio/wav' }),
    new File([new Uint8Array(1500001)], 'grande.mp3', { type: 'audio/mpeg' }),
  ];
  for (const funcaoAtual of casos) await assert.rejects(salvarSomPersonalizado(funcaoAtual));
});
