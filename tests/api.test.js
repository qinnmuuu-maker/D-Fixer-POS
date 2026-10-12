const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');

test('POS API enforces roles and persists transaction, cancellation, and encrypted backup flows', { timeout: 30000 }, async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfixer-api-test-'));
  const appDir = path.join(tempDir, 'app');
  fs.mkdirSync(path.join(appDir, 'public'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'server.js'), path.join(appDir, 'server.js'));
  fs.copyFileSync(path.join(__dirname, '..', 'package.json'), path.join(appDir, 'package.json'));
  fs.cpSync(path.join(__dirname, '..', 'public'), path.join(appDir, 'public'), { recursive: true });

  const portServer = net.createServer();
  await new Promise((resolve, reject) => {
    portServer.once('error', reject);
    portServer.listen(0, '127.0.0.1', resolve);
  });
  const { port } = portServer.address();
  await new Promise((resolve) => portServer.close(resolve));

  let rejectCloudRequests = false;
  const cloudServer = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      if (request.headers.authorization !== 'Bearer integration-test-cloud-token') {
        response.writeHead(401, { 'Content-Type': 'application/json' }).end('{}');
        return;
      }
      if (rejectCloudRequests) {
        response.writeHead(503, { 'Content-Type': 'application/json' }).end('{}');
        return;
      }
      const payload = JSON.parse(body);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ accepted_ids: payload.events.map((event) => event.event_id) }));
    });
  });
  await new Promise((resolve) => cloudServer.listen(0, '127.0.0.1', resolve));
  const cloudUrl = `http://127.0.0.1:${cloudServer.address().port}/api/sync/batch`;

  const child = spawn(process.execPath, ['server.js'], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_PATH: path.join(__dirname, '..', 'node_modules'),
      PORT: String(port),
      DFIXER_CLOUD_TOKEN: 'integration-test-cloud-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    await new Promise((resolve) => cloudServer.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deviceCode = 'api-test-device-0001';
  const waitUntilReady = async () => {
    const deadline = Date.now() + 10000;
    let lastConnectionError;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Test server exited early: ${serverOutput}`);
      try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (response.ok) return;
      } catch (error) {
        lastConnectionError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Test server did not become ready: ${serverOutput}; ${lastConnectionError?.message || 'no connection response'}`);
  };
  await waitUntilReady();

  const api = async (route, { method = 'GET', body, token, headers = {}, expected = 200 } = {}) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { 'x-auth-token': token } : {}),
        'x-device-code': deviceCode,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
    return data;
  };
  const login = async (username, pin) => (await api('/api/login', {
    method: 'POST',
    body: { username, pin, device_code: deviceCode },
  })).token;
  let owner = await login('owner', '123456');
  await api('/api/session', { token: owner });
  await api('/api/categories', { token: owner, expected: 403 });
  await api('/api/devices/register', {
    token: owner,
    method: 'POST',
    body: { device_name: 'Tablet Uji', device_code: deviceCode },
    expected: 201,
  });
  const systemStatus = await api('/api/system/status', { token: owner });
  assert.equal(systemStatus.database_status, 'healthy');
  await api('/api/cloud/settings', {
    token: owner,
    method: 'PUT',
    body: { enabled: 'yes', api_url: cloudUrl },
    expected: 400,
  });
  await api('/api/cloud/settings', {
    token: owner,
    method: 'PUT',
    body: { enabled: true, api_url: cloudUrl },
  });

  await api('/api/users', { token: owner, method: 'POST', body: {
    username: 'cashier_test',
    full_name: 'Kasir Uji',
    role: 'cashier',
    pin: '654321',
  }, expected: 201 });
  let cashier = await login('cashier_test', '654321');
  await api('/api/users', { token: cashier, expected: 403 });
  await api('/api/products?all=true', { token: cashier, expected: 403 });

  const products = await api('/api/products', { token: cashier });
  const product = products[0];
  const idempotencyKey = 'api-test-transaction-retry';
  const sale = { items: [{ id: product.id, quantity: 2 }], amount_received: product.price * 2, payment_method: 'cash' };
  const first = await api('/api/transactions', {
    token: cashier,
    method: 'POST',
    body: sale,
    headers: { 'Idempotency-Key': idempotencyKey },
    expected: 201,
  });
  const retry = await api('/api/transactions', {
    token: cashier,
    method: 'POST',
    body: sale,
    headers: { 'Idempotency-Key': idempotencyKey },
    expected: 201,
  });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.transaction.id, first.transaction.id);
  assert.equal((await api('/api/transactions', { token: cashier })).length, 1);

  rejectCloudRequests = true;
  await api('/api/cloud/sync', { token: owner, method: 'POST', expected: 502 });
  assert.equal((await api('/api/cloud/status', { token: owner })).queue_count, 1);
  rejectCloudRequests = false;
  const syncResult = await api('/api/cloud/sync', { token: owner, method: 'POST' });
  assert.equal(syncResult.synced, 1);
  assert.equal(syncResult.queue_count, 0);
  assert.equal((await api('/api/transactions', { token: owner }))[0].sync_status, 'synced');

  const from = encodeURIComponent(first.transaction.created_at);
  const reportBefore = await api(`/api/reports/summary?from=${from}&to=${from}`, { token: owner });
  assert.equal(reportBefore.completed_orders, 1);
  assert.equal(reportBefore.total_sales, product.price * 2);
  await api(`/api/transactions/${first.transaction.id}/cancel`, {
    token: owner,
    method: 'POST',
    body: { note: 'Pembatalan uji integrasi' },
  });
  await api(`/api/transactions/${first.transaction.id}/cancel`, {
    token: owner,
    method: 'POST',
    body: { note: 'Pembatalan kedua' },
    expected: 409,
  });
  const reportAfter = await api(`/api/reports/summary?from=${from}&to=${from}`, { token: owner });
  assert.equal(reportAfter.completed_orders, 0);
  assert.equal(reportAfter.total_sales, 0);
  assert.equal(reportAfter.cancelled_orders, 1);

  const settingsBeforeInvalidUpdate = await api('/api/settings', { token: owner });
  await api('/api/settings', {
    token: owner,
    method: 'PUT',
    body: {
      business: { name: 'Nama yang tidak boleh tersimpan' },
      receipt: { paper_width: 'invalid', footer: '' },
    },
    expected: 400,
  });
  assert.equal((await api('/api/settings', { token: owner })).business.name, settingsBeforeInvalidUpdate.business.name);

  const ownerSale = await api('/api/transactions', {
    token: owner,
    method: 'POST',
    body: { items: [{ id: product.id, quantity: 1 }], amount_received: product.price, payment_method: 'cash' },
    headers: { 'Idempotency-Key': 'api-test-owner-sale' },
    expected: 201,
  });
  const ownReceipt = await api('/api/print/receipt', {
    token: cashier,
    method: 'POST',
    body: { transaction_id: first.transaction.id },
  });
  assert.match(ownReceipt.receipt, new RegExp(first.transaction.receipt_number));
  await api('/api/print/receipt', {
    token: cashier,
    method: 'POST',
    body: { transaction_id: ownerSale.transaction.id },
    expected: 404,
  });

  const backup = await api('/api/backup/export', {
    token: owner,
    method: 'POST',
    body: { passphrase: 'kata-sandi-uji-yang-kuat' },
  });
  assert.equal(backup.format, 'dfixer-pos-encrypted-backup');
  assert.equal(JSON.stringify(backup).includes('pin_hash'), false);
  await api('/api/users/not-an-id', {
    token: owner,
    method: 'PUT',
    body: { pin: '12' },
    expected: 404,
  });
  await api('/api/backup/import', {
    token: owner,
    method: 'POST',
    body: { confirm_restore: true, backup, passphrase: 'kata-sandi-salah-panjang' },
    expected: 400,
  });
  const restored = await api('/api/backup/import', {
    token: owner,
    method: 'POST',
    body: { confirm_restore: true, backup, passphrase: 'kata-sandi-uji-yang-kuat' },
  });
  assert.equal(restored.restored.transactions, 2);
  assert.equal(restored.requires_relogin, true);
  await api('/api/system/status', { token: owner, expected: 401 });
  await api('/api/transactions', { token: cashier, expected: 401 });
  owner = await login('owner', '123456');
  cashier = await login('cashier_test', '654321');

  await api('/api/reports/summary?from=not-a-date&to=not-a-date', { token: owner, expected: 400 });

  const devices = await api('/api/devices', { token: owner });
  await api(`/api/devices/${devices[0].id}`, {
    token: owner,
    method: 'PUT',
    body: { status: 'disabled' },
  });
  await api('/api/products', { token: cashier, expected: 403 });
  await api(`/api/devices/${devices[0].id}`, {
    token: owner,
    method: 'PUT',
    body: { status: 'registered' },
  });
  await api('/api/products', { token: cashier });
  await api('/api/logout', { token: cashier, method: 'POST' });
  await api('/api/products', { token: cashier, expected: 401 });
});
