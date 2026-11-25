import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { eventosNotificacao } from '../dist/shared/catalogoNotificacoes.js';
import {
  leituraSchema,
  notificacoesSchema,
  segurancaSchema,
  somSchema,
} from '../dist/preferenciasConta.js';
import {
  entradaSchema,
  recuperacaoSchema,
  novaSenhaSchema,
} from '../dist/validators/autenticacao.js';
import {
  criarOrdemSchema,
  motocicletaSchema,
  cadastrarFuncionarioSchema,
  corrigirOrdemSchema,
} from '../dist/validators/atendimento.js';

const caminho = new URL('../openapi.json', import.meta.url);
const contrato = JSON.parse(await readFile(caminho, 'utf8'));
const esquemas = {
  Leitura: leituraSchema,
  Notificacoes: notificacoesSchema,
  Seguranca: segurancaSchema,
  SomPersonalizado: somSchema,
  Entrada: entradaSchema,
  RecuperacaoSenha: recuperacaoSchema,
  NovaSenha: novaSenhaSchema,
  CriarOrdem: criarOrdemSchema,
  CadastrarUsuario: cadastrarFuncionarioSchema,
  MotocicletaEntrada: motocicletaSchema,
  CorrigirOrdem: corrigirOrdemSchema,
};
for (const [nome, esquema] of Object.entries(esquemas)) {
  // Limites simples acompanham os validadores; regras entre campos ficam no servidor.
  const dados = z.toJSONSchema(esquema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
  });
  delete dados.$schema;
  contrato.components.schemas[nome] = dados;
}
const entradas = {
  'post /api/auth/login': 'Entrada',
  'post /api/auth/forgot-password': 'RecuperacaoSenha',
  'post /api/auth/reset-password': 'NovaSenha',
  'post /api/orders': 'CriarOrdem',
  'post /api/admin/users': 'CadastrarUsuario',
  'post /api/motorcycles': 'MotocicletaEntrada',
  'patch /api/motorcycles/{id}': 'MotocicletaEntrada',
  'put /api/orders/{id}/actions': 'CorrigirOrdem',
};
for (const [operacao, nome] of Object.entries(entradas)) {
  const [metodo, rota] = operacao.split(' ');
  contrato.paths[rota][metodo].requestBody.content['application/json'].schema = {
    $ref: '#/components/schemas/' + nome,
  };
}
const preferencias = contrato.paths['/api/admin/preferences/{secao}'].put;
preferencias.parameters.find((parametro) => parametro.name === 'secao').schema.enum = [
  'leitura',
  'notificacoes',
  'seguranca',
  'som',
];
preferencias.requestBody.content['application/json'].schema.properties.valor = {
  description:
    'Formato correspondente a secao da URL. Som aceita null para remover o audio. O WAV precisa ter entre 0,25 e 8 segundos e no maximo 1,5 MB.',
  anyOf: ['Leitura', 'Notificacoes', 'Seguranca', 'SomPersonalizado'].map((nome) => ({
    $ref: '#/components/schemas/' + nome,
  })),
  nullable: true,
};
contrato.components.schemas.NotificacaoAdministrador.properties.kind.enum = eventosNotificacao.map(
  ({ id }) => id,
);
await writeFile(caminho, JSON.stringify(contrato, null, 2) + '\n');
console.log('Validadores sincronizados com a documentacao.');
