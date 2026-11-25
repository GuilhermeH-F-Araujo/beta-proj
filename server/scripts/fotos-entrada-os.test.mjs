import test from 'node:test';
import assert from 'node:assert/strict';

process.env.URL_SUPABASE ??= 'https://exemplo.supabase.co';
process.env.CHAVE_PUBLICA_SUPABASE ??= 'chave-publica-teste';

const { carregarFotosEntrada } = await import('../src/routes/ordens.ts');

function bancoSimulado(...respostas) {
  const consultas = [];
  const db = {
    from(tabela) {
      assert.equal(tabela, 'foto_os');
      return this;
    },
    select(colunas) {
      consultas.push(colunas);
      return this;
    },
    eq(campo, valor) {
      assert.equal(valor, campo === 'id_os' ? 42 : 'entrada');
      return this;
    },
    async order(campo) {
      assert.equal(campo, 'data_registro');
      assert.ok(respostas.length, 'Consulta inesperada');
      return respostas.shift();
    },
  };
  return { db, consultas };
}

const foto = { id_foto: 1, url: 'https://exemplo.invalid/foto.jpg', data_registro: '2026-11-24' };

test('preserva as posicoes e evita consulta extra no banco atualizado', async () => {
  const { db, consultas } = bancoSimulado({ data: [{ ...foto, posicao: 'rear' }], error: null });
  const resultado = await carregarFotosEntrada(db, 42);
  assert.equal(resultado.data[0].posicao, 'rear');
  assert.equal(consultas.length, 1);
});

test('detalhe da OS consegue ler fotos quando a coluna nova ainda nao existe', async () => {
  const { db, consultas } = bancoSimulado(
    { data: null, error: { code: '42703', message: 'column foto_os.posicao does not exist' } },
    { data: [foto], error: null },
  );
  assert.deepEqual(await carregarFotosEntrada(db, 42), {
    data: [{ ...foto, posicao: null }],
    error: null,
  });
  assert.match(consultas[0], /posicao/);
  assert.doesNotMatch(consultas[1], /posicao/);
});

test('consulta de fotos preserva falha geral de acesso ao banco', async () => {
  const error = { code: '57014', message: 'statement timeout' };
  const { db, consultas } = bancoSimulado({ data: null, error });
  assert.deepEqual(await carregarFotosEntrada(db, 42), { data: null, error });
  assert.equal(consultas.length, 1);
});
