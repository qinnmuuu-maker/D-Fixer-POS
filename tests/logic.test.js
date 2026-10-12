const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPin, verifyPin, calculateCartTotal, buildReceiptNumber, buildSyncQueuePayload } = require('../src/logic');

test('hashPin creates a stable salted hash', () => {
  const first = hashPin('123456');
  const second = hashPin('123456', first.salt);
  assert.equal(first.hash, second.hash);
  assert.notEqual(first.hash, '123456');
});

test('verifyPin accepts matching PIN and rejects invalid one', () => {
  const { salt, hash } = hashPin('123456');
  assert.equal(verifyPin('123456', salt, hash), true);
  assert.equal(verifyPin('654321', salt, hash), false);
});

test('calculateCartTotal sums prices times quantities', () => {
  const total = calculateCartTotal([
    { price: 25000, quantity: 2 },
    { price: 6000, quantity: 1 },
  ]);
  assert.equal(total, 56000);
});

test('buildReceiptNumber returns DF prefixed transaction code', () => {
  const number = buildReceiptNumber();
  assert.equal(number.startsWith('DF-'), true);
  assert.equal(number.split('-').length, 3);
});

test('buildSyncQueuePayload keeps transaction totals and items stable for idempotent sync', () => {
  const payload = buildSyncQueuePayload({
    id: 'txn-1',
    receipt_number: 'DF-20261012-12345',
    subtotal: 30000,
    amount_received: 40000,
    change_amount: 10000,
    status: 'completed',
    created_at: '2026-10-12T00:00:00Z',
    items: [
      { product_id: 'p1', product_name: 'Kopi', quantity: 2, unit_price: 15000, subtotal: 30000 },
    ],
  });

  assert.equal(payload.receipt_number, 'DF-20261012-12345');
  assert.equal(payload.items[0].quantity, 2);
  assert.equal(payload.change_amount, 10000);
});
