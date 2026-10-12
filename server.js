const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const appRoot = __dirname;
const dataDir = path.join(appRoot, 'data');
const databasePath = path.join(dataDir, 'dfixer-pos.db');
fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(databasePath);
const sessions = new Map();
let databaseQueue = Promise.resolve();

function requireAsync(fn) {
  return function wrapper(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

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
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function uid() {
  return crypto.randomUUID();
}

function generateReceiptNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const random = String(crypto.randomInt(10000, 100000));
  return `DF-${stamp}-${random}`;
}

const backupTables = {
  business: ['id', 'name', 'address', 'phone', 'owner_name', 'created_at', 'updated_at'],
  categories: ['id', 'name', 'created_at'],
  users: ['id', 'username', 'full_name', 'role', 'pin_hash', 'pin_salt', 'failed_attempts', 'locked_until', 'is_active', 'created_at', 'updated_at'],
  products: ['id', 'category_id', 'name', 'price', 'is_active', 'created_at', 'updated_at'],
  transactions: ['id', 'receipt_number', 'client_request_id', 'status', 'cashier_id', 'payment_method', 'subtotal', 'amount_received', 'change_amount', 'created_at', 'completed_at', 'note', 'sync_status'],
  transactionItems: ['id', 'transaction_id', 'product_id', 'product_name', 'unit_price', 'quantity', 'subtotal', 'created_at'],
  receiptSettings: ['id', 'business_name', 'address', 'phone', 'footer', 'paper_width', 'print_enabled', 'updated_at'],
  devices: ['id', 'device_name', 'device_code', 'registered_at', 'status'],
  syncQueue: ['id', 'entity_type', 'entity_id', 'payload', 'status', 'created_at', 'updated_at'],
  cloudSettings: ['id', 'enabled', 'api_url', 'last_sync_status', 'last_sync_at', 'last_error', 'updated_at'],
  auditLogs: ['id', 'user_id', 'action', 'details', 'created_at'],
};

function encryptBackup(backup, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(backup), 'utf8'),
    cipher.final(),
  ]);
  return {
    format: 'dfixer-pos-encrypted-backup',
    version: 1,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  };
}

function decryptBackup(envelope, passphrase) {
  if (!envelope || envelope.format !== 'dfixer-pos-encrypted-backup' || envelope.version !== 1 || envelope.kdf !== 'scrypt') {
    throw new Error('Format file cadangan tidak didukung atau tidak valid.');
  }
  try {
    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const data = Buffer.from(envelope.data, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || data.length === 0) {
      throw new Error('Parameter enkripsi tidak valid.');
    }
    const key = crypto.scryptSync(passphrase, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext);
  } catch {
    throw new Error('Kata sandi salah atau file cadangan rusak.');
  }
}

function validateBackup(backup) {
  if (!backup || backup.version !== 1 || typeof backup.exported_at !== 'string') {
    throw new Error('Struktur file cadangan tidak valid.');
  }
  for (const [key, columns] of Object.entries(backupTables)) {
    const rows = backup[key];
    if (!Array.isArray(rows) || rows.length > 100000) {
      throw new Error(`Data ${key} pada file cadangan tidak valid.`);
    }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id
        || Object.keys(row).some((field) => !columns.includes(field))) {
        throw new Error(`Baris data ${key} pada file cadangan tidak valid.`);
      }
    }
  }
  if (!backup.users.some((user) => user.role === 'owner' && user.pin_hash && user.pin_salt)) {
    throw new Error('Cadangan harus menyertakan setidaknya satu akun pemilik yang valid.');
  }
}

