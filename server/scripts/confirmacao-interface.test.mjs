import test from 'node:test';
import assert from 'node:assert/strict';
import {
  request,
  lerResposta,
  ErroRequisicaoApi,
} from '../../client/src/services/api/transporte.ts';
import { registrarConfirmacao } from '../../client/src/services/confirmacaoAdministrativa.ts';
const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

test('duas acoes simultaneas compartilham a verificacao e retomam uma unica vez', async () => {
  const original = globalThis.fetch;
  const janela = globalThis.window;
  const chamadas = new Map();
  let liberar,
    confirmacoes = 0;
  globalThis.window = { dispatchEvent() {} };
  globalThis.fetch = async (url) => {
    const contador = (chamadas.get(url) ?? 0) + 1;
    chamadas.set(url, contador);
    return contador === 1
      ? json(
          {
            code: 'REAUTH_REQUIRED',
            operation: { titulo: 'Atualizar acesso', descricao: 'Confirme antes de continuar.' },
          },
          428,
        )
      : json({ ok: true });
  };
  const remover = registrarConfirmacao((contexto) => {
    confirmacoes++;
    assert.equal(contexto.titulo, 'Atualizar acesso');
    return new Promise((resolve) => {
      liberar = resolve;
    });
  });
  try {
    const respostas = Promise.all([
      request('/api/teste/um', { method: 'PATCH' }),
      request('/api/teste/dois', { method: 'DELETE' }),
    ]);
    await new Promise(setImmediate);
    assert.equal(confirmacoes, 1);
    liberar();
    assert.deepEqual(await respostas, [{ ok: true }, { ok: true }]);
    assert.deepEqual([...chamadas.values()], [2, 2]);
  } finally {
    remover();
    globalThis.fetch = original;
    globalThis.window = janela;
  }
});
test('cancelar a verificacao impede a repeticao da mutacao', async () => {
  const original = globalThis.fetch;
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    return json({ code: 'REAUTH_REQUIRED' }, 428);
  };
  const remover = registrarConfirmacao(async () => {
    throw new Error('Confirmacao cancelada');
  });
  try {
    await assert.rejects(() => request('/api/teste/cancelar', { method: 'DELETE' }), /cancelada/);
    assert.equal(chamadas, 1);
  } finally {
    remover();
    globalThis.fetch = original;
  }
});

test('retoma a ação após cadastrar autenticador e confirmar os dois fatores', async () => {
  const original = globalThis.fetch;
  const chamadas = { acao: 0, confirmacoes: 0 };
  globalThis.fetch = async () => {
    chamadas.acao++;
    return chamadas.acao < 3
      ? json(
          {
            code: 'REAUTH_REQUIRED',
            operation: {
              titulo: 'Aprovar cadastro de funcionário',
              descricao: 'Confirme sua senha e o código do aplicativo.',
              requireAuthenticator: true,
            },
          },
          428,
        )
      : json({ ok: true });
  };
  const remover = registrarConfirmacao(async (contexto) => {
    chamadas.confirmacoes++;
    assert.equal(contexto.requireAuthenticator, true);
  });
  try {
    assert.deepEqual(
      await request('/api/admin/security/employee-requests/1', { method: 'PATCH' }),
      {
        ok: true,
      },
    );
    assert.deepEqual(chamadas, { acao: 3, confirmacoes: 2 });
  } finally {
    remover();
    globalThis.fetch = original;
  }
});
test('o tempo de espera do servidor chega estruturado a interface', async () => {
  await assert.rejects(
    () =>
      lerResposta(
        json(
          { message: 'Aguarde antes de tentar.', code: 'REAUTH_WAIT', retryAfterSeconds: 300 },
          429,
        ),
      ),
    (erro) => {
      assert.ok(erro instanceof ErroRequisicaoApi);
      assert.equal(erro.esperaSegundos, 300);
      assert.equal(erro.codigo, 'REAUTH_WAIT');
      return true;
    },
  );
});
