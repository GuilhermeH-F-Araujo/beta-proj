import test from 'node:test';
import assert from 'node:assert/strict';
import { criarConsultaCep, normalizarEndereco } from '../src/cep.ts';
import {
  acoesAlteradas,
  dadosUnicos,
  rotasDadosCompartilhados,
} from '../src/dadosCompartilhados.ts';
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
test('catalogo identifica criacao, edicao e exclusao separadamente', () => {
  const anterior = {
    servicos: [
      { id: 'a', nome: 'A' },
      { id: 'b', nome: 'B' },
    ],
  };
  const atual = {
    servicos: [
      { id: 'a', nome: 'Alterado' },
      { id: 'c', nome: 'C' },
    ],
  };
  assert.deepEqual(acoesAlteradas(anterior, atual).sort(), ['criar', 'editar', 'excluir']);
  assert.deepEqual(acoesAlteradas(anterior, anterior), []);
});
test('catalogo rejeita identificadores duplicados e referencias sem categoria', () => {
  assert.equal(dadosUnicos({ categorias: [{ id: 'a' }, { id: 'a' }] }, 'catalogo'), false);
  assert.equal(
    dadosUnicos(
      { categorias: [{ id: 'a' }], servicos: [{ id: 's', categoriaId: 'b' }] },
      'catalogo',
    ),
    false,
  );
});
function resposta(acesso = { administrador: true }) {
  return {
    locals: { acesso, adminUserId: 'ator-teste' },
    statusCode: 200,
    body: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(dados) {
      this.body = dados;
      return this;
    },
  };
}
test('agendamento rejeita data invalida, horario invalido e propriedades extras antes do banco', async () => {
  const { rotasAgendamentos } = await import('../src/agendamentos.ts');
  const rota = rotasAgendamentos(async () => null).stack.find(
    (camada) => camada.route?.methods.post,
  );
  const entrada = {
    clienteId: 1,
    motoId: 2,
    mecanicoId: 3,
    servico: 'Revisão',
    status: 'Confirmado',
    data: '2026-11-11',
    hora: '09:30',
    duracao: '1h',
    observacoes: '',
  };
  for (const alteracao of [{ hora: '25:00' }, { data: '2026-02-30' }, { id_usuario: 'outro' }]) {
    const res = resposta();
    res.locals.agendamentosDb = {
      from() {
        assert.fail('Dados invalidos nao consultam o banco.');
      },
    };
    await rota.route.stack[0].handle({ body: { ...entrada, ...alteracao } }, res, assert.fail);
    assert.equal(res.statusCode, 400);
  }
});
const categoria = { id: 'a', nome: 'Geral', descricao: '', cor: '#123456', icone: 'wrench' };
const servico = {
  id: 's',
  nome: 'Revisão',
  categoria_id: 'a',
  descricao: 'Teste',
  preco: 10,
  custo: 0,
  duracao: '1h',
  ativo: true,
  icone: '',
  adicional: '',
};
const { categoria_id: categoriaId, ...camposServico } = servico;
const dados = { categorias: [categoria], servicos: [{ ...camposServico, categoriaId, preco: 20 }] };
function bancoCatalogo(concorrencia = false) {
  let chamadas = 0;
  const linhas = { categorias_servico: [categoria], servicos: [servico] };
  const db = {
    from(tabela) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        then(resolver) {
          return Promise.resolve({ data: linhas[tabela], error: null }).then(resolver);
        },
        async maybeSingle() {
          return { data: { versao: 2 }, error: null };
        },
      };
    },
    async rpc(nome, parametros) {
      chamadas++;
      assert.equal(nome, 'substituir_catalogo_servicos');
      assert.equal(parametros.p_versao, 2);
      assert.equal(parametros.p_actor, 'ator-teste');
      assert.deepEqual(parametros.p_categorias, [categoria]);
      assert.deepEqual(parametros.p_servicos, [{ ...servico, preco: 20 }]);
      return concorrencia ? { error: { code: '40001' } } : { data: 3, error: null };
    },
  };
  return { db, chamadas: () => chamadas };
}
async function salvarCatalogo(db, versao, acesso) {
  const res = resposta(acesso);
  const rota = rotasDadosCompartilhados(async () => db).stack.find(
    (camada) => camada.route?.methods.put,
  );
  await rota.route.stack[0].handle({ params: { chave: 'catalogo' }, body: { versao, dados } }, res);
  return res;
}
test('catalogo grava dados completos e devolve nova revisao', async () => {
  const estado = bancoCatalogo();
  const res = await salvarCatalogo(estado.db, 2);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { dados, versao: 3 });
  assert.equal(estado.chamadas(), 1);
});
test('catalogo rejeita revisao antiga ou conflito de gravacao', async () => {
  const estado = bancoCatalogo(true);
  assert.equal((await salvarCatalogo(estado.db, 1)).statusCode, 409);
  assert.equal(estado.chamadas(), 0);
  assert.equal((await salvarCatalogo(estado.db, 2)).statusCode, 409);
  assert.equal(estado.chamadas(), 1);
});
test('catalogo impede gravacao sem permissao e encerra sem banco quando nao autorizado', async () => {
  const estado = bancoCatalogo();
  const res = await salvarCatalogo(estado.db, 2, {
    administrador: false,
    permissoes: { servicos: { visualizar: true } },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(estado.chamadas(), 0);
  assert.equal((await salvarCatalogo(null, 2)).body, null);
});