function createSession(user, deviceCode) {
  const token = crypto.randomUUID();
  sessions.set(token, {
    userId: user.id,
    deviceCode,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return token;
}

function authMiddleware(req, res, next) {
  Promise.resolve().then(async () => {
    const token = req.headers['x-auth-token'];
    const session = token && sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Sesi login tidak valid atau sudah kedaluwarsa.' });
    }
    if (req.get('x-device-code') !== session.deviceCode) {
      return res.status(403).json({ error: 'Sesi ini terikat ke perangkat lain.' });
    }

    const user = await get('SELECT role, is_active FROM users WHERE id = ?', [session.userId]);
    if (!user || user.is_active !== 1) {
      sessions.delete(token);
      return res.status(401).json({ error: 'Akun tidak aktif atau tidak ditemukan.' });
    }
    const device = await get('SELECT status FROM devices WHERE device_code = ?', [session.deviceCode]);
    const ownerDeviceManagement = user.role === 'owner' && req.path.startsWith('/api/devices');
    const ownerSetup = user.role === 'owner' && req.path === '/api/session';
    if ((!device || device.status !== 'registered') && !ownerDeviceManagement && !ownerSetup) {
      return res.status(403).json({ error: 'Perangkat belum terdaftar atau sedang dinonaktifkan. Minta pemilik mengaktifkannya.' });
    }
    req.user = {
      userId: session.userId,
      role: user.role,
      deviceCode: session.deviceCode,
      deviceRegistered: device?.status === 'registered',
    };
    return next();
  }).catch(next);
}

function withDatabaseLock(operation) {
  const result = databaseQueue.then(operation, operation);
  databaseQueue = result.catch(() => {});
  return result;
}

function getRaw(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function allRaw(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function runRaw(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return withDatabaseLock(() => getRaw(sql, params));
}

function all(sql, params = []) {
  return withDatabaseLock(() => allRaw(sql, params));
}

function run(sql, params = []) {
  return withDatabaseLock(() => runRaw(sql, params));
}

async function withDatabaseTransaction(callback) {
  return withDatabaseLock(async () => {
    await runRaw('BEGIN IMMEDIATE');
    const transaction = { get: getRaw, all: allRaw, run: runRaw };
    try {
      const result = await callback(transaction);
      await runRaw('COMMIT');
      return result;
    } catch (error) {
      await runRaw('ROLLBACK');
      throw error;
    }
  });
}

async function initializeDatabase() {
  await run('PRAGMA foreign_keys = ON');
  await run('PRAGMA journal_mode = WAL');
  await run('PRAGMA synchronous = FULL');
  await run('PRAGMA busy_timeout = 5000');

  await run(`
    CREATE TABLE IF NOT EXISTS business (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      owner_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','cashier','supervisor')),
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      device_name TEXT NOT NULL,
      device_code TEXT NOT NULL UNIQUE,
      registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'registered'
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      name TEXT NOT NULL,
      price REAL NOT NULL CHECK(price >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      receipt_number TEXT NOT NULL UNIQUE,
      client_request_id TEXT UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('draft','completed','cancelled')),
      cashier_id TEXT,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      subtotal REAL NOT NULL DEFAULT 0,
      amount_received REAL NOT NULL DEFAULT 0,
      change_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      note TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY(cashier_id) REFERENCES users(id)
    );
  `);
  const transactionColumns = await all('PRAGMA table_info(transactions)');
  if (!transactionColumns.some((column) => column.name === 'client_request_id')) {
    await run('ALTER TABLE transactions ADD COLUMN client_request_id TEXT');
    await run('CREATE UNIQUE INDEX IF NOT EXISTS transactions_client_request_id_unique ON transactions(client_request_id)');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS transaction_items (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      subtotal REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(transaction_id) REFERENCES transactions(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS receipt_settings (
      id TEXT PRIMARY KEY,
      business_name TEXT,
      address TEXT,
      phone TEXT,
      footer TEXT,
      paper_width TEXT NOT NULL DEFAULT '58mm',
      print_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cloud_settings (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      api_url TEXT NOT NULL DEFAULT 'https://api.example.com',
      last_sync_status TEXT NOT NULL DEFAULT 'idle',
      last_sync_at TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const businessExists = await get('SELECT 1 FROM business LIMIT 1');
  if (!businessExists) {
    await run(
      'INSERT INTO business (id, name, address, phone, owner_name) VALUES (?, ?, ?, ?, ?)',
      [uid(), "D'Fixer POS", 'Jl. Berkah No. 1', '081234567890', 'Pemilik Usaha']
    );
  }

  const owner = await get('SELECT * FROM users WHERE username = ?', ['owner']);
  if (!owner) {
    const ownerPin = hashPin('123456');
    await run(
      'INSERT INTO users (id, username, full_name, role, pin_hash, pin_salt, failed_attempts, is_active) VALUES (?, ?, ?, ?, ?, ?, 0, 1)',
      [uid(), 'owner', 'Pemilik', 'owner', ownerPin.hash, ownerPin.salt]
    );
  }

  const receiptExists = await get('SELECT 1 FROM receipt_settings LIMIT 1');
  if (!receiptExists) {
    await run(
      'INSERT INTO receipt_settings (id, business_name, address, phone, footer, paper_width, print_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid(), "D'Fixer POS", 'Jl. Berkah No. 1', '081234567890', 'Terima kasih atas kunjungan Anda', '58mm', 1]
    );
  }

  await ensureCloudSettings();

  const categoryCount = await get('SELECT COUNT(*) AS count FROM categories');
  if ((categoryCount?.count ?? 0) === 0) {
    const categoryId = uid();
    await run('INSERT INTO categories (id, name) VALUES (?, ?)', [categoryId, 'Umum']);
    await run(
      'INSERT INTO products (id, category_id, name, price, is_active) VALUES (?, ?, ?, ?, 1)',
      [uid(), categoryId, 'Kopi Susu', 18000]
    );
    await run(
      'INSERT INTO products (id, category_id, name, price, is_active) VALUES (?, ?, ?, ?, 1)',
      [uid(), categoryId, 'Nasi Goreng', 25000]
    );
    await run(
      'INSERT INTO products (id, category_id, name, price, is_active) VALUES (?, ?, ?, ?, 1)',
      [uid(), categoryId, 'Teh Manis', 6000]
    );
  }
}

async function getBusinessProfile() {
  return get('SELECT * FROM business ORDER BY created_at DESC LIMIT 1');
}

async function getSettings() {
  const [business, receipt] = await Promise.all([
    getBusinessProfile(),
    get('SELECT * FROM receipt_settings ORDER BY updated_at DESC LIMIT 1'),
  ]);

  return { business, receipt };
}

async function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Hanya pemilik yang dapat melakukan tindakan ini.' });
  }
  return next();
}

function requireRole(...roles) {
  return function roleMiddleware(req, res, next) {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk melakukan tindakan ini.' });
    }
    return next();
  };
}

async function getCloudSettings() {
  const row = await get('SELECT * FROM cloud_settings ORDER BY updated_at DESC LIMIT 1');
  return {
    enabled: Boolean(row?.enabled),
    configured: Boolean(process.env.DFIXER_CLOUD_TOKEN),
    api_url: row?.api_url || 'https://api.example.com',
    last_sync_at: row?.last_sync_at || null,
    last_sync_status: row?.last_sync_status || 'idle',
    last_error: row?.last_error || null,
    queue_count: await get('SELECT COUNT(*) AS count FROM sync_queue WHERE status = ?', ['queued']).then((result) => Number(result?.count || 0)),
  };
}

async function ensureCloudSettings() {
  const exists = await get('SELECT 1 FROM cloud_settings LIMIT 1');
  if (!exists) {
    await run(
      'INSERT INTO cloud_settings (id, enabled, api_url, last_sync_status, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [uid(), 0, 'https://api.example.com', 'idle']
    );
  }
}

app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    'Permissions-Policy': 'bluetooth=(self)',
  });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(appRoot, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', time: new Date().toISOString() });
});

app.post('/api/init', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  await initializeDatabase();
  res.json({ ok: true, message: 'Database D\'Fixer POS berhasil diinisialisasi.' });
}));

