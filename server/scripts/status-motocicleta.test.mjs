import assert from 'node:assert/strict';
import test from 'node:test';
import { statusMotocicleta } from '../src/statusMotocicleta.ts';

test('OS aberta e OS em trabalho têm estados distintos na lista de motos', () => {
  assert.equal(statusMotocicleta(true, 'aguardando', false), 'active');
  assert.equal(statusMotocicleta(true, 'em andamento', false), 'maintenance');
  assert.equal(statusMotocicleta(true, 'aguardando peça', false), 'maintenance');
});

test('o pagamento só libera retirada depois que a OS está pronta', () => {
  assert.equal(statusMotocicleta(true, 'pronto', false), 'completed');
  assert.equal(statusMotocicleta(true, 'pronto', true), 'pickup');
  assert.equal(statusMotocicleta(true, 'em andamento', true), 'maintenance');
});

test('cadastro inativo, entrega, cancelamento e ausência de OS não se confundem', () => {
  assert.equal(statusMotocicleta(false, 'aguardando', false), 'inactive');
  assert.equal(statusMotocicleta(true, 'entregue', true, false), 'pickup');
  assert.equal(statusMotocicleta(true, 'entregue', true, true), 'delivered');
  assert.equal(statusMotocicleta(true, 'entregue', false, true), 'completed');
  assert.equal(statusMotocicleta(true, 'pronto', true, true), 'pickup');
  assert.equal(statusMotocicleta(true, 'aguardando', false, true), 'active');
  assert.equal(statusMotocicleta(true, 'cancelada', false, true), 'cancelled');
  assert.equal(statusMotocicleta(true, null, false), 'no-orders');
});
