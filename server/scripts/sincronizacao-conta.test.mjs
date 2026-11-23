import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarPreferenciasDaConta } from '../../client/src/services/carregarPreferenciasConta.ts';
import {
  iniciarSincronizacaoConta,
  sincronizarPreferenciasConta,
  enfileirarPreferenciaConta,
  suspenderSincronizacaoConta,
  estadoSincronizacao,
} from '../../client/src/services/sincronizacaoConta.ts';
import {
  normalizarLeitura,
  salvarPreferenciasLeitura,
  lerPreferenciasLeitura,
} from '../../client/src/services/preferenciasGlobais.ts';
import {
  padraoNotificacoes,
  salvarConfiguracaoNotificacoes,
  lerConfiguracaoNotificacoes,
} from '../../client/src/services/preferenciasNotificacoes.ts';
import {
  salvarInatividadeConta,
  minutosInatividade,
} from '../../client/src/services/configuracoesSistema.ts';
const PrimeiroTipo = '00000000-0000-4000-8000-000000000001',
  SegundoTipo = '00000000-0000-4000-8000-000000000002';
const memoria = new Map();
globalThis.localStorage = {
  getItem: (chaveAtual) => memoria.get(chaveAtual) || null,
  setItem: (chaveAtual, valorAtual) => memoria.set(chaveAtual, String(valorAtual)),
  clear: () => memoria.clear(),
};
globalThis.window = Object.assign(new EventTarget(), {
  setTimeout,
  clearTimeout,
});
const variaveis = new Map();
globalThis.document = {
  documentElement: {
    dataset: {},
    style: {
      setProperty: (chaveAtual, valorAtual) => variaveis.set(chaveAtual, valorAtual),
      getPropertyValue: (chaveAtual) => variaveis.get(chaveAtual) || '',
    },
  },
};
const nuvem = new Map();
let ativoLocal = PrimeiroTipo;
const conteudoConteudoConteudoJson = (corpo, situacao = 200) =>
  new Response(JSON.stringify(corpo), {
    status: situacao,
    headers: { 'Content-Type': 'application/json' },
  });