app.post('/api/login', requireAsync(async (req, res) => {
  const { username, pin } = req.body || {};
  const deviceCode = String(req.get('x-device-code') || req.body?.device_code || '').trim();
  if (!username || !pin) {
    return res.status(400).json({ error: 'Username dan PIN harus diisi.' });
  }
  if (deviceCode.length < 8 || deviceCode.length > 80) {
    return res.status(400).json({ error: 'Identitas perangkat tidak valid.' });
  }

  const user = await get('SELECT * FROM users WHERE username = ?', [String(username).trim()]);
  if (!user) {
    return res.status(401).json({ error: 'Akun tidak ditemukan.' });
  }

  if (user.is_active !== 1) {
    return res.status(403).json({ error: 'Akun tidak aktif.' });
  }
  const device = await get('SELECT status FROM devices WHERE device_code = ?', [deviceCode]);
  if ((!device || device.status !== 'registered') && user.role !== 'owner') {
    return res.status(403).json({ error: 'Perangkat belum disetujui pemilik. Hubungi pemilik untuk mendaftarkan perangkat ini.' });
  }

  if (user.locked_until && user.locked_until > Date.now()) {
    return res.status(403).json({ error: `PIN terkunci sementara. Coba lagi setelah ${new Date(user.locked_until).toLocaleTimeString('id-ID')}.` });
  }

  const valid = verifyPin(String(pin), user.pin_salt, user.pin_hash);
  if (!valid) {
    const failedAttempts = Number(user.failed_attempts || 0) + 1;
    const lockDuration = failedAttempts >= 5 ? 60 * 1000 : null;
    await run(
      'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
      [failedAttempts, lockDuration ? Date.now() + lockDuration : null, user.id]
    );

    const remaining = Math.max(0, 5 - failedAttempts);
    return res.status(401).json({
      error: failedAttempts >= 5 ? 'Percobaan PIN terlalu banyak. Akses diblokir 60 detik.' : `PIN salah. Sisa percobaan: ${remaining}`,
    });
  }

  await run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
  const token = createSession(user, deviceCode);

  return res.json({
    token,
    device_registered: device?.status === 'registered',
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    },
  });
}));

app.get('/api/session', authMiddleware, requireAsync(async (req, res) => {
  return res.json({
    user_id: req.user.userId,
    role: req.user.role,
    device_registered: req.user.deviceRegistered,
  });
}));

app.post('/api/logout', authMiddleware, (req, res) => {
  sessions.delete(req.headers['x-auth-token']);
  return res.json({ ok: true });
});

app.get('/api/users', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const rows = await all('SELECT * FROM users ORDER BY full_name ASC');
  return res.json(rows.map((user) => ({
    ...user,
    pin_hash: undefined,
    pin_salt: undefined,
  })));
}));

app.post('/api/users', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const { username, full_name, role, pin } = req.body || {};
  const normalizedUsername = String(username || '').trim();
  const normalizedName = String(full_name || '').trim();
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(normalizedUsername)
    || normalizedName.length < 2 || normalizedName.length > 80
    || !/^\d{4,6}$/.test(String(pin || ''))) {
    return res.status(400).json({ error: 'Username, nama, role, dan PIN wajib diisi.' });
  }

  if (!['owner', 'cashier', 'supervisor'].includes(String(role))) {
    return res.status(400).json({ error: 'Role tidak valid.' });
  }

  const existing = await get('SELECT 1 FROM users WHERE username = ?', [normalizedUsername]);
  if (existing) {
    return res.status(409).json({ error: 'Username sudah digunakan.' });
  }

  const passwordData = hashPin(String(pin));
  const id = uid();
  await run(
    'INSERT INTO users (id, username, full_name, role, pin_hash, pin_salt, failed_attempts, is_active) VALUES (?, ?, ?, ?, ?, ?, 0, 1)',
    [id, normalizedUsername, normalizedName, String(role), passwordData.hash, passwordData.salt]
  );

  return res.status(201).json({ id, username: normalizedUsername, full_name: normalizedName, role: String(role), is_active: 1 });
}));

