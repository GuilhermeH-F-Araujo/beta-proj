import test from 'node:test';
import assert from 'node:assert/strict';
import { pesquisarGeral, relevanciaPesquisa, rotasPesquisaGeral } from '../dist/pesquisaGeral.js';
import { permitirRequisicao } from '../dist/cargos.js';
const administrador = { administrador: true, cargo: 'Administrador', permissoes: {} };
function banco(tabelas = {}, falhas = []) {
  const chamadas = [];
  return {
    chamadas,
    from(tabela) {
      chamadas.push({ tabela });
      const registro = chamadas.at(-1);
      return {
        select(valor) {
          registro.select = valor;
          return this;
        },
        or(valor) {
          registro.or = valor;
          return this;
        },
        order() {
          return this;
        },
        limit(valor) {
          registro.limit = valor;
          return this;
        },
        is() {
          return this;
        },
        eq(_chave, valor) {
          registro.chave = valor;
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: tabelas[registro.chave] || null,
            error: falhas.includes(tabela) ? new Error('indisponivel') : null,
          });
        },
        then(resolver) {
          return Promise.resolve({
            data: tabelas[tabela] || [],
            error: falhas.includes(tabela) ? new Error('indisponivel') : null,
          }).then(resolver);
        },
      };
    },
  };
}
test('pesquisa considera acentos, trechos e um erro de digitacao sem retornar termos diferentes', () => {
  assert.equal(relevanciaPesquisa('joao', 'João da Silva'), 100);
  assert.equal(relevanciaPesquisa('Hnda', 'Honda'), 60);
  assert.equal(relevanciaPesquisa('Ana Silva', 'Ana Maria Silva'), 60);
  assert.equal(relevanciaPesquisa('Yamaha', 'Ana Maria Silva'), 0);
});
test('pesquisa nunca consulta modulos sem permissao e limita candidatos', async () => {
  const db = banco({ cliente: [{ id_cliente: 4, nome: 'João', telefone: '1199999999' }] });
  const acesso = {
    administrador: false,
    cargo: 'Atendimento',
    permissoes: { clientes: { visualizar: true } },
  };
  const resultado = await pesquisarGeral(db, acesso, 'joao');
  assert.ok(db.chamadas.every((item) => item.tabela === 'cliente'));
  assert.ok(db.chamadas.every((item) => item.limit <= 40));
  assert.equal(resultado.itens[0].rota, '/clientes/4');
  assert.equal(resultado.incompleta, false);
  assert.equal(permitirRequisicao(acesso, 'GET', '/api/admin/search?q=joao'), true);
  assert.equal(permitirRequisicao(acesso, 'POST', '/api/admin/search'), false);
});
test('pesquisa inclui OS, placas, funcionarios, servicos e agenda sem expor campos internos', async () => {
  const db = banco({
    ordem_servico: [{ id_os: 42, problema_relatado: 'Freio', status: 'aguardando' }],
    moto: [{ id_moto: 2, modelo: 'Freio moto', placa: 'ABC1234' }],
    funcionario: [{ id_funcionario: 3, nome: 'Freio', cargo: 'Mecânico' }],
    catalogo: { dados: { servicos: [{ id: 's1', nome: 'Freio novo', descricao: 'Troca' }] } },
    agenda: { dados: [{ id: 1, cliente: 'Ana', servico: 'Freio', data: '2026-11-18' }] },
  });
  const resultado = await pesquisarGeral(db, administrador, 'Freio');
  assert.deepEqual(
    new Set(resultado.itens.map((item) => item.tipo)),
    new Set(['Ordem de serviço', 'Motocicleta', 'Funcionário', 'Serviço', 'Agendamento']),
  );
  assert.ok(
    db.chamadas
      .find((item) => item.tabela === 'ordem_servico')
      .select.includes('problema_relatado'),
  );
  assert.ok(resultado.itens.every((item) => Object.keys(item).length === 6));
  assert.ok(resultado.itens.length <= 20);
});
test('falha parcial e declarada e erro total nao vira lista vazia', async () => {
  const db = banco({ cliente: [{ id_cliente: 1, nome: 'Ana' }] }, ['moto']);
  assert.equal((await pesquisarGeral(db, administrador, 'Ana')).incompleta, true);
  await assert.rejects(() =>
    pesquisarGeral(
      banco({}, ['cliente']),
      { ...administrador, administrador: false, permissoes: { clientes: { visualizar: true } } },
      'Ana',
    ),
  );
});
test('consulta invalida ou sem sessao nao consulta banco e caracteres nao viram filtros extras', async () => {
  let acessou = false;
  const router = rotasPesquisaGeral(async () => null);
  await router.stack[0].route.stack[0].handle(
    { query: { q: 'ana' } },
    {
      json() {
        acessou = true;
      },
    },
  );
  assert.equal(acessou, false);
  const db = banco();
  const acesso = {
    administrador: false,
    cargo: 'Atendimento',
    permissoes: { clientes: { visualizar: true } },
  };
  await pesquisarGeral(db, acesso, 'ana),id.eq.1');
  assert.ok(db.chamadas.every((item) => !/[()]/.test(item.or)));
  let status;
  const comBanco = rotasPesquisaGeral(async () => db);
  await comBanco.stack[0].route.stack[0].handle(
    { query: { q: 'a' } },
    {
      locals: { acesso },
      status(codigo) {
        status = codigo;
        return this;
      },
      json() {},
    },
  );
  assert.equal(status, 400);
});
