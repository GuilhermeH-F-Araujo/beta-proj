import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { resumoFuncionario, rotasFuncionarios } from '../dist/funcionarios.js';
test('indicadores separam peças e canceladas, respeitam o mês e preservam totais históricos', () => {
  const situacoes = [
    'pronto',
    'entregue',
    'aguardando',
    'em andamento',
    'aguardando peça',
    'cancelada',
  ];
  const ordens = situacoes.map((situacao, indice) => ({
    id_os: indice,
    status: situacao,
    data_entrada: '2026-10-02T12:00:00Z',
  }));
  ordens.push(
    { id_os: 9, status: 'pronto', data_entrada: '2026-09-30T23:00:00Z' },
    { id_os: 10, status: 'aguardando peça', data_entrada: '2026-09-30T23:00:00Z' },
  );
  assert.deepEqual(resumoFuncionario(ordens, '2026-10'), {
    total: 6,
    concluidas: 2,
    abertas: 2,
    pecas: 1,
    canceladas: 1,
    taxa: 33,
    totalConcluidas: 3,
    totalAbertas: 4,
  });
  assert.equal(resumoFuncionario([], '2026-10').taxa, 0);
});
test('rotas rejeitam leitura e escrita sem autenticação antes de acessar o banco', async () => {
  const app = express();
  app.use(
    '/api/employees',
    rotasFuncionarios(async (req, res) => {
      res.status(401).json({ message: 'Sem sessão' });
      return null;
    }),
  );
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolver) => servidor.once('listening', resolver));
  try {
    for (const [metodo, caminho] of [
      ['GET', ''],
      ['GET', '/1'],
      ['PATCH', '/1'],
      ['POST', '/1/notas'],
      ['DELETE', '/1/documentos/1'],
      ['GET', '/1/photo'],
    ]) {
      const response = await fetch(
        `http://127.0.0.1:${servidor.address().port}/api/employees${caminho}`,
        { method: metodo },
      );
      assert.equal(response.status, 401, metodo + caminho);
    }
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }
});
test('bloquear e liberar acesso altera somente a conta Auth e mantém o cadastro do funcionário', async () => {
  const funcionario = {
    id_funcionario: 7,
    nome: 'Ana Santos',
    cargo: 'Mecânico',
    auth_user_id: 'auth-ana',
  };
  let bannedAte = null;
  const atualizacoes = [];
  const consulta = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () => ({ data: funcionario, error: null }),
  };
  const db = {
    from() {
      return consulta;
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { id: 'auth-ana', banned_until: bannedAte } },
          error: null,
        }),
        updateUserById: async (_Id, atributos) => {
          atualizacoes.push(atributos.ban_duration);
          bannedAte =
            atributos.ban_duration === 'none' ? null : new Date(Date.now() + 60_000).toISOString();
          return { data: { user: { id: 'auth-ana', banned_until: bannedAte } }, error: null };
        },
      },
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    '/api/employees',
    rotasFuncionarios(async (_req, res) => {
      res.locals.adminUserId = 'auth-admin';
      return db;
    }),
  );
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolver) => servidor.once('listening', resolver));
  try {
    const rota = `http://127.0.0.1:${servidor.address().port}/api/employees/7/access`;
    const bloqueio = await fetch(rota, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bloqueado: true }),
    });
    assert.equal(bloqueio.status, 200);
    assert.deepEqual(await bloqueio.json(), { ok: true, bloqueado: true });
    const desbloqueio = await fetch(rota, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bloqueado: false }),
    });
    assert.equal(desbloqueio.status, 200);
    assert.deepEqual(await desbloqueio.json(), { ok: true, bloqueado: false });
    assert.deepEqual(atualizacoes, ['876000h', 'none']);
    assert.equal(funcionario.nome, 'Ana Santos');
    assert.equal(funcionario.auth_user_id, 'auth-ana');
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }
});
test('administrador define diretamente a nova senha da conta vinculada sem alterar o cadastro', async () => {
  const funcionario = { id_funcionario: 9, nome: 'Beto Mecânico', auth_user_id: 'auth-beto' };
  const senhaAtualizacoes = [];
  const consulta = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () => ({ data: funcionario, error: null }),
  };
  const db = {
    from() {
      return consulta;
    },
    auth: {
      admin: {
        updateUserById: async (id, atributos) => {
          senhaAtualizacoes.push([id, atributos]);
          return { data: { user: { id } }, error: null };
        },
      },
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    '/api/employees',
    rotasFuncionarios(async (_req, res) => {
      res.locals.adminUserId = 'auth-admin';
      return db;
    }),
  );
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolver) => servidor.once('listening', resolver));
  try {
    const rota = `http://127.0.0.1:${servidor.address().port}/api/employees/9/password`;
    const response = await fetch(rota, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'NovaSenha9!' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(senhaAtualizacoes, [['auth-beto', { password: 'NovaSenha9!' }]]);
    assert.deepEqual(funcionario, {
      id_funcionario: 9,
      nome: 'Beto Mecânico',
      auth_user_id: 'auth-beto',
    });
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }
});
test('não permite que o administrador use o fluxo de troca de senha de outro funcionário para si', async () => {
  const funcionario = { id_funcionario: 10, nome: 'Admin', auth_user_id: 'auth-admin' };
  let alterado = false;
  const consulta = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () => ({ data: funcionario, error: null }),
  };
  const db = {
    from() {
      return consulta;
    },
    auth: {
      admin: {
        updateUserById: async () => {
          alterado = true;
          return { data: { user: {} }, error: null };
        },
      },
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    '/api/employees',
    rotasFuncionarios(async (_req, res) => {
      res.locals.adminUserId = 'auth-admin';
      return db;
    }),
  );
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolver) => servidor.once('listening', resolver));
  try {
    const response = await fetch(
      `http://127.0.0.1:${servidor.address().port}/api/employees/10/password`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'NovaSenha9!' }),
      },
    );
    assert.equal(response.status, 409);
    assert.equal(alterado, false);
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }
});
test('impede bloquear a própria conta do administrador', async () => {
  const funcionario = {
    id_funcionario: 8,
    nome: 'Admin',
    cargo: 'Administrador',
    auth_user_id: 'auth-admin',
  };
  let alterado = false;
  const consulta = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () => ({ data: funcionario, error: null }),
  };
  const db = {
    from() {
      return consulta;
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { id: 'auth-admin' } }, error: null }),
        updateUserById: async () => {
          alterado = true;
          return { data: { user: {} }, error: null };
        },
      },
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    '/api/employees',
    rotasFuncionarios(async (_req, res) => {
      res.locals.adminUserId = 'auth-admin';
      return db;
    }),
  );
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolver) => servidor.once('listening', resolver));
  try {
    const response = await fetch(
      `http://127.0.0.1:${servidor.address().port}/api/employees/8/access`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bloqueado: true }),
      },
    );
    assert.equal(response.status, 409);
    assert.equal(alterado, false);
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }
});