app.put('/api/users/:id', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const existing = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Akun tidak ditemukan.' });

  const fullName = req.body?.full_name === undefined ? existing.full_name : String(req.body.full_name).trim();
  const role = req.body?.role === undefined ? existing.role : String(req.body.role);
  const isActive = req.body?.is_active === undefined ? existing.is_active : (req.body.is_active === true ? 1 : req.body.is_active === false ? 0 : -1);
  const pin = req.body?.pin === undefined ? null : String(req.body.pin);
  if (fullName.length < 2 || fullName.length > 80 || !['owner', 'cashier', 'supervisor'].includes(role)
    || isActive === -1 || (pin !== null && !/^\d{4,6}$/.test(pin))) {
    return res.status(400).json({ error: 'Perubahan akun atau PIN tidak valid.' });
  }
  if (req.params.id === req.user.userId && isActive === 0) {
    return res.status(400).json({ error: 'Pemilik tidak dapat menonaktifkan akun yang sedang digunakan.' });
  }
  if (existing.role === 'owner' && existing.is_active === 1 && (role !== 'owner' || isActive === 0)) {
    const activeOwners = await get("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND is_active = 1");
    if (Number(activeOwners.count) <= 1) {
      return res.status(400).json({ error: 'Tidak dapat menonaktifkan atau mengubah satu-satunya akun pemilik aktif.' });
    }
  }

  const nextCredentials = pin === null ? null : hashPin(pin);
  await run(
    `UPDATE users SET full_name = ?, role = ?, is_active = ?,
      pin_hash = COALESCE(?, pin_hash), pin_salt = COALESCE(?, pin_salt),
      failed_attempts = CASE WHEN ? IS NULL THEN failed_attempts ELSE 0 END,
      locked_until = CASE WHEN ? IS NULL THEN locked_until ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [fullName, role, isActive, nextCredentials?.hash ?? null, nextCredentials?.salt ?? null, nextCredentials?.hash ?? null, nextCredentials?.hash ?? null, req.params.id]
  );
  if (isActive === 0 || role !== existing.role || pin !== null) {
    for (const [token, session] of sessions) {
      if (session.userId === req.params.id) sessions.delete(token);
    }
  }
  await run('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)', [
    uid(), req.user.userId, 'user_updated', JSON.stringify({ user_id: req.params.id, role, is_active: isActive, pin_reset: pin !== null }),
  ]);
  return res.json({ id: existing.id, username: existing.username, full_name: fullName, role, is_active: isActive });
}));

app.get('/api/categories', authMiddleware, requireAsync(async (req, res) => {
  const rows = await all('SELECT * FROM categories ORDER BY name ASC');
  return res.json(rows);
}));

app.post('/api/categories', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 1 || name.length > 60) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  }
  if (await get('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE', [name])) {
    return res.status(409).json({ error: 'Nama kategori sudah digunakan.' });
  }

  const id = uid();
  await run('INSERT INTO categories (id, name) VALUES (?, ?)', [id, name]);
  return res.status(201).json({ id, name });
}));

app.get('/api/products', authMiddleware, requireAsync(async (req, res) => {
  const includeInactive = req.query.all === 'true';
  if (includeInactive && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Hanya pemilik yang dapat melihat produk nonaktif.' });
  }
  const query = includeInactive
    ? 'SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.name ASC'
    : 'SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.is_active = 1 ORDER BY p.name ASC';

  const rows = await all(query);
  return res.json(rows);
}));

app.post('/api/products', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const { name, category_id, price } = req.body || {};
  const normalizedName = String(name || '').trim();
  const normalizedPrice = Number(price);
  if (normalizedName.length < 1 || normalizedName.length > 100 || !category_id
    || !Number.isSafeInteger(normalizedPrice) || normalizedPrice < 0) {
    return res.status(400).json({ error: 'Nama, kategori, dan harga produk wajib valid.' });
  }
  if (!await get('SELECT 1 FROM categories WHERE id = ?', [category_id])) {
    return res.status(400).json({ error: 'Kategori produk tidak ditemukan.' });
  }

  const id = uid();
  await run(
    'INSERT INTO products (id, category_id, name, price, is_active) VALUES (?, ?, ?, ?, 1)',
    [id, category_id, normalizedName, normalizedPrice]
  );

  return res.status(201).json({ id, name: normalizedName, category_id, price: normalizedPrice });
}));

app.put('/api/products/:id', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const { name, category_id, price, is_active } = req.body || {};
  const normalizedName = String(name || '').trim();
  const normalizedPrice = Number(price);
  if (normalizedName.length < 1 || normalizedName.length > 100 || !category_id
    || !Number.isSafeInteger(normalizedPrice) || normalizedPrice < 0
    || ![true, false, 0, 1].includes(is_active)) {
    return res.status(400).json({ error: 'Data produk tidak valid.' });
  }
  if (!await get('SELECT 1 FROM categories WHERE id = ?', [category_id])) {
    return res.status(400).json({ error: 'Kategori produk tidak ditemukan.' });
  }

  const updated = await run(
    'UPDATE products SET category_id = ?, name = ?, price = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [category_id, normalizedName, normalizedPrice, is_active === false || is_active === 0 ? 0 : 1, req.params.id]
  );
  if (!updated.changes) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

  return res.json({ ok: true });
}));

app.post('/api/devices/register', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const deviceName = String(req.body?.device_name || '').trim();
  const deviceCode = String(req.body?.device_code || '').trim();
  if (deviceName.length < 1 || deviceName.length > 80 || deviceCode.length < 4 || deviceCode.length > 80) {
    return res.status(400).json({ error: 'Nama dan kode perangkat wajib diisi dengan format yang valid.' });
  }
  if (deviceCode !== req.user.deviceCode) {
    return res.status(403).json({ error: 'Pemilik hanya dapat mendaftarkan perangkat yang sedang digunakan.' });
  }

  const existing = await get('SELECT * FROM devices WHERE device_code = ?', [deviceCode]);
  if (existing) {
    if (existing.status !== 'registered') {
      return res.status(409).json({ error: 'Kode perangkat sudah terdaftar tetapi tidak aktif.' });
    }
    return res.json({ id: existing.id, device_name: existing.device_name, device_code: existing.device_code, status: existing.status });
  }

  const id = uid();
  await run('INSERT INTO devices (id, device_name, device_code, status) VALUES (?, ?, ?, ?)', [id, deviceName, deviceCode, 'registered']);
  return res.status(201).json({ id, device_name: deviceName, device_code: deviceCode, status: 'registered' });
}));

app.put('/api/devices/:id', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const status = req.body?.status;
  if (!['registered', 'disabled'].includes(status)) {
    return res.status(400).json({ error: 'Status perangkat tidak valid.' });
  }
  const result = await run('UPDATE devices SET status = ? WHERE id = ?', [status, req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Perangkat tidak ditemukan.' });
  await run('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)', [
    uid(), req.user.userId, 'device_status_updated', JSON.stringify({ device_id: req.params.id, status }),
  ]);
  return res.json({ ok: true, status });
}));

app.get('/api/devices', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const rows = await all('SELECT * FROM devices ORDER BY registered_at DESC');
  return res.json(rows);
}));

app.post('/api/backup/export', authMiddleware, requireAsync(async (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Hanya pemilik yang dapat mengekspor cadangan data.' });
  }
  const passphrase = String(req.body?.passphrase || '');
  if (passphrase.length < 12 || passphrase.length > 256) {
    return res.status(400).json({ error: 'Kata sandi cadangan harus terdiri dari 12 sampai 256 karakter.' });
  }

  const backup = await withDatabaseTransaction(async (tx) => ({
    version: 1,
    exported_at: new Date().toISOString(),
    business: await tx.all('SELECT * FROM business'),
    categories: await tx.all('SELECT * FROM categories'),
    users: await tx.all('SELECT * FROM users'),
    products: await tx.all('SELECT * FROM products'),
    transactions: await tx.all('SELECT * FROM transactions'),
    transactionItems: await tx.all('SELECT * FROM transaction_items'),
    receiptSettings: await tx.all('SELECT * FROM receipt_settings'),
    devices: await tx.all('SELECT * FROM devices'),
    syncQueue: await tx.all('SELECT * FROM sync_queue'),
    cloudSettings: await tx.all('SELECT * FROM cloud_settings'),
    auditLogs: await tx.all('SELECT * FROM audit_logs'),
  }));

  return res.json(encryptBackup(backup, passphrase));
}));

app.post('/api/backup/import', authMiddleware, requireAsync(async (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Hanya pemilik yang dapat memulihkan cadangan data.' });
  }

  const { confirm_restore, backup: encryptedBackup, passphrase } = req.body || {};
  if (!confirm_restore || !encryptedBackup || typeof encryptedBackup !== 'object' || typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256) {
    return res.status(400).json({ error: 'Konfirmasi, file cadangan terenkripsi, dan kata sandi cadangan wajib diisi.' });
  }

  let backup;
  try {
    backup = decryptBackup(encryptedBackup, passphrase);
    validateBackup(backup);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  await withDatabaseTransaction(async (tx) => {
    const userIdMap = new Map();
    const users = [];
    for (const user of backup.users) {
      const existing = await tx.get('SELECT id FROM users WHERE username = ?', [user.username]);
      const id = existing?.id || user.id;
      userIdMap.set(user.id, id);
      users.push({ ...user, id });
    }

    const tableOrder = [
      ['business', backup.business],
      ['categories', backup.categories],
      ['users', users],
      ['products', backup.products],
      ['transactions', backup.transactions.map((row) => ({
        ...row,
        cashier_id: userIdMap.get(row.cashier_id) || row.cashier_id,
      }))],
      ['transaction_items', backup.transactionItems],
      ['receipt_settings', backup.receiptSettings],
      ['devices', backup.devices],
      ['cloud_settings', backup.cloudSettings],
      ['sync_queue', backup.syncQueue],
      ['audit_logs', backup.auditLogs.map((row) => ({
        ...row,
        user_id: userIdMap.get(row.user_id) || row.user_id,
      }))],
    ];

    for (const [key, rows] of tableOrder) {
      const columns = backupTables[key === 'transaction_items' ? 'transactionItems'
        : key === 'receipt_settings' ? 'receiptSettings'
          : key === 'cloud_settings' ? 'cloudSettings'
            : key === 'sync_queue' ? 'syncQueue'
              : key === 'audit_logs' ? 'auditLogs' : key];
      const updates = columns.filter((column) => column !== 'id');
      const statement = `INSERT INTO ${key} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
        ON CONFLICT(id) DO UPDATE SET ${updates.map((column) => `${column} = excluded.${column}`).join(', ')}`;
      for (const row of rows) {
        await tx.run(statement, columns.map((column) => row[column] ?? null));
      }
    }
    await tx.run(
      'INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [uid(), req.user.userId, 'backup_restored', JSON.stringify({ exported_at: backup.exported_at })]
    );
  });

  sessions.clear();
  return res.json({
    ok: true,
    requires_relogin: true,
    restored: {
      business: backup.business.length,
      categories: backup.categories.length,
      products: backup.products.length,
      transactions: backup.transactions.length,
    },
  });
}));

app.post('/api/transactions', authMiddleware, requireAsync(async (req, res) => {
  const { items, amount_received, payment_method = 'cash' } = req.body || {};
  const requestId = String(req.get('Idempotency-Key') || req.body?.client_request_id || uid()).trim();

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Keranjang transaksi harus berisi item.' });
  }
  if (!/^[\w-]{1,100}$/.test(requestId)) {
    return res.status(400).json({ error: 'Identitas permintaan transaksi tidak valid.' });
  }
  if (payment_method !== 'cash') {
    return res.status(400).json({ error: 'MVP hanya mendukung pembayaran tunai.' });
  }

  const normalizedItems = new Map();
  for (const item of items) {
    const productId = typeof item?.id === 'string' ? item.id.trim() : '';
    const quantity = Number(item?.quantity);
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) {
      return res.status(400).json({ error: 'Produk dan jumlah item harus valid.' });
    }
    normalizedItems.set(productId, (normalizedItems.get(productId) || 0) + quantity);
  }
  if ([...normalizedItems.values()].some((quantity) => !Number.isSafeInteger(quantity) || quantity > 100000)) {
    return res.status(400).json({ error: 'Jumlah produk melebihi batas yang diizinkan.' });
  }

  const amountReceived = Number(amount_received);
  if (!Number.isSafeInteger(amountReceived) || amountReceived < 0) {
    return res.status(400).json({ error: 'Jumlah uang yang diterima harus berupa angka rupiah bulat yang valid.' });
  }

  const outcome = await withDatabaseTransaction(async (tx) => {
    const existing = await tx.get('SELECT * FROM transactions WHERE client_request_id = ?', [requestId]);
    if (existing) {
      if (existing.cashier_id !== req.user.userId) {
        return { conflict: true };
      }
      const savedItems = await tx.all('SELECT * FROM transaction_items WHERE transaction_id = ?', [existing.id]);
      return { transaction: { ...existing, items: savedItems }, duplicate: true };
    }

    const productRows = [];
    for (const [productId, quantity] of normalizedItems) {
      const product = await tx.get('SELECT * FROM products WHERE id = ? AND is_active = 1', [productId]);
      if (!product) {
        return { invalidProduct: productId };
      }
      if (!Number.isSafeInteger(Number(product.price)) || Number(product.price) < 0) {
        throw new Error(`Harga produk tidak valid: ${productId}`);
      }
      productRows.push({ product, quantity });
    }

    const subtotal = productRows.reduce((sum, entry) => sum + Number(entry.product.price) * entry.quantity, 0);
    if (!Number.isSafeInteger(subtotal)) {
      return { invalidTotal: true };
    }
    if (amountReceived < subtotal) {
      return { insufficientPayment: true };
    }

    const transactionId = uid();
    const receiptNumber = generateReceiptNumber();
    const now = new Date().toISOString();
    const changeAmount = amountReceived - subtotal;

    await tx.run(
      `INSERT INTO transactions
       (id, receipt_number, client_request_id, status, cashier_id, payment_method, subtotal, amount_received, change_amount, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [transactionId, receiptNumber, requestId, 'completed', req.user.userId, payment_method, subtotal, amountReceived, changeAmount, now, now]
    );

    for (const entry of productRows) {
      const lineSubtotal = Number(entry.product.price) * entry.quantity;
      await tx.run(
        'INSERT INTO transaction_items (id, transaction_id, product_id, product_name, unit_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uid(), transactionId, entry.product.id, entry.product.name, Number(entry.product.price), entry.quantity, lineSubtotal]
      );
    }

    const cloudSettings = await tx.get('SELECT enabled FROM cloud_settings ORDER BY updated_at DESC LIMIT 1');
    if (cloudSettings?.enabled) {
      const syncPayload = {
        id: transactionId,
        receipt_number: receiptNumber,
        subtotal,
        amount_received: amountReceived,
        change_amount: changeAmount,
        status: 'completed',
        cashier_id: req.user.userId,
        created_at: now,
        items: productRows.map((entry) => ({
          product_id: entry.product.id,
          product_name: entry.product.name,
          quantity: entry.quantity,
          unit_price: Number(entry.product.price),
          subtotal: Number(entry.product.price) * entry.quantity,
        })),
      };
      await tx.run(
        'INSERT INTO sync_queue (id, entity_type, entity_id, payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [uid(), 'transaction', transactionId, JSON.stringify(syncPayload), 'queued']
      );
      await tx.run('UPDATE transactions SET sync_status = ? WHERE id = ?', ['queued', transactionId]);
    }

    await tx.run(
      'INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [uid(), req.user.userId, 'transaction_completed', JSON.stringify({ receiptNumber, subtotal, amountReceived, changeAmount })]
    );

    const saved = await tx.get('SELECT * FROM transactions WHERE id = ?', [transactionId]);
    const savedItems = await tx.all('SELECT * FROM transaction_items WHERE transaction_id = ?', [transactionId]);
    return { transaction: { ...saved, items: savedItems }, duplicate: false };
  });

  if (outcome.conflict) {
    return res.status(409).json({ error: 'Identitas transaksi ini sudah digunakan oleh transaksi lain.' });
  }
  if (outcome.invalidProduct) {
    return res.status(400).json({ error: `Produk tidak ditemukan atau nonaktif: ${outcome.invalidProduct}` });
  }
  if (outcome.invalidTotal) {
    return res.status(400).json({ error: 'Total transaksi melebihi batas yang dapat diproses.' });
  }
  if (outcome.insufficientPayment) {
    return res.status(400).json({ error: 'Uang yang diterima belum mencukupi total pembayaran.' });
  }
  return res.status(201).json({
    success: true,
    duplicate: outcome.duplicate,
    transaction: outcome.transaction,
  });
}));

