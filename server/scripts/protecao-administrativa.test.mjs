import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exigeConfirmacao,
  nivelConfirmacao,
  podeGerenciarAdministrador,
} from '../dist/auth/politicaAdministrativa.js';
process.env.URL_SUPABASE ??= 'https://exemplo.supabase.co';
process.env.CHAVE_PUBLICA_SUPABASE ??= 'chave-publica-teste';
const { protegerOperacao, idSessaoVerificada } = await import('../dist/auth/confirmacao.js');
const { lerAcesso } = await import('../dist/cargos.js');

test('a hierarquia protege pares e o dono, inclusive contra si proprio', () => {
  for (const [autor, alvo, permitido] of [
    ['administrador', 'administrador', false],
    ['administrador', 'superadministrador', false],
    ['superadministrador', 'administrador', true],
    ['superadministrador', 'superadministrador', false],
    ['superadministrador', 'dono', false],
    ['dono', 'superadministrador', true],
    ['dono', 'dono', false],
  ])
    assert.equal(podeGerenciarAdministrador(autor, alvo), permitido, autor + ' -> ' + alvo);
});

test('a confirmacao cobre alteracoes sensiveis e preserva consultas e preferencias visuais', () => {
  for (const [metodo, rota, corpo] of [
    ['PATCH', '/api/employees/4/access'],
    ['PATCH', '/api/employees/4/password'],
    ['PATCH', '/api/employees/4', { cargo: 'Administrador' }],
    ['POST', '/api/employees', { cargo: 'Administrador' }],
    ['POST', '/api/employees', { cargo: 'Mecânico' }],
    ['POST', '/api/admin/users', { position: 'Administrador' }],
    ['PATCH', '/api/admin/security/admins/uuid'],
    ['POST', '/api/admin/security/mfa/enroll'],
    ['POST', '/api/orders/4/payment'],
    ['DELETE', '/api/clients/2'],
    ['POST', '/api/admin/miniaturas/publicacoes/uuid/restaurar'],
  ])
    assert.equal(exigeConfirmacao(metodo, rota, corpo), true, metodo + ' ' + rota);
  for (const [metodo, rota, corpo] of [
    ['GET', '/api/employees/4'],
    ['GET', '/api/admin/security/admins'],
    ['PUT', '/api/admin/preferences/leitura'],
    ['PUT', '/api/admin/preferences/notificacoes'],
    ['POST', '/api/admin/security/confirm'],
    ['POST', '/api/admin/security/mfa/verify'],
    ['POST', '/api/admin/security/lock'],
    ['POST', '/api/admin/users', { position: 'Cliente' }],
    ['POST', '/api/admin/users', { position: 'Mecânico' }],
    ['PATCH', '/api/employees/4', { cargo: 'Mecânico' }],
    ['POST', '/api/admin/miniaturas/uuid/aprovar'],
    ['PATCH', '/api/admin/profile'],
    // Operacao diaria: nao pode interromper a oficina com pedidos de senha.
    ['PUT', '/api/shared/catalogo'],
    ['PATCH', '/api/orders/4', { status: 'Entregue' }],
    ['PATCH', '/api/orders/4', { status: 'Cancelada' }],
    ['DELETE', '/api/admin/miniaturas/uuid/referencias/0'],
    ['DELETE', '/api/admin/miniaturas/uuid/celular'],
  ])
    assert.equal(exigeConfirmacao(metodo, rota, corpo), false, metodo + ' ' + rota);
});

test('acoes de acesso e seguranca sao criticas; as demais usam a janela de confianca', () => {
  for (const [metodo, rota, corpo] of [
    ['PATCH', '/api/employees/4/access'],
    ['PATCH', '/api/admin/security/admins/uuid'],
    ['PATCH', '/api/admin/security/employee-requests/uuid'],
    ['POST', '/api/admin/security/mfa/enroll'],
    ['PUT', '/api/admin/preferences/seguranca'],
  ])
    assert.equal(nivelConfirmacao(metodo, rota, corpo), 'critica', metodo + ' ' + rota);
  for (const [metodo, rota] of [
    ['POST', '/api/orders/4/payment'],
    ['DELETE', '/api/clients/2'],
    ['POST', '/api/employees'],
  ])
    assert.equal(nivelConfirmacao(metodo, rota, {}), 'sensivel', metodo + ' ' + rota);
});

const resposta = (nivel) => ({
  locals: {
    adminUserId: 'autor',
    adminSessionId: 'sessao',
    acesso: { administrador: true, nivel },
  },
  status(codigo) {
    this.codigo = codigo;
    return this;
  },
  json(corpo) {
    this.corpo = corpo;
    return this;
  },
});
test('um admin comum nao bloqueia outro nem com uma confirmacao valida', async () => {
  let provaConsultada = false;
  const db = {
    from(tabela) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return {
            data:
              tabela === 'funcionario'
                ? { cargo: 'Administrador', perfil_acesso: 'Administrador', auth_user_id: 'outro' }
                : null,
            error: null,
          };
        },
      };
    },
    async rpc() {
      provaConsultada = true;
      return { data: true, error: null };
    },
  };
  const res = resposta('administrador');
  assert.equal(
    await protegerOperacao(
      {
        method: 'PATCH',
        originalUrl: '/api/employees/2/access',
        body: { bloqueado: true },
        cookies: { 'admin-confirmacao': 'a'.repeat(64) },
      },
      res,
      db,
    ),
    false,
  );
  assert.equal(res.codigo, 403);
  assert.equal(provaConsultada, false);
});

