import assert from 'node:assert/strict';
import test from 'node:test';
import { situacaoMotocicleta } from '../src/statusMotocicleta.ts';

test('OS aberta e OS em trabalho têm estados distintos na lista de motos', () => {
  assert.equal(situacaoMotocicleta(true, 'aguardando', false), 'active');
  assert.equal(situacaoMotocicleta(true, 'em andamento', false), 'maintenance');
  assert.equal(situacaoMotocicleta(true, 'aguardando peça', false), 'maintenance');
});

test('o pagamento só libera retirada depois que a OS está pronta', () => {
  assert.equal(situacaoMotocicleta(true, 'pronto', false), 'completed');
  assert.equal(situacaoMotocicleta(true, 'pronto', true), 'pickup');
  assert.equal(situacaoMotocicleta(true, 'em andamento', true), 'maintenance');
});

test('cadastro inativo, entrega, cancelamento e ausência de OS não se confundem', () => {
  assert.equal(situacaoMotocicleta(false, 'aguardando', false), 'inactive');
  assert.equal(situacaoMotocicleta(true, 'entregue', true, false), 'pickup');
  assert.equal(situacaoMotocicleta(true, 'entregue', true, true), 'delivered');
  assert.equal(situacaoMotocicleta(true, 'entregue', false, true), 'completed');
  assert.equal(situacaoMotocicleta(true, 'pronto', true, true), 'pickup');
  assert.equal(situacaoMotocicleta(true, 'aguardando', false, true), 'active');
  assert.equal(situacaoMotocicleta(true, 'cancelada', false, true), 'cancelled');
  assert.equal(situacaoMotocicleta(true, null, false), 'no-orders');
});
