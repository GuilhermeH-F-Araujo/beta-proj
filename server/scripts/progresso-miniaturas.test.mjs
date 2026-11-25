import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { criarProgressoMiniatura } from '../src/miniaturas/progresso.ts';
import { cancelarEnvios, envioValido, hashToken } from '../src/miniaturas/repositorio.ts';

test('progresso registra etapas, duracao, correcao solicitada e compatibilidade legada', () => {
  let instante = Date.parse('2026-11-24T12:00:00Z');
  const progresso = criarProgressoMiniatura(undefined, 2, () => instante);
  const primeira = progresso.registrar('pesquisa', 'Preparando pesquisa');
  instante += 2500;
  const segunda = progresso.registrar(
    'geracao',
    'Gerando miniatura',
    'Correção solicitada: preservar a pintura.',
  );
  instante += 4000;
  const final = progresso.registrar('revisao', 'Pronta para conferir', 'Candidata salva.', true);
  assert.equal(primeira[0].concluido_em, undefined, 'snapshots anteriores nao sao mutados');
  assert.equal(segunda[0].duracao_ms, 2500);
  assert.equal(final[1].duracao_ms, 4000);
  assert.equal(final[2].duracao_ms, 0);
  assert.equal(final[1].tentativa, 2);
  assert.match(final[1].detalhes, /Correção solicitada/);
  const retomado = criarProgressoMiniatura(final, 3, () => instante);
  assert.equal(retomado.registrar('pesquisa', 'Nova tentativa').length, 4);
  assert.equal(criarProgressoMiniatura(null).registrar('pesquisa', 'Registro novo').length, 1);
  for (let n = 0; n < 130; n++) retomado.registrar('etapa', 'Etapa real');
  assert.equal(retomado.registrar('revisao', 'Pronta', '', true).length, 120);
});

test('cancelar link envia PATCH filtrado e impede que o token seja validado novamente', async () => {
  const pedidoId = 'a491521e-04b6-490f-a8eb-70ebd39fb2fa';
  const token = 'r'.repeat(43);
  let cancelado = false,
    expira = new Date(Date.now() + 1200000).toISOString(),
    falhar = false;
  const chamadas = [];
  const db = createClient('https://teste.supabase.co', 'chave-publica-simulada', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, opcoes = {}) => {
        const url = new URL(input);
        chamadas.push({ url, opcoes });
        assert.equal(url.pathname, '/rest/v1/miniatura_envios');
        if (opcoes.method === 'PATCH') {
          assert.equal(url.searchParams.get('pedido_id'), `eq.${pedidoId}`);
          if (falhar)
            return Response.json(
              { message: 'Falha simulada no banco', code: 'TESTE' },
              { status: 500 },
            );
          const corpo = JSON.parse(opcoes.body);
          cancelado = corpo.cancelado;
          expira = corpo.expira_em;
          return new Response(null, { status: 204 });
        }
        assert.equal(url.searchParams.get('token_hash'), `eq.${hashToken(token)}`);
        assert.equal(url.searchParams.get('cancelado'), 'eq.false');
        const valido = !cancelado && Date.parse(expira) > Date.now();
        return Response.json(valido ? [{ id: 'envio', pedido_id: pedidoId }] : []);
      },
    },
  });
  assert.ok(await envioValido(db, token));
  await cancelarEnvios(db, pedidoId);
  assert.equal(cancelado, true);
  assert.ok(Date.parse(expira) <= Date.now());
  assert.equal(await envioValido(db, token), null);
  await cancelarEnvios(db, pedidoId);
  falhar = true;
  await assert.rejects(
    cancelarEnvios(db, pedidoId),
    (erro) => erro.message === 'Falha simulada no banco',
  );
  assert.ok(chamadas.length >= 5);
});
