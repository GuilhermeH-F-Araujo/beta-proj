import test from 'node:test';
import assert from 'node:assert/strict';
import { criarConsultaCep, normalizarEndereco } from '../src/cep.ts';
import { acoesAlteradas, dadosUnicos, schemasCompartilhados } from '../src/dadosCompartilhados.ts';
const response = (dadosLocal, situacao = 200) =>
  new Response(JSON.stringify(dadosLocal), {
    status: situacao,
    headers: { 'Content-Type': 'application/json' },
  });
const endereco = { logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP' };
test('CEP: rejects malformed input before requesting any service', async () => {
  let chamadas = 0;
  const obter = criarConsultaCep(async () => {
    chamadas++;
    return response(endereco);
  }, {});
  for (const itemAtual of ['123', '123456789', '12<script>', '1234abcd5678'])
    await assert.rejects(() => obter(itemAtual));
  assert.equal(chamadas, 0);
});
test('CEP: unconfigured Correios uses explicit ViaCEP fallback and caches valid result', async () => {
  let chamadas = 0;
  const obter = criarConsultaCep(async (url) => {
    chamadas++;
    assert.equal(url, 'https://viacep.com.br/ws/01001000/json/');
    return response(endereco);
  }, {});
  assert.equal((await obter('01001-000')).fonte, 'viacep');
  assert.equal((await obter('01001000')).rua, 'Praça da Sé');
  assert.equal(chamadas, 1);
});
test('CEP: actual Correios request keeps token in the server and accepts incomplete street', async () => {
  const obter = criarConsultaCep(
    async (url, inicializacao) => {
      assert.equal(url, 'https://api.correios.com.br/cep/v2/enderecos/01001000');
      assert.equal(inicializacao.headers.Authorization, 'Bearer secret');
      return response({ ...endereco, logradouro: '' });
    },
    { CORREIOS_TOKEN: 'secret' },
  );
  const resultado = await obter('01001000');
  assert.equal(resultado.fonte, 'correios');
  assert.equal(resultado.rua, '');
  assert.equal(JSON.stringify(resultado).includes('secret'), false);
});
test('CEP: contract credentials obtain token once and never appear in result', async () => {
  let chamadas = 0;
  const obter = criarConsultaCep(
    async (url, inicializacao) => {
      chamadas++;
      if (url.includes('/token/')) {
        assert.deepEqual(JSON.parse(inicializacao.body), { numero: 'contrato' });
        return response({
          token: 'token-secreto',
          expiraEm: new Date(Date.now() + 3600000).toISOString(),
        });
      }
      return response(endereco);
    },
    {
      CORREIOS_USUARIO: 'usuario',
      CORREIOS_CODIGO_ACESSO: 'codigo',
      CORREIOS_CONTRATO: 'contrato',
    },
  );
  await obter('01001000');
  await obter('01001001');
  assert.equal(chamadas, 3);
});
test('CEP: non-existent code returns 404, and provider failure never makes up an address', async () => {
  const notEncontrado = criarConsultaCep(async () => response({ erro: true }), {});
  await assert.rejects(
    () => notEncontrado('99999999'),
    (eventoRecebido) => eventoRecebido.situacao === 404,
  );
  const indisponivel = criarConsultaCep(
    async () => {
      throw new Error('network');
    },
    { CEP_PERMITIR_VIACEP: 'false' },
  );
  await assert.rejects(
    () => indisponivel('01001000'),
    (eventoRecebido) => eventoRecebido.situacao === 503,
  );
});
test('CEP: in-flight same-code requests coalesce and an unavailable provider can be retried', async () => {
  let chamadas = 0;
  const obter = criarConsultaCep(async () => {
    chamadas++;
    await new Promise((resultadoAtual) => setTimeout(resultadoAtual, 10));
    return response(endereco);
  }, {});
  await Promise.all([obter('01001000'), obter('01001000')]);
  assert.equal(chamadas, 1);
});
test('CEP: invalid provider response is rejected', () => {
  assert.throws(() => normalizarEndereco({ uf: 'XX' }, '01001000', 'viacep'));
});
test('shared data: separate creation, update and deletion permissions', () => {
  const anterior = [
    { id: 1, x: 'a' },
    { id: 2, x: 'b' },
  ];
  assert.deepEqual(
    acoesAlteradas(
      anterior,
      [
        { id: 1, x: 'z' },
        { id: 3, x: 'c' },
      ],
      'agenda',
    ).sort(),
    ['criar', 'editar', 'excluir'],
  );
  assert.deepEqual(acoesAlteradas(anterior, anterior, 'agenda'), []);
});
test('shared data: rejects duplicate ids and orphaned service categories', () => {
  assert.equal(dadosUnicos([{ id: 1 }, { id: 1 }], 'agenda'), false);
  assert.equal(
    dadosUnicos(
      { categorias: [{ id: 'a' }], servicos: [{ id: 'x', categoriaId: 'b' }] },
      'catalogo',
    ),
    false,
  );
});
test('agenda schema: rejects invalid date, time and injected properties', () => {
  const entrada = {
    id: 1,
    cliente: 'Cliente',
    telefone: '',
    moto: 'Moto',
    placa: 'ABC1234',
    servico: 'Revisão',
    status: 'Confirmado',
    data: '2026-11-11',
    hora: '09:30',
    mecanico: 'Mecânico',
    duracao: '1h',
    observacoes: '',
  };
  assert.equal(schemasCompartilhados.agenda.safeParse([entrada]).success, true);
  for (const adicional of [{ hora: '25:00' }, { data: '2026-02-30' }, { id_usuario: 'outro' }])
    assert.equal(
      schemasCompartilhados.agenda.safeParse([{ ...entrada, ...adicional }]).success,
      false,
    );
});
const { rotasDadosCompartilhados } = await import('../src/dadosCompartilhados.ts');
function simuladoBanco(inicial, { race: concorrencia = false } = {}) {
  let linha = inicial ? structuredClone(inicial) : null;
  let operacoes = 0;
  const db = {
    from() {
      let acao = 'read',
        conteudoEnviado,
        esperado;
      const consulta = {
        select() {
          return consulta;
        },
        eq(chaveLocal, valor) {
          if (chaveLocal === 'versao') esperado = valor;
          return consulta;
        },
        update(dadosLocal) {
          acao = 'update';
          conteudoEnviado = dadosLocal;
          return consulta;
        },
        insert(dadosLocal) {
          acao = 'insert';
          conteudoEnviado = dadosLocal;
          return consulta;
        },
        async maybeSingle() {
          if (acao === 'read') return { data: linha ? structuredClone(linha) : null, error: null };
          operacoes++;
          if (acao === 'update' && (concorrencia || linha?.versao !== esperado))
            return { data: null, error: null };
          if (acao === 'insert' && linha) return { data: null, error: { code: '23505' } };
          linha = structuredClone(conteudoEnviado);
          return { data: { versao: linha.versao }, error: null };
        },
      };
      return consulta;
    },
  };
  return { db: db, getRow: () => linha, operations: () => operacoes };
}
function simuladoResposta(acesso = { administrador: true }) {
  return {
    locals: { acesso },
    statusCode: 200,
    body: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(dadosLocal) {
      this.body = dadosLocal;
      return this;
    },
    setHeader() {},
  };
}
async function callCompartilhado(metodo, db, entrada, acesso) {
  const roteador = rotasDadosCompartilhados(async () => db);
  const camada = roteador.stack.find((camada) => camada.route?.methods[metodo]);
  const res = simuladoResposta(acesso);
  await camada.route.stack[0].handle({ params: { chave: 'agenda' }, body: entrada }, res);
  return res;
}
const agendamento = {
  id: 123,
  cliente: 'Cliente real',
  telefone: '',
  moto: 'Moto',
  placa: 'ABC1234',
  servico: 'Revisão',
  status: 'Confirmado',
  data: '2026-11-11',
  hora: '09:00',
  mecanico: 'Mecânico',
  duracao: '1h',
  observacoes: '',
};
test('shared route: confirmed save increments revision and preserves full records', async () => {
  const estado = simuladoBanco({ dados: [agendamento], versao: 1 });
  const res = await callCompartilhado('put', estado.db, {
    versao: 1,
    dados: [{ ...agendamento, hora: '10:00' }],
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.versao, 2);
  assert.equal(estado.getRow().dados[0].hora, '10:00');
});
test('shared route: stale revision and concurrent writes reject overwrite with 409', async () => {
  for (const concorrencia of [false, true]) {
    const estado = simuladoBanco({ dados: [agendamento], versao: 2 }, { race: concorrencia });
    const res = await callCompartilhado('put', estado.db, {
      versao: concorrencia ? 2 : 1,
      dados: [{ ...agendamento, hora: '11:00' }],
    });
    assert.equal(res.statusCode, 409);
    assert.equal(estado.getRow().dados[0].hora, '09:00');
  }
});
test('shared route: read-only role cannot change records and unauthenticated request never reads', async () => {
  const estado = simuladoBanco({ dados: [agendamento], versao: 1 });
  const res = await callCompartilhado(
    'put',
    estado.db,
    { versao: 1, dados: [] },
    { administrador: false, permissoes: { agendamentos: { visualizar: true } } },
  );
  assert.equal(res.statusCode, 403);
  assert.equal(estado.operations(), 0);
  const roteador = rotasDadosCompartilhados(async () => null);
  const response = simuladoResposta();
  await roteador.stack
    .find((linhaAtual) => linhaAtual.route.methods.get)
    .route.stack[0].handle({ params: { chave: 'agenda' } }, response);
  assert.equal(response.body, null);
});
