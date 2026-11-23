import test from 'node:test';
import assert from 'node:assert/strict';
import { setAcessoConta } from '../../client/src/services/acessoConta.ts';
import {
  lerCatalogoServicos,
  salvarCatalogoServicos,
} from '../../client/src/services/catalogoServicos.ts';
const dadosLocal = new Map();
global.localStorage = {
  getItem: (chaveAtual) => dadosLocal.get(chaveAtual) ?? null,
  setItem: (chaveAtual, valorAtual) => dadosLocal.set(chaveAtual, valorAtual),
};
global.window = { dispatchEvent() {} };
global.CustomEvent = class {};
let revisao = 0;
global.fetch = async (_Url, inicializacao = {}) => {
  const entrada = inicializacao.method === 'PUT' ? JSON.parse(inicializacao.body) : null;
  if (entrada) revisao++;
  return new Response(JSON.stringify({ dados: entrada?.dados ?? null, versao: revisao }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

test('local catalog checks separate create edit delete permissions before persistence', async () => {
  setAcessoConta({
    administrador: false,
    cargo: 'Consulta',
    permissoes: { servicos: { visualizar: true } },
  });
  const base = lerCatalogoServicos(),
    adicionar = structuredClone(base);
  adicionar.servicos.push({ ...base.servicos[0], id: 'new-test' });
  await assert.rejects(() => salvarCatalogoServicos(adicionar), /não permite/);
  assert.equal(dadosLocal.size, 0);
  setAcessoConta({
    administrador: false,
    cargo: 'Criar',
    permissoes: { servicos: { visualizar: true, criar: true } },
  });
  await salvarCatalogoServicos(adicionar);
  const editar = structuredClone(adicionar);
  editar.servicos[0].nome = 'Outra descrição';
  await assert.rejects(() => salvarCatalogoServicos(editar), /não permite/);
  const remover = structuredClone(adicionar);
  remover.servicos.pop();
  await assert.rejects(() => salvarCatalogoServicos(remover), /não permite/);
  setAcessoConta({
    administrador: true,
    cargo: 'Administrador',
    permissoes: {},
  });
  await salvarCatalogoServicos(base);
});
