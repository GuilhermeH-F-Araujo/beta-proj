import testar from 'node:test';
import verificar from 'node:assert/strict';
import { limitarRequisicoes } from '../dist/auth/limiteRequisicoes.js';

testar('limite separa ips, ignora preflight e informa tempo de espera', () => {
  const limitar = limitarRequisicoes(2, 60_000);
  const chamar = (ip, method = 'POST') => {
    let status = 200;
    const cabecalhos = {};
    const res = {
      setHeader(nome, valor) {
        cabecalhos[nome] = valor;
      },
      status(codigo) {
        status = codigo;
        return this;
      },
      json() {},
    };
    limitar({ ip, method }, res, () => {});
    return { status, cabecalhos };
  };
  verificar.equal(chamar('192.0.2.1', 'OPTIONS').status, 200);
  verificar.equal(chamar('192.0.2.1').status, 200);
  verificar.equal(chamar('192.0.2.1').status, 200);
  const bloqueada = chamar('192.0.2.1');
  verificar.equal(bloqueada.status, 429);
  verificar.ok(Number(bloqueada.cabecalhos['Retry-After']) > 0);
  verificar.equal(chamar('192.0.2.2').status, 200);
});
