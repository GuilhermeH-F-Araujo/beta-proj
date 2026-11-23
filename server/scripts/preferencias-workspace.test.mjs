import test from 'node:test';
import assert from 'node:assert/strict';
import { organizacaoInterfaceSchema } from '../dist/preferenciasWorkspace.js';
import { leituraSchema } from '../dist/preferenciasConta.js';
import { atalhosInterface, fontesInterface, rotasMenu } from '../dist/shared/catalogoInterface.js';
const padrao = () => ({
  posicaoMenu: 'esquerda',
  ordemMenu: [...rotasMenu],
  cabecalho: [],
  barras: [],
  cartoes: {},
});
test('todos os atalhos registrados podem ser persistidos sem aceitar enderecos arbitrarios', () => {
  for (const atalho of atalhosInterface)
    assert.equal(
      organizacaoInterfaceSchema.safeParse({
        ...padrao(),
        cabecalho: [{ id: 'atalho-teste', atalho: atalho.id }],
      }).success,
      true,
      atalho.id,
    );
  for (const atalho of [
    'javascript:alert(1)',
    '/api/admin/users',
    'https://exemplo.invalid',
    'atalho-inexistente',
  ])
    assert.equal(
      organizacaoInterfaceSchema.safeParse({
        ...padrao(),
        cabecalho: [{ id: 'atalho-teste', atalho }],
      }).success,
      false,
    );
});
test('dez botoes e duas pesquisas sao validos, mas limites e posicoes invalidas sao rejeitados', () => {
  const cabecalho = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `botao-${i}`, atalho: 'nova-os' })),
    { id: 'busca-1', atalho: 'pesquisa-os' },
    { id: 'busca-2', atalho: 'pesquisa-clientes' },
  ];
  assert.equal(organizacaoInterfaceSchema.safeParse({ ...padrao(), cabecalho }).success, true);
  assert.equal(
    organizacaoInterfaceSchema.safeParse({ ...padrao(), posicaoMenu: 'livre' }).success,
    false,
  );
  assert.equal(
    organizacaoInterfaceSchema.safeParse({
      ...padrao(),
      cabecalho: Array.from({ length: 25 }, (_, i) => ({ id: `botao-${i}`, atalho: 'perfil' })),
    }).success,
    false,
  );
  assert.equal(
    organizacaoInterfaceSchema.safeParse({
      ...padrao(),
      barras: Array.from({ length: 7 }, (_, i) => ({
        id: `barra-${i}`,
        nome: 'Atalhos',
        posicao: 'inferior',
        itens: [],
      })),
    }).success,
    false,
  );
  assert.equal(
    organizacaoInterfaceSchema.safeParse({ ...padrao(), estilo: 'position:absolute' }).success,
    false,
  );
});
test('fontes compartilham o mesmo catalogo entre a API e a interface', () => {
  assert.equal(fontesInterface.length, 10);
  for (const fonte of fontesInterface)
    assert.ok(leituraSchema.shape.fonteInterface.safeParse(fonte.id).success);
  assert.equal(
    leituraSchema.shape.fonteInterface.safeParse('fonte-remota-injetada').success,
    false,
  );
});

test('substituicoes visuais aceitam apenas atalhos conhecidos e preservam contas antigas', () => {
  assert.equal(leituraSchema.shape.substituicoes.safeParse(undefined).success, true);
  for (const atalho of atalhosInterface)
    assert.equal(
      leituraSchema.shape.substituicoes.safeParse({ 'item-teste': atalho.id }).success,
      true,
    );
  for (const invalido of [
    { 'item-teste': 'javascript:alert(1)' },
    { '#botao': 'nova-os' },
    Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`item-${i}`, 'nova-os'])),
  ])
    assert.equal(leituraSchema.shape.substituicoes.safeParse(invalido).success, false);
});

test('configuracao antiga acomoda barras repetidas e libera acima e abaixo como alternativas do topo', async () => {
  const { normalizarEncaixes, encaixesLivres, ladoEncaixe } = await import(
    '../dist/shared/encaixesInterface.js'
  );
  const antigo = {
    ...padrao(),
    barras: [0, 1, 2, 3].map((i) => ({
      id: `barra-${i}`,
      nome: 'Minha barra',
      posicao: 'esquerda',
      itens: [{ id: `atalho-${i}`, atalho: 'nova-os' }],
    })),
  };
  const valor = normalizarEncaixes(antigo);
  assert.equal(
    new Set([valor.posicaoMenu, ...valor.barras.map((b) => ladoEncaixe(b.posicao))]).size,
    valor.barras.length + 1,
  );
  assert.equal(valor.barras.length, 3);
  assert.equal(valor.barras.flatMap((b) => b.itens).length + valor.cabecalho.length, 4);
  assert.deepEqual(normalizarEncaixes(valor), valor);
  assert.equal(encaixesLivres(valor).length, 0);
  const semTopo = {
    ...valor,
    barras: valor.barras.filter((b) => !b.posicao.startsWith('superior-')),
  };
  assert.ok(encaixesLivres(semTopo).includes('superior-antes'));
  assert.ok(encaixesLivres(semTopo).includes('superior-depois'));
  assert.equal(organizacaoInterfaceSchema.safeParse(antigo).success, true);
  assert.deepEqual(normalizarEncaixes(antigo), valor);
  assert.equal(leituraSchema.shape.tema.safeParse(undefined).success, true);
  assert.equal(leituraSchema.shape.tema.safeParse('escuro').success, true);
  assert.equal(leituraSchema.shape.tema.safeParse('injetado').success, false);
});
