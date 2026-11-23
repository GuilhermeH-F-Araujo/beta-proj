import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotasPainel } from '../dist/painelAdmin.js';
test('painel lê OS em lotes de500, monta fila de6 e preserva id do mecânico', async () => {
  const ordens = Array.from({ length: 501 }, (_, indice) => ({
    id_os: indice + 1,
    id_moto: 1,
    id_mecanico: 2,
    status: indice % 2 ? 'entregue' : 'aguardando',
    data_entrada: '2026-11-01T10:00:00',
    data_saida: null,
    previsao_entrega: null,
  }));
  const tabelas = {
    ordem_servico: ordens,
    funcionario: [{ id_funcionario: 2, nome: 'Ana', cargo: 'Mecânico' }],
    moto: [{ id_moto: 1, id_cliente: 3, modelo: 'Honda', placa: 'ABC1234' }],
    cliente: [{ id_cliente: 3, nome: 'Cliente', telefone: null }],
  };
  const chamadas = [];
  const db = {
    from(tabela) {
      chamadas.push(tabela);
      return {
        select() {
          return this;
        },
        order() {
          return this;
        },
        range(primeiroElemento, segundoElemento) {
          return Promise.resolve({
            data: tabelas[tabela].slice(primeiroElemento, segundoElemento + 1),
            error: null,
          });
        },
        in(chave, ids) {
          return Promise.resolve({
            data: tabelas[tabela].filter((linha) => ids.includes(linha[chave])),
            error: null,
          });
        },
      };
    },
  };
  let resultado;
  const roteador = rotasPainel(async () => db);
  await roteador.stack[0].route.stack[0].handle(
    {},
    {
      setHeader() {},
      json(dados) {
        resultado = dados;
      },
    },
    (erro) => {
      throw erro;
    },
  );
  assert.equal(resultado.orders.length, 501);
  assert.equal(resultado.oldest.length, 6);
  assert.equal(resultado.orders[0].mechanicId, 2);
  assert.equal(resultado.oldest[0].client, 'Cliente');
  assert.equal(resultado.counts.aguardando, 251);
  assert.equal(chamadas.filter((instanteAtual) => instanteAtual === 'ordem_servico').length, 2);
  assert.ok(!chamadas.includes('pagamento_os'));
});
test('não consulta dados sem autorização', async () => {
  let enviado = false;
  const roteador = rotasPainel(async () => null);
  await roteador.stack[0].route.stack[0].handle(
    {},
    {
      json() {
        enviado = true;
      },
    },
    (eventoRecebido) => {
      throw eventoRecebido;
    },
  );
  assert.equal(enviado, false);
});