function servidor() {
  globalThis.fetch = async (url, inicializacao = {}) => {
    const caminho = String(url);
    if (!inicializacao.method || inicializacao.method === 'GET')
      return conteudoConteudoConteudoJson({
        conta: ativoLocal,
        leitura: null,
        notificacoes: null,
        seguranca: null,
        somVersao: null,
        ...nuvem.get(ativoLocal),
      });
    const dados = JSON.parse(inicializacao.body);
    assert.equal(dados.conta, ativoLocal);
    const secao = caminho.split('/').pop();
    nuvem.set(ativoLocal, { ...nuvem.get(ativoLocal), [secao]: dados.valor });
    return conteudoConteudoConteudoJson({ ok: true, conta: ativoLocal });
  };
}
test('a fresh computer restores reading, independent region sizes, sounds and inactivity from the same account', async () => {
  memoria.clear();
  servidor();
  await carregarPreferenciasDaConta(PrimeiroTipo);
  const preferencias = {
    ...normalizarLeitura(),
    tema: 'escuro',
    tamanhoTexto: 150,
    tamanhoMenu: 95,
    tamanhoCabecalho: 110,
    tamanhoModais: 125,
    tamanhoBotoes: 135,
    tamanhoFonte: 145,
    organizacao: {
      ...normalizarLeitura().organizacao,
      posicaoMenu: 'direita',
      barras: [
        {
          id: 'barra-teste',
          nome: 'Minha rotina',
          posicao: 'inferior',
          itens: [{ id: 'atalho-moto', atalho: 'nova-moto' }],
        },
      ],
      cartoes: { clientes: ['all', 'new'] },
    },
    painelPersonalizacao: { x: 35, y: 70 },
    elementos: { 'item-teste': { escala: 160, fonte: 175 } },
    substituicoes: { 'item-teste': 'nova-moto' },
    pesoTexto: 650,
    espacoLinhas: 17,
  };
  salvarPreferenciasLeitura(preferencias);
  const notificacao = padraoNotificacoes();
  notificacao.ativo = true;
  notificacao.toque = 'sino';
  notificacao.eventos.novo_cliente.som = true;
  salvarConfiguracaoNotificacoes(notificacao);
  salvarInatividadeConta(PrimeiroTipo, 60);
  await sincronizarPreferenciasConta();
  assert.equal(nuvem.get(PrimeiroTipo).leitura.tamanhoTexto, 150);
  assert.equal(nuvem.get(PrimeiroTipo).leitura.tamanhoBotoes, 135);
  suspenderSincronizacaoConta();
  memoria.clear();
  await carregarPreferenciasDaConta(PrimeiroTipo);
  assert.deepEqual(lerPreferenciasLeitura(), preferencias);
  assert.equal(variaveis.get('--app-content-scale'), '1.5');
  assert.equal(variaveis.get('--app-menu-scale'), '0.95');
  assert.equal(variaveis.get('--app-modal-scale'), '1.25');
  assert.equal(variaveis.get('--app-button-scale'), '1.35');
  assert.equal(lerConfiguracaoNotificacoes().toque, 'sino');
  assert.equal(lerConfiguracaoNotificacoes().eventos.novo_cliente.som, true);
  assert.equal(minutosInatividade(PrimeiroTipo), 60);
  await sincronizarPreferenciasConta();
  suspenderSincronizacaoConta();
});
test('another account does not inherit the previous account preferences or pending writes', async () => {
  ativoLocal = SegundoTipo;
  servidor();
  await carregarPreferenciasDaConta(SegundoTipo);
  assert.equal(lerPreferenciasLeitura().tema, 'claro');
  assert.equal(lerPreferenciasLeitura().tamanhoTexto, 110);
  assert.equal(lerPreferenciasLeitura().tamanhoBotoes, 100);
  assert.equal(lerPreferenciasLeitura().tamanhoFonte, 100);
  assert.deepEqual(lerPreferenciasLeitura().elementos, {});
  assert.deepEqual(lerPreferenciasLeitura().substituicoes, {});
  assert.equal(lerPreferenciasLeitura().organizacao.posicaoMenu, 'esquerda');
  assert.deepEqual(lerPreferenciasLeitura().organizacao.barras, []);
  assert.deepEqual(lerPreferenciasLeitura().painelPersonalizacao, { x: 100, y: 0 });
  assert.equal(lerConfiguracaoNotificacoes().ativo, false);
  await sincronizarPreferenciasConta();
  assert.equal(nuvem.get(PrimeiroTipo).leitura.tamanhoTexto, 150);
  assert.equal(nuvem.get(SegundoTipo).leitura.tamanhoTexto, 110);
  suspenderSincronizacaoConta();
});
test('a newer edit made while a request is pending is sent after the first response', async () => {
  ativoLocal = PrimeiroTipo;
  iniciarSincronizacaoConta(PrimeiroTipo);
  let liberarRecurso;
  const valores = [];
  globalThis.fetch = async (_Url, inicializacao) => {
    const dados = JSON.parse(inicializacao.body);
    valores.push(dados.valor.tamanhoTexto);
    if (valores.length === 1) await new Promise((resolver) => (liberarRecurso = resolver));
    return conteudoConteudoConteudoJson({ ok: true, conta: PrimeiroTipo });
  };
  enfileirarPreferenciaConta('leitura', {
    ...normalizarLeitura(),
    tamanhoTexto: 120,
  });
  const pendente = sincronizarPreferenciasConta();
  enfileirarPreferenciaConta('leitura', {
    ...normalizarLeitura(),
    tamanhoTexto: 145,
  });
  liberarRecurso();
  await pendente;
  assert.deepEqual(valores, [120, 145]);
  assert.equal(estadoSincronizacao().estado, 'salvo');
  suspenderSincronizacaoConta();
});
test('failed synchronization keeps the draft and only reports saved after a successful retry', async () => {
  iniciarSincronizacaoConta(PrimeiroTipo);
  globalThis.fetch = async () =>
    conteudoConteudoConteudoJson({ message: 'Conexão indisponível' }, 503);
  enfileirarPreferenciaConta('seguranca', { inatividade: 20 });
  await sincronizarPreferenciasConta();
  assert.equal(estadoSincronizacao().estado, 'erro');
  assert.match(localStorage.getItem(`estacao-conta-${PrimeiroTipo}-alteracoes-pendentes`), /20/);
  suspenderSincronizacaoConta();
  iniciarSincronizacaoConta(PrimeiroTipo);
  servidor();
  await sincronizarPreferenciasConta();
  assert.equal(nuvem.get(PrimeiroTipo).seguranca.inatividade, 20);
  assert.equal(estadoSincronizacao().estado, 'salvo');
  suspenderSincronizacaoConta();
});
