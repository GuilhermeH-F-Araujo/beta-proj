import test from 'node:test';
import assert from 'node:assert/strict';
import { administrador, permitirRequisicao, lerAcesso, tiposAvisos } from '../dist/cargos.js';
const administradorLocal = { administrador: true, cargo: 'Administrador', permissoes: {} };
const consulta = {
  administrador: false,
  cargo: 'Consulta',
  permissoes: { ordens: { visualizar: true } },
};
test('administrator remains integral and requires both access fields', () => {
  assert.equal(administrador({ cargo: 'Administrador', perfil_acesso: 'Administrador' }), true);
  assert.equal(administrador({ cargo: 'Administrador', perfil_acesso: 'Mecânico' }), false);
  assert.equal(permitirRequisicao(administradorLocal, 'DELETE', '/api/orders/2'), true);
});
test('read-only roles cannot mutate data or cross module boundaries', () => {
  assert.equal(permitirRequisicao(consulta, 'GET', '/api/orders?search=x'), true);
  for (const [mesAtual, registroAtual] of [
    ['POST', '/api/orders'],
    ['PATCH', '/api/orders/2/status'],
    ['DELETE', '/api/orders/2'],
    ['GET', '/api/clients'],
    ['GET', '/api/orders-evil'],
    ['GET', '/api/admin/settings/activity'],
  ])
    assert.equal(
      permitirRequisicao(consulta, mesAtual, registroAtual),
      false,
      `${mesAtual} ${registroAtual}`,
    );
});
test('create edit and delete are independent including nested payment routes', () => {
  const primeiroElemento = {
    ...consulta,
    permissoes: { ordens: { visualizar: true, criar: true } },
  };
  assert.equal(permitirRequisicao(primeiroElemento, 'POST', '/api/orders'), true);
  assert.equal(permitirRequisicao(primeiroElemento, 'POST', '/api/orders/2/payment'), false);
  primeiroElemento.permissoes.ordens.editar = true;
  assert.equal(permitirRequisicao(primeiroElemento, 'POST', '/api/orders/2/payment'), true);
  assert.equal(permitirRequisicao(primeiroElemento, 'DELETE', '/api/orders/2'), false);
});
test('custom roles cannot escalate through employee user or role management APIs', () => {
  const primeiroElemento = {
    ...consulta,
    permissoes: {
      funcionarios: {
        visualizar: true,
        criar: true,
        editar: true,
        excluir: true,
      },
    },
  };
  for (const [mesAtual, registroAtual] of [
    ['PUT', '/api/admin/roles'],
    ['POST', '/api/admin/users'],
    ['PATCH', '/api/employees/2/access'],
    ['PATCH', '/api/employees/2/password'],
    ['GET', '/api/admin/settings/diagnostics'],
  ])
    assert.equal(permitirRequisicao(primeiroElemento, mesAtual, registroAtual), false);
  assert.equal(permitirRequisicao(primeiroElemento, 'GET', '/api/employees'), true);
});
test('own profile preferences and notification state remain accessible', () => {
  for (const registroAtual of [
    '/api/admin/profile',
    '/api/admin/preferences/leitura',
    '/api/admin/notifications/2',
  ])
    assert.equal(permitirRequisicao(consulta, 'PATCH', registroAtual), true);
  assert.equal(permitirRequisicao(consulta, 'GET', '/api/admin/profile-evil'), false);
});
test('notification types are scoped to the modules the role can view', () => {
  assert.equal(tiposAvisos(administradorLocal), null);
  assert.deepEqual(tiposAvisos({ ...consulta, permissoes: {} }), []);
  assert.equal(tiposAvisos(consulta).includes('nova_os'), true);
  assert.equal(tiposAvisos(consulta).includes('novo_cliente'), false);
});
const simulado = (valorAtual, elementoAtual) => ({
  from(instanteAtual) {
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      async maybeSingle() {
        return {
          data: instanteAtual === 'cargo_vinculo' ? valorAtual : elementoAtual,
          error: null,
        };
      },
    };
  },
});
const perfil = {
  id_funcionario: 1,
  cargo: 'Mecânico',
  perfil_acesso: 'Mecânico',
};
test('missing explicit assignment and inactive roles cannot acquire access', async () => {
  assert.equal(await lerAcesso(simulado(null, null), perfil), null);
  assert.equal(await lerAcesso(simulado({ id_cargo: 'a' }, { ativo: false }), perfil), null);
  const primeiroElemento = await lerAcesso(
    simulado({ id_cargo: 'a' }, { ativo: true, nome: 'Consulta', permissoes: consulta.permissoes }),
    perfil,
  );
  assert.equal(primeiroElemento.cargo, 'Consulta');
  assert.equal(primeiroElemento.administrador, false);
});
test('permission database failures fail closed', async () => {
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
          return { data: null, error: new Error('offline') };
        },
      };
    },
  };
  await assert.rejects(() => lerAcesso(db, perfil), /offline/);
});

test('creating a customer does not grant creation of employee or administrator accounts', () => {
  const primeiroElemento = {
    administrador: false,
    cargo: 'Atendimento',
    permissoes: { clientes: { visualizar: true, criar: true } },
  };
  assert.equal(
    permitirRequisicao(primeiroElemento, 'POST', '/api/admin/users', {
      position: 'Cliente',
      profile: 'Cliente',
    }),
    true,
  );
  assert.equal(
    permitirRequisicao(primeiroElemento, 'POST', '/api/admin/users', {
      position: 'Administrador',
      profile: 'Administrador',
    }),
    false,
  );
  assert.equal(
    permitirRequisicao(primeiroElemento, 'POST', '/api/admin/users', {
      position: 'Cliente',
      profile: 'Administrador',
    }),
    false,
  );
  assert.equal(permitirRequisicao(primeiroElemento, 'POST', '/api/admin/users', null), false);
});
