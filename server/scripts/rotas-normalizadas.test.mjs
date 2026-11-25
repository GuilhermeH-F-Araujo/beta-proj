import test from 'node:test';
import assert from 'node:assert/strict';
import { exigeConfirmacao, rotaNormalizada } from '../src/auth/politicaAdministrativa.ts';
import { permitirRequisicao } from '../src/cargos.ts';

test('maiusculas, barras extras e codificacao nao escapam da confirmacao de senha', () => {
  for (const caminho of [
    '/api/employees/5/access',
    '/api/Employees/5/access',
    '/API/EMPLOYEES/5/ACCESS/',
    '/api//employees/5/access?x=1',
    '/api/%65mployees/5/access',
  ])
    assert.equal(exigeConfirmacao('PATCH', caminho, {}), true, caminho);
  assert.equal(exigeConfirmacao('PUT', '/api/admin/settings/BACKUP', {}), true);
  assert.equal(rotaNormalizada('/api/%zz'), '/api/%zz');
});

test('cargo sem permissao continua bloqueado com rota em maiusculas', () => {
  const recepcao = { administrador: false, cargo: 'Recepção', permissoes: { ordens: { visualizar: true } } };
  assert.equal(permitirRequisicao(recepcao, 'DELETE', '/api/Orders/7'), false);
  assert.equal(permitirRequisicao(recepcao, 'GET', '/API/ORDERS'), true);
});