app.get('/api/transactions', authMiddleware, requireAsync(async (req, res) => {
  const rows = req.user.role === 'cashier'
    ? await all(
      `SELECT t.*, u.full_name AS cashier_name
       FROM transactions t
       LEFT JOIN users u ON u.id = t.cashier_id
       WHERE t.cashier_id = ?
       ORDER BY t.created_at DESC`,
      [req.user.userId]
    )
    : await all(
      `SELECT t.*, u.full_name AS cashier_name
       FROM transactions t
       LEFT JOIN users u ON u.id = t.cashier_id
       ORDER BY t.created_at DESC`
    );

  const detailed = await Promise.all(
    rows.map(async (transaction) => {
      const items = await all('SELECT * FROM transaction_items WHERE transaction_id = ?', [transaction.id]);
      return { ...transaction, items };
    })
  );

  return res.json(detailed);
}));

app.post('/api/transactions/:id/cancel', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const { note } = req.body || {};
  const cancellationNote = String(note || '').trim();
  if (!cancellationNote) {
    return res.status(400).json({ error: 'Alasan pembatalan wajib diisi.' });
  }

  const result = await withDatabaseTransaction(async (tx) => {
    const target = await tx.get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!target) return { missing: true };
    if (target.status !== 'completed') return { conflict: true };

    const cancellation = await tx.run(
      'UPDATE transactions SET status = ?, note = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?',
      ['cancelled', cancellationNote, req.params.id, 'completed']
    );
    if (!cancellation.changes) return { conflict: true };

    const cloudSettings = await tx.get('SELECT enabled FROM cloud_settings ORDER BY updated_at DESC LIMIT 1');
    if (cloudSettings?.enabled) {
      await tx.run(
        'INSERT INTO sync_queue (id, entity_type, entity_id, payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [uid(), 'transaction_cancelled', req.params.id, JSON.stringify({ id: req.params.id, status: 'cancelled', note: cancellationNote, action: 'cancelled' }), 'queued']
      );
    }
    await tx.run(
      'INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [uid(), req.user.userId, 'transaction_cancelled', JSON.stringify({ id: req.params.id, note: cancellationNote })]
    );
    return { cancelled: true };
  });

  if (result.missing) {
    return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  }
  if (result.conflict) {
    return res.status(409).json({ error: 'Transaksi hanya dapat dibatalkan satu kali.' });
  }

  return res.json({ ok: true, status: 'cancelled' });
}));

