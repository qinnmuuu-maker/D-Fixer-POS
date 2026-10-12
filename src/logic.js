const crypto = require('crypto');

function normalizePin(value) {
  return String(value ?? '').trim();
}

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const safeSalt = String(salt ?? crypto.randomBytes(16).toString('hex'));
  const derived = crypto.pbkdf2Sync(normalizePin(pin), safeSalt, 100000, 64, 'sha512');
  return { salt: safeSalt, hash: derived.toString('hex') };
}

function verifyPin(pin, salt, hash) {
  const pinValue = normalizePin(pin);
  const saltValue = String(salt ?? '');
  const hashValue = String(hash ?? '');
  if (!saltValue || !hashValue) return false;
  if (!/^[0-9a-fA-F]+$/.test(hashValue)) return false;

  try {
    const { hash: derived } = hashPin(pinValue, saltValue);
    const expected = Buffer.from(hashValue, 'hex');
    const actual = Buffer.from(derived, 'hex');
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function calculateCartTotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    if (!item || typeof item !== 'object') return total;
    const price = Number(item.price);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(price) || !Number.isFinite(quantity)) return total;
    return total + (price * quantity);
  }, 0);
}

function buildReceiptNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = String(Math.floor(Math.random() * 90000) + 10000);
  return `DF-${stamp}-${random}`;
}

function buildSyncQueuePayload(transaction) {
  const payload = transaction && typeof transaction === 'object' ? transaction : {};
  const items = Array.isArray(payload.items) ? payload.items : [];

  return {
    id: payload.id,
    receipt_number: payload.receipt_number,
    subtotal: Number(payload.subtotal ?? 0),
    amount_received: Number(payload.amount_received ?? 0),
    change_amount: Number(payload.change_amount ?? 0),
    status: payload.status,
    created_at: payload.created_at,
    items: items.map((item) => ({
      product_id: item?.product_id,
      product_name: item?.product_name,
      quantity: Number(item?.quantity ?? 0),
      unit_price: Number(item?.unit_price ?? 0),
      subtotal: Number(item?.subtotal ?? 0),
    })),
  };
}

module.exports = {
  hashPin,
  verifyPin,
  calculateCartTotal,
  buildReceiptNumber,
  buildSyncQueuePayload,
};