test('a prova e conferida no servidor e fica vinculada ao usuario e a sessao', async () => {
  let parametros;
  const req = {
    method: 'DELETE',
    originalUrl: '/api/clients/2',
    cookies: { 'admin-confirmacao': 'a'.repeat(64) },
  };
  const res = resposta('administrador');
  const db = {
    async rpc(nome, entrada) {
      parametros = { nome, entrada };
      return { data: false, error: null };
    },
  };
  assert.equal(await protegerOperacao(req, res, db), false);
  assert.equal(res.codigo, 428);
  assert.equal(parametros.nome, 'validar_confirmacao_admin');
  assert.equal(parametros.entrada.p_usuario, 'autor');
  assert.equal(parametros.entrada.p_sessao, 'sessao');
  assert.notEqual(parametros.entrada.p_hash, req.cookies['admin-confirmacao']);
  db.rpc = async () => ({ data: true, error: null });
  assert.equal(await protegerOperacao(req, res, db), true);
  db.rpc = async () => ({ data: null, error: new Error('indisponivel') });
  await assert.rejects(() => protegerOperacao(req, res, db), /indisponivel/);
});

test('cadastro administrativo pendente nao recebe acesso e dono recebe nivel explicito', async () => {
  const perfil = {
    id_funcionario: 1,
    cargo: 'Administrador',
    perfil_acesso: 'Administrador',
    auth_user_id: 'id',
  };
  const db = {
    async rpc() {
      return { data: null, error: null };
    },
  };
  assert.equal(await lerAcesso(db, perfil), null);
  db.rpc = async () => ({ data: 'dono', error: null });
  assert.deepEqual(await lerAcesso(db, perfil), {
    administrador: true,
    nivel: 'dono',
    cargo: 'Dono',
    permissoes: {},
  });
});
test('identificador de sessao malformado nao habilita a confirmacao', () => {
  assert.equal(idSessaoVerificada('invalido'), null);
  assert.equal(
    idSessaoVerificada('a.' + Buffer.from('{"session_id":"nao-uuid"}').toString('base64url')),
    null,
  );
});

test('editar um administrador existente continua protegido mesmo sem enviar o cargo', async () => {
  const consulta = (data) => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return { data, error: null };
    },
  });
  const db = {
    from(tabela) {
      return consulta(
        tabela === 'funcionario'
          ? { cargo: 'Administrador', perfil_acesso: 'Administrador', auth_user_id: 'outro' }
          : null,
      );
    },
  };
  const res = resposta('dono');
  assert.equal(
    await protegerOperacao(
      {
        method: 'PATCH',
        originalUrl: '/api/employees/2',
        body: { nome: 'Novo nome' },
        cookies: {},
      },
      res,
      db,
    ),
    false,
  );
  assert.equal(res.codigo, 428);
  assert.match(res.corpo.operation.titulo, /acesso/i);
});
test('editar dados comuns de um mecanico nao pede confirmacao administrativa', async () => {
  const db = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: { cargo: 'Mecânico', perfil_acesso: 'Mecânico' }, error: null };
        },
      };
    },
  };
  assert.equal(
    await protegerOperacao(
      {
        method: 'PATCH',
        originalUrl: '/api/employees/2',
        body: { nome: 'Nome corrigido' },
        cookies: {},
      },
      resposta('administrador'),
      db,
    ),
    true,
  );
});

test('quem nao e dono recebe recusa direta ao tentar aprovar, sem pedir sua senha', async () => {
  const res = resposta('administrador');
  assert.equal(
    await protegerOperacao(
      { method: 'PATCH', originalUrl: '/api/admin/security/admins/alvo', cookies: {} },
      res,
      {},
    ),
    false,
  );
  assert.equal(res.codigo, 403);
});

test('decisao administrativa aceita uma confirmacao de fator unico', async () => {
  const res = resposta('dono');
  assert.equal(
    await protegerOperacao(
      { method: 'PATCH', originalUrl: '/api/admin/security/admins/alvo', cookies: {} },
      res,
      {},
    ),
    false,
  );
  assert.equal(res.codigo, 428);
  assert.notEqual(res.corpo.operation.requireAuthenticator, true);
});

test('promocao a superadministrador exige senha e autenticador no dialogo oficial', async () => {
  const res = resposta('dono');
  assert.equal(
    await protegerOperacao(
      {
        method: 'PATCH',
        originalUrl: '/api/admin/security/admins/alvo',
        body: { nivel: 'superadministrador' },
        cookies: {},
      },
      res,
      {},
    ),
    false,
  );
  assert.equal(res.codigo, 428);
  assert.equal(res.corpo.operation.titulo, 'Confirmar promoção de acesso');
  assert.equal(res.corpo.operation.requireAuthenticator, true);
});

test('promocao nao aceita prova antiga de apenas um fator', async () => {
  const res = resposta('dono');
  const token = 'a'.repeat(64);
  const db = {
    async rpc() {
      return { data: true, error: null };
    },
  };
  assert.equal(
    await protegerOperacao(
      {
        method: 'PATCH',
        originalUrl: '/api/admin/security/admins/alvo',
        body: { nivel: 'superadministrador' },
        cookies: { 'admin-confirmacao': token },
      },
      res,
      db,
    ),
    false,
  );
  assert.equal(res.codigo, 428);
  assert.equal(res.corpo.operation.requireAuthenticator, true);
  const resAutenticada = resposta('dono');
  assert.equal(
    await protegerOperacao(
      {
        method: 'PATCH',
        originalUrl: '/api/admin/security/admins/alvo',
        body: { nivel: 'superadministrador' },
        cookies: { 'admin-confirmacao': token, 'admin-confirmacao-ambos': token },
      },
      resAutenticada,
      db,
    ),
    true,
  );
});
