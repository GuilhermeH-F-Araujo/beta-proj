import test from 'node:test';
import assert from 'node:assert/strict';
import { rotasPreferenciasConta, validarSomConta } from '../dist/preferenciasConta.js';
const PrimeiroTipo = '00000000-0000-4000-8000-000000000001',
  SegundoTipo = '00000000-0000-4000-8000-000000000002';
const response = () => ({
  locals: { adminUserId: PrimeiroTipo },
  statusCode: 200,
  status(codigo) {
    this.statusCode = codigo;
    return this;
  },
  json(corpo) {
    this.body = corpo;
    return this;
  },
});
const tratarAcao = (roteador, caminho, metodo) =>
  roteador.stack.find((camada) => camada.route?.path === caminho && camada.route.methods[metodo])
    .route.stack[0].handle;
function mockBanco() {
  const chamadas = [];
  return {
    calls: chamadas,
    from(tabela) {
      const consulta = {
        select(colunas) {
          chamadas.push({ table: tabela, columns: colunas });
          return consulta;
        },
        eq(coluna, valorLocal) {
          chamadas.push({ column: coluna, value: valorLocal });
          return consulta;
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
        async single() {
          return {
            data: {
              atualizado_em: '2026-11-07T23:00:00Z',
              som_atualizado_em: null,
            },
            error: null,
          };
        },
      };
      return consulta;
    },
    async rpc(nome, entrada) {
      chamadas.push({ name: nome, input: entrada });
      return { error: null };
    },
  };
}
const leitura = {
  tamanhoTexto: 140,
  tamanhoMenu: 100,
  tamanhoCabecalho: 100,
  tamanhoModais: 120,
  pesoTexto: 600,
  espacoLinhas: 16,
  contraste: false,
  reduzirMovimento: true,
  densidade: 'confortavel',
  periodoDashboard: 'semanal',
};
test('preferences endpoint refuses access before reading private data', async () => {
  const db = mockBanco();
  const res = response();
  await tratarAcao(
    rotasPreferenciasConta(async (_req, res) => {
      res.status(403).json({ message: 'Negado' });
      return null;
    }),
    '/',
    'get',
  )({ query: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(db.calls, []);
});
test('reads are always restricted to the session account, ignoring an injected owner', async () => {
  const db = mockBanco(),
    res = response();
  await tratarAcao(
    rotasPreferenciasConta(async () => db),
    '/',
    'get',
  )({ query: { conta: SegundoTipo } }, res);
  assert.ok(
    db.calls.some(
      (elementoAtual) =>
        elementoAtual.column === 'id_usuario' && elementoAtual.value === PrimeiroTipo,
    ),
  );
  assert.equal(res.body.conta, PrimeiroTipo);
  assert.equal(res.body.leitura, null);
});
test('a write for another account is rejected without calling the database RPC', async () => {
  const db = mockBanco(),
    res = response();
  await tratarAcao(
    rotasPreferenciasConta(async () => db),
    '/:secao',
    'put',
  )({ params: { secao: 'leitura' }, body: { conta: SegundoTipo, valor: leitura } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(
    db.calls.some((elementoAtual) => elementoAtual.name),
    false,
  );
});
test('valid settings use the session owner and preserve section boundaries', async () => {
  const db = mockBanco(),
    res = response();
  await tratarAcao(
    rotasPreferenciasConta(async () => db),
    '/:secao',
    'put',
  )({ params: { secao: 'leitura' }, body: { conta: PrimeiroTipo, valor: leitura } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(db.calls.find((elementoAtual) => elementoAtual.name).input, {
    p_usuario: PrimeiroTipo,
    p_secao: 'leitura',
    p_valor: {
      ...leitura,
      tamanhoBotoes: 100,
      tamanhoFonte: 100,
      tamanhoCampos: 100,
      tamanhoIcones: 100,
      areaClique: 40,
      fonteInterface: 'sistema',
      espacoLetras: 0,
      destacarFoco: true,
      sublinharLinks: false,
      elementos: {},
    },
  });
});
test('tamanho dos botoes e salvo na conta sem exigir um campo novo dos clientes antigos', async () => {
  for (const tamanhoBotoes of [80, 125, 150]) {
    const db = mockBanco();
    const res = response();
    await tratarAcao(
      rotasPreferenciasConta(async () => db),
      '/:secao',
      'put',
    )(
      {
        params: { secao: 'leitura' },
        body: { conta: PrimeiroTipo, valor: { ...leitura, tamanhoBotoes } },
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(
      db.calls.find((chamada) => chamada.name).input.p_valor.tamanhoBotoes,
      tamanhoBotoes,
    );
  }
});
test('settings reject unsafe scale values, unexpected keys and invalid sections', async () => {
  for (const [secaoLocal, valorLocal] of [
    ['leitura', { ...leitura, tamanhoMenu: 500 }],
    ['leitura', { ...leitura, tamanhoBotoes: 79 }],
    ['leitura', { ...leitura, tamanhoBotoes: 151 }],
    ['leitura', { ...leitura, tamanhoBotoes: '125' }],
    ['leitura', { ...leitura, id_usuario: SegundoTipo }],
    ['seguranca', { inatividade: 999 }],
    ['unknown', {}],
  ]) {
    const db = mockBanco(),
      res = response();
    await tratarAcao(
      rotasPreferenciasConta(async () => db),
      '/:secao',
      'put',
    )({ params: { secao: secaoLocal }, body: { conta: PrimeiroTipo, valor: valorLocal } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(
      db.calls.some((elementoAtual) => elementoAtual.name),
      false,
    );
  }
});
function wav(segundos = 1) {
  const taxa = 8000;
  const dados = Buffer.alloc(44 + Math.floor(segundos * taxa) * 2);
  dados.write('RIFF');
  dados.writeUInt32LE(dados.length - 8, 4);
  dados.write('WAVE', 8);
  dados.write('fmt ', 12);
  dados.writeUInt32LE(16, 16);
  dados.writeUInt16LE(1, 20);
  dados.writeUInt16LE(1, 22);
  dados.writeUInt32LE(taxa, 24);
  dados.writeUInt32LE(taxa * 2, 28);
  dados.writeUInt16LE(2, 32);
  dados.writeUInt16LE(16, 34);
  dados.write('data', 36);
  dados.writeUInt32LE(dados.length - 44, 40);
  return dados;
}
test('cloud audio verifies the real WAV header and computes duration on the server', () => {
  const bytes = wav();
  const resultado = validarSomConta({
    name: 'som.wav',
    base64: bytes.toString('base64'),
  });
  assert.equal(resultado.duration, 1);
  assert.equal(resultado.size, bytes.length);
  assert.equal(resultado.mimeType, 'audio/wav');
  for (const invalido of [
    Buffer.from('<script>code</script>'),
    wav(9),
    Buffer.concat([wav(), Buffer.from('metadata')]),
  ])
    assert.throws(() => validarSomConta({ name: 'fake.wav', base64: invalido.toString('base64') }));
  const invalido = wav();
  invalido.writeUInt16LE(3, 20);
  assert.throws(() => validarSomConta({ name: 'codec.wav', base64: invalido.toString('base64') }));
});

test('ajustes individuais validam limites e nao aceitam seletores arbitrarios', async () => {
  const { leituraSchema } = await import('../dist/preferenciasConta.js');
  const resultado = leituraSchema.parse({
    ...leitura,
    elementos: { 'item-ab12': { escala: 180, fonte: 160 } },
  });
  assert.deepEqual(resultado.elementos, { 'item-ab12': { escala: 180, fonte: 160 } });
  for (const elementos of [
    { body: { escala: 100, fonte: 100 } },
    { 'item-ab12': { escala: 201, fonte: 100 } },
    { 'item-ab12': { escala: 100, fonte: 89 } },
    { 'item-ab12': { escala: 100, fonte: 100, css: 'color:red' } },
  ])
    assert.equal(leituraSchema.safeParse({ ...leitura, elementos }).success, false);
});
