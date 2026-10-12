const crypto = require('crypto');

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.pbkdf2Sync(String(pin), salt, 100000, 64, 'sha512');
  return { salt, hash: derived.toString('hex') };
}

function verifyPin(pin, salt, hash) {
  const { hash: derived } = hashPin(pin, salt);
  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(derived, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function calculateCartTotal(items) {
  return items.reduce((total, item) => total + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
}

function buildReceiptNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = String(Math.floor(Math.random() * 90000) + 10000);
  return `DF-${stamp}-${random}`;
}

function buildSyncQueuePayload(transaction) {
  return {
    id: transaction.id,
    receipt_number: transaction.receipt_number,
    subtotal: Number(transaction.subtotal || 0),
    amount_received: Number(transaction.amount_received || 0),
    change_amount: Number(transaction.change_amount || 0),
    status: transaction.status,
    created_at: transaction.created_at,
    items: Array.isArray(transaction.items) ? transaction.items.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      subtotal: Number(item.subtotal || 0),
    })) : [],
  };
}

module.exports = {
  hashPin,
  verifyPin,
  calculateCartTotal,
  buildReceiptNumber,
  buildSyncQueuePayload,
};