app.get('/api/reports/summary', authMiddleware, requireRole('owner', 'supervisor'), requireAsync(async (req, res) => {
  const from = req.query.from || '1970-01-01';
  const to = req.query.to || new Date().toISOString();
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) {
    return res.status(400).json({ error: 'Rentang tanggal laporan tidak valid.' });
  }

  const summary = await get(
    `SELECT
      COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_orders,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN subtotal ELSE 0 END), 0) AS total_sales,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_received ELSE 0 END), 0) AS total_received,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN change_amount ELSE 0 END), 0) AS total_change,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_orders
     FROM transactions
     WHERE created_at >= ? AND created_at <= ?`,
    [from, to]
  );

  return res.json(summary);
}));

app.get('/api/cloud/status', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const status = await getCloudSettings();
  return res.json(status);
}));

app.put('/api/cloud/settings', authMiddleware, requireAsync(async (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Hanya pemilik yang dapat mengatur cloud.' });
  }

  const { enabled, api_url } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Status cloud harus dipilih secara eksplisit.' });
  }
  const nextEnabled = enabled === true || enabled === 1 ? 1 : 0;
  const normalizedUrl = String(api_url || '').trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return res.status(400).json({ error: 'URL layanan cloud tidak valid.' });
  }
  const isLocalHttp = ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname) && parsedUrl.protocol === 'http:';
  if ((parsedUrl.protocol !== 'https:' && !isLocalHttp) || parsedUrl.username || parsedUrl.password) {
    return res.status(400).json({ error: 'URL cloud harus menggunakan HTTPS dan tidak boleh menyimpan kredensial pada URL.' });
  }
  if (nextEnabled && !process.env.DFIXER_CLOUD_TOKEN) {
    return res.status(400).json({ error: 'Token cloud belum dikonfigurasi pada server. Atur DFIXER_CLOUD_TOKEN sebelum mengaktifkan sinkronisasi.' });
  }

  await run(
    'UPDATE cloud_settings SET enabled = ?, api_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM cloud_settings ORDER BY updated_at DESC LIMIT 1)',
    [nextEnabled, normalizedUrl]
  );

  const status = await getCloudSettings();
  return res.json(status);
}));

app.post('/api/cloud/sync', authMiddleware, requireAsync(async (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Hanya pemilik yang dapat memulai sinkronisasi.' });
  }

  const cloudSettings = await getCloudSettings();
  if (!cloudSettings.enabled) {
    return res.status(400).json({ error: 'Cloud belum diaktifkan.' });
  }
  if (!process.env.DFIXER_CLOUD_TOKEN) {
    return res.status(503).json({ error: 'Token cloud belum dikonfigurasi pada server.' });
  }

  const queued = await all('SELECT * FROM sync_queue WHERE status = ? ORDER BY created_at ASC LIMIT 100', ['queued']);
  if (!queued.length) {
    return res.json({ synced: 0, status: 'idle', queue_count: 0 });
  }

  let endpoint;
  try {
    endpoint = new URL(cloudSettings.api_url);
  } catch {
    return res.status(400).json({ error: 'URL layanan cloud tidak valid.' });
  }
  const requestBody = [];
  try {
    for (const item of queued) {
      requestBody.push({
        event_id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        payload: JSON.parse(item.payload || 'null'),
      });
    }
  } catch {
    return res.status(500).json({ error: 'Payload antrean sinkronisasi rusak; data lokal tidak diubah.' });
  }

  let remoteResponse;
  try {
    remoteResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DFIXER_CLOUD_TOKEN}`,
      },
      body: JSON.stringify({ events: requestBody }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Layanan cloud tidak merespons dalam batas waktu.' : 'Tidak dapat terhubung ke layanan cloud.';
    await run(
      'UPDATE cloud_settings SET last_sync_status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM cloud_settings ORDER BY updated_at DESC LIMIT 1)',
      ['error', message]
    );
    return res.status(502).json({ error: message });
  }

  if (!remoteResponse.ok) {
    const message = `Layanan cloud menolak sinkronisasi (HTTP ${remoteResponse.status}).`;
    await run(
      'UPDATE cloud_settings SET last_sync_status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM cloud_settings ORDER BY updated_at DESC LIMIT 1)',
      ['error', message]
    );
    return res.status(502).json({ error: message });
  }

  let acknowledgement;
  try {
    acknowledgement = await remoteResponse.json();
  } catch {
    return res.status(502).json({ error: 'Respons layanan cloud bukan JSON yang valid; antrean lokal dipertahankan.' });
  }
  if (!Array.isArray(acknowledgement.accepted_ids)
    || acknowledgement.accepted_ids.some((id) => typeof id !== 'string')) {
    return res.status(502).json({ error: 'Respons layanan cloud tidak memiliki daftar accepted_ids yang valid; antrean lokal dipertahankan.' });
  }

  const submittedIds = new Set(queued.map((item) => item.id));
  const acceptedIds = [...new Set(acknowledgement.accepted_ids)].filter((id) => submittedIds.has(id));
  await withDatabaseTransaction(async (tx) => {
    for (const id of acceptedIds) {
      const item = queued.find((entry) => entry.id === id);
      await tx.run('UPDATE sync_queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?', ['synced', id, 'queued']);
      if (item.entity_type === 'transaction') {
        await tx.run('UPDATE transactions SET sync_status = ? WHERE id = ?', ['synced', item.entity_id]);
      }
    }
    const timestamp = new Date().toISOString();
    const queueCount = await tx.get("SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'queued'");
    const syncStatus = Number(queueCount.count) === 0 ? 'synced' : 'partial';
    const lastError = Number(queueCount.count) === 0 ? null : 'Sebagian item belum diakui layanan cloud; sinkronkan kembali untuk mencoba ulang.';
    await tx.run(
      'UPDATE cloud_settings SET last_sync_status = ?, last_sync_at = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM cloud_settings ORDER BY updated_at DESC LIMIT 1)',
      [syncStatus, timestamp, lastError]
    );
  });
  const status = await getCloudSettings();
  return res.json({
    synced: acceptedIds.length,
    status: status.last_sync_status,
    queue_count: status.queue_count,
    last_sync_at: status.last_sync_at,
  });
}));

app.get('/api/settings', authMiddleware, requireAsync(async (req, res) => {
  const settings = await getSettings();
  return res.json(settings);
}));

app.get('/api/system/status', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const integrity = await get('PRAGMA quick_check');
  const databaseStats = fs.statSync(databasePath);
  const { version } = require('./package.json');
  return res.json({
    app_version: version,
    database_status: integrity?.quick_check === 'ok' ? 'healthy' : 'error',
    database_size_bytes: databaseStats.size,
  });
}));

app.put('/api/settings', authMiddleware, requireOwner, requireAsync(async (req, res) => {
  const { business, receipt } = req.body || {};
  let businessValues = null;
  let receiptValues = null;

  if (business) {
    const name = String(business.name || '').trim();
    const address = String(business.address || '').trim();
    const phone = String(business.phone || '').trim();
    const ownerName = String(business.owner_name || '').trim();
    if (!name || name.length > 120 || address.length > 250 || phone.length > 40 || ownerName.length > 120) {
      return res.status(400).json({ error: 'Profil usaha tidak valid.' });
    }
    businessValues = [name, address, phone, ownerName];
  }

  if (receipt) {
    const footer = String(receipt.footer || '').trim();
    if (!['58mm', '80mm'].includes(receipt.paper_width) || footer.length > 250) {
      return res.status(400).json({ error: 'Pengaturan struk tidak valid.' });
    }
    receiptValues = [
      String(business?.name || receipt.business_name || "D'Fixer POS").trim(),
      String(business?.address || receipt.address || '').trim(),
      String(business?.phone || receipt.phone || '').trim(),
      footer,
      receipt.paper_width,
      receipt.print_enabled === false ? 0 : 1,
    ];
  }

  await withDatabaseTransaction(async (tx) => {
    if (businessValues) {
      await tx.run(
        'UPDATE business SET name = ?, address = ?, phone = ?, owner_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM business ORDER BY created_at DESC LIMIT 1)',
        businessValues
      );
    }
    if (receiptValues) {
      await tx.run(
        'UPDATE receipt_settings SET business_name = ?, address = ?, phone = ?, footer = ?, paper_width = ?, print_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM receipt_settings ORDER BY updated_at DESC LIMIT 1)',
        receiptValues
      );
    }
  });
  const nextSettings = await getSettings();
  return res.json(nextSettings);
}));

app.post('/api/print/receipt', authMiddleware, requireAsync(async (req, res) => {
  const { transaction_id } = req.body || {};
  const transaction = req.user.role === 'cashier'
    ? await get('SELECT * FROM transactions WHERE id = ? AND cashier_id = ?', [transaction_id, req.user.userId])
    : await get('SELECT * FROM transactions WHERE id = ?', [transaction_id]);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
  }

  const items = await all('SELECT * FROM transaction_items WHERE transaction_id = ? ORDER BY created_at ASC', [transaction.id]);
  const settings = await getSettings();
  const formatCurrency = (value) => Number(value || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const receiptText = [
    settings.business?.name || "D'Fixer POS",
    settings.business?.address || '',
    settings.business?.phone || '',
    '--------------------------------',
    `Transaksi: ${transaction.receipt_number}`,
    `Waktu: ${new Date(transaction.created_at).toLocaleString('id-ID')}`,
    '--------------------------------',
    ...items.flatMap((item) => [
      item.product_name,
      `${item.quantity} x ${formatCurrency(item.unit_price)}    ${formatCurrency(item.subtotal)}`,
    ]),
    '--------------------------------',
    `Total: ${formatCurrency(transaction.subtotal)}`,
    `Pembayaran: ${formatCurrency(transaction.amount_received)}`,
    `Kembalian: ${formatCurrency(transaction.change_amount)}`,
    '--------------------------------',
    settings.receipt?.footer || 'Terima kasih atas kunjungan Anda',
  ].filter(Boolean).join('\n');

  return res.json({
    ok: true,
    receipt: receiptText,
    printer: settings.receipt?.paper_width || '58mm',
    items: items.length,
  });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint API tidak ditemukan.' }));
app.use((req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.sendFile(path.join(appRoot, 'public', 'index.html'));
  }
  return res.status(404).json({ error: 'Halaman tidak ditemukan.' });
});
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.type === 'entity.parse.failed' ? 400
    : error.type === 'entity.too.large' ? 413
      : Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  const message = status === 400 ? 'Format permintaan tidak valid.'
    : status === 413 ? 'Ukuran permintaan terlalu besar.'
      : 'Terjadi kesalahan internal. Coba lagi atau hubungi pemilik.';
  console.error('Request failed:', error.message);
  return res.status(status).json({ error: message });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`D'Fixer POS running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
