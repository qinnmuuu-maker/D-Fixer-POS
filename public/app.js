function createClientId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const deviceCode = localStorage.getItem('dfixer-device-code') || createClientId();
localStorage.setItem('dfixer-device-code', deviceCode);

const state = {
  token: localStorage.getItem('dfixer-token') || '',
  user: JSON.parse(localStorage.getItem('dfixer-user') || 'null'),
  products: [],
  categories: [],
  cart: [],
  editingProductId: null,
  transactions: [],
  users: [],
  business: null,
  receipt: null,
  pendingCheckout: null,
  deviceRegistered: false,
};

const refs = {
  loginScreen: document.getElementById('loginScreen'),
  appShell: document.getElementById('appShell'),
  loginForm: document.getElementById('loginForm'),
  loginError: document.getElementById('loginError'),
  userBadge: document.getElementById('userBadge'),
  productGrid: document.getElementById('productGrid'),
  productSearch: document.getElementById('productSearch'),
  cartItems: document.getElementById('cartItems'),
  subtotalValue: document.getElementById('subtotalValue'),
  cashAmount: document.getElementById('cashAmount'),
  changeValue: document.getElementById('changeValue'),
  completeSaleBtn: document.getElementById('completeSaleBtn'),
  clearCartBtn: document.getElementById('clearCartBtn'),
  productName: document.getElementById('productName'),
  productCategory: document.getElementById('productCategory'),
  productPrice: document.getElementById('productPrice'),
  saveProductBtn: document.getElementById('saveProductBtn'),
  cancelProductEditBtn: document.getElementById('cancelProductEditBtn'),
  productList: document.getElementById('productList'),
  categoryName: document.getElementById('categoryName'),
  addCategoryBtn: document.getElementById('addCategoryBtn'),
  categoryList: document.getElementById('categoryList'),
  transactionList: document.getElementById('transactionList'),
  transactionSearch: document.getElementById('transactionSearch'),
  transactionFrom: document.getElementById('transactionFrom'),
  transactionTo: document.getElementById('transactionTo'),
  applyTransactionFilterBtn: document.getElementById('applyTransactionFilterBtn'),
  reportSummary: document.getElementById('reportSummary'),
  reportTable: document.getElementById('reportTable'),
  reportFrom: document.getElementById('reportFrom'),
  reportTo: document.getElementById('reportTo'),
  applyReportFilterBtn: document.getElementById('applyReportFilterBtn'),
  newUserName: document.getElementById('newUserName'),
  newUserFullName: document.getElementById('newUserFullName'),
  newUserRole: document.getElementById('newUserRole'),
  newUserPin: document.getElementById('newUserPin'),
  createUserBtn: document.getElementById('createUserBtn'),
  deviceName: document.getElementById('deviceName'),
  deviceCode: document.getElementById('deviceCode'),
  registerDeviceBtn: document.getElementById('registerDeviceBtn'),
  deviceList: document.getElementById('deviceList'),
  userList: document.getElementById('userList'),
  cloudEnabled: document.getElementById('cloudEnabled'),
  cloudApiUrl: document.getElementById('cloudApiUrl'),
  cloudStatus: document.getElementById('cloudStatus'),
  cloudQueue: document.getElementById('cloudQueue'),
  saveCloudBtn: document.getElementById('saveCloudBtn'),
  syncNowBtn: document.getElementById('syncNowBtn'),
  exportBackupBtn: document.getElementById('exportBackupBtn'),
  restoreBackupBtn: document.getElementById('restoreBackupBtn'),
  backupFileInput: document.getElementById('backupFileInput'),
  backupPassphrase: document.getElementById('backupPassphrase'),
  restorePassphrase: document.getElementById('restorePassphrase'),
  businessName: document.getElementById('businessName'),
  businessAddress: document.getElementById('businessAddress'),
  businessPhone: document.getElementById('businessPhone'),
  receiptFooter: document.getElementById('receiptFooter'),
  receiptWidth: document.getElementById('receiptWidth'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  printTestBtn: document.getElementById('printTestBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
};

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  headers['x-device-code'] = deviceCode;
  if (state.token) {
    headers['x-auth-token'] = state.token;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { error: text };
  }

  if (!response.ok) {
    if (response.status === 401 && state.token) {
      clearLocalSession();
    }
    if (response.status === 403 && data.error?.includes('Perangkat belum terdaftar atau sedang dinonaktifkan')) {
      clearLocalSession();
    }
    throw new Error(data.error || 'Permintaan gagal.');
  }

  return data;
}

function currency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function toggleScreen() {
  refs.loginScreen.classList.toggle('hidden', !!state.user && !!state.token);
  refs.appShell.classList.toggle('hidden', !(state.user && state.token));
}

function updateUserBadge() {
  refs.userBadge.textContent = state.user ? `${state.user.full_name} (${state.user.role})` : 'Belum login';
}

function updateSubtotal() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  refs.subtotalValue.textContent = currency(subtotal);
  const cash = Number(refs.cashAmount.value || 0);
  refs.changeValue.textContent = currency(Math.max(0, cash - subtotal));
}

function renderProducts() {
  const query = refs.productSearch.value.trim().toLowerCase();
  const filtered = state.products.filter((product) => product.is_active && (product.name || '').toLowerCase().includes(query));

  refs.productGrid.innerHTML = filtered.map((product) => `
    <div class="product-card">
      <h5>${escapeHtml(product.name)}</h5>
      <small>${escapeHtml(product.category_name || 'Kategori')}</small>
      <strong>${currency(product.price)}</strong>
      <button data-product-id="${escapeHtml(product.id)}">Tambah</button>
    </div>
  `).join('') || '<p>Produk tidak ditemukan.</p>';

  refs.productGrid.querySelectorAll('button[data-product-id]').forEach((button) => {
    button.addEventListener('click', () => addToCart(button.dataset.productId));
  });
}

function addToCart(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product) return;

  const existing = state.cart.find((entry) => entry.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ ...product, quantity: 1 });
  }
  state.pendingCheckout = null;

  renderCart();
}

function renderCart() {
  if (!state.cart.length) {
    refs.cartItems.innerHTML = '<p>Keranjang masih kosong.</p>';
    refs.cashAmount.value = '';
    updateSubtotal();
    return;
  }

  refs.cartItems.innerHTML = state.cart.map((item) => `
    <div class="cart-item">
      <div class="cart-item-top">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${currency(item.price * item.quantity)}</span>
      </div>
      <div class="qty-control">
        <button class="qty-btn" data-action="minus" data-product-id="${escapeHtml(item.id)}">-</button>
        <span>${item.quantity}</span>
        <button class="qty-btn" data-action="plus" data-product-id="${escapeHtml(item.id)}">+</button>
      </div>
    </div>
  `).join('');

  refs.cartItems.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const productId = button.dataset.productId;
      const item = state.cart.find((entry) => entry.id === productId);
      if (!item) return;

      if (button.dataset.action === 'plus') item.quantity += 1;
      if (button.dataset.action === 'minus') {
        item.quantity -= 1;
        if (item.quantity <= 0) {
          state.cart = state.cart.filter((entry) => entry.id !== productId);
        }
      }
      state.pendingCheckout = null;
      renderCart();
    });
  });

  updateSubtotal();
}

async function loadCategories() {
  state.categories = await request('/api/categories');

  refs.productCategory.innerHTML = state.categories.map((category) => `
    <option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>
  `).join('');
  refs.categoryList.innerHTML = `
    <ul>${state.categories.map((category) => `<li>${escapeHtml(category.name)}</li>`).join('') || '<li>Belum ada kategori.</li>'}</ul>
  `;
}

async function loadProducts() {
  const includeInactive = state.user?.role === 'owner';
  state.products = await request(`/api/products${includeInactive ? '?all=true' : ''}`);
  renderProducts();
  renderProductList();
}

function renderProductList() {
  refs.productList.innerHTML = `
    <table>
      <thead>
        <tr><th>Nama</th><th>Kategori</th><th>Harga</th><th>Status</th><th>Aksi</th></tr>
      </thead>
      <tbody>
        ${state.products.map((product) => `
          <tr>
            <td>${escapeHtml(product.name)}</td>
            <td>${escapeHtml(product.category_name || '-')}</td>
            <td>${currency(product.price)}</td>
            <td>${product.is_active ? 'Aktif' : 'Nonaktif'}</td>
            <td>
              <button class="secondary" data-edit-product="${product.id}">Ubah</button>
              <button class="secondary" data-toggle-product="${product.id}">${product.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  refs.productList.querySelectorAll('[data-edit-product]').forEach((button) => {
    button.addEventListener('click', () => editProduct(button.dataset.editProduct));
  });
  refs.productList.querySelectorAll('[data-toggle-product]').forEach((button) => {
    button.addEventListener('click', () => toggleProduct(button.dataset.toggleProduct));
  });
}

async function saveProduct() {
  const payload = {
    name: refs.productName.value,
    category_id: refs.productCategory.value,
    price: Number(refs.productPrice.value || 0),
  };

  try {
    if (state.editingProductId) {
      const product = state.products.find((entry) => entry.id === state.editingProductId);
      await request(`/api/products/${encodeURIComponent(state.editingProductId)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...payload, is_active: Boolean(product?.is_active) }),
      });
    } else {
      await request('/api/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    clearProductForm();
    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

function editProduct(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product) return;
  state.editingProductId = product.id;
  refs.productName.value = product.name;
  refs.productCategory.value = product.category_id;
  refs.productPrice.value = product.price;
  refs.saveProductBtn.textContent = 'Simpan Perubahan';
  refs.cancelProductEditBtn.classList.remove('hidden');
}

function clearProductForm() {
  state.editingProductId = null;
  refs.productName.value = '';
  refs.productPrice.value = '';
  refs.saveProductBtn.textContent = 'Simpan Produk';
  refs.cancelProductEditBtn.classList.add('hidden');
}

async function toggleProduct(productId) {
  const product = state.products.find((entry) => entry.id === productId);
  if (!product) return;
  try {
    await request(`/api/products/${encodeURIComponent(product.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: product.name,
        category_id: product.category_id,
        price: product.price,
        is_active: !product.is_active,
      }),
    });
    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

async function addCategory() {
  const name = refs.categoryName.value.trim();
  if (!name) {
    alert('Nama kategori wajib diisi.');
    return;
  }
  try {
    await request('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
    refs.categoryName.value = '';
    await loadCategories();
    await loadProducts();
  } catch (error) {
    alert(error.message);
  }
}

async function finalizeTransaction() {
  if (!state.cart.length) {
    alert('Keranjang masih kosong.');
    return;
  }

  const amount = Number(refs.cashAmount.value || 0);
  const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (amount < total) {
    alert('Uang yang diterima belum mencukupi total pembayaran.');
    return;
  }

  const payload = {
    items: state.cart.map((item) => ({ id: item.id, quantity: item.quantity })),
    amount_received: amount,
    payment_method: 'cash',
  };
  const requestFingerprint = JSON.stringify(payload);
  if (state.pendingCheckout?.fingerprint !== requestFingerprint) {
    state.pendingCheckout = { fingerprint: requestFingerprint, key: createClientId() };
  }

  let result;
  try {
    result = await request('/api/transactions', {
      method: 'POST',
      headers: { 'Idempotency-Key': state.pendingCheckout.key },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    alert(error.message);
    return;
  }

  const receiptText = `Transaksi ${result.transaction.receipt_number}\nTotal: ${currency(result.transaction.subtotal)}\nUang diterima: ${currency(result.transaction.amount_received)}\nKembalian: ${currency(result.transaction.change_amount)}`;
  state.cart = [];
  state.pendingCheckout = null;
  refs.cashAmount.value = '';
  renderCart();
  alert(`${receiptText}\n\nTransaksi tersimpan. Struk dapat dicetak ulang dari Riwayat.`);

  try {
    await loadTransactions();
    if (state.user?.role === 'owner' || state.user?.role === 'supervisor') {
      await loadReports();
    }
  } catch (error) {
    alert(`Transaksi tersimpan, tetapi tampilan data gagal diperbarui: ${error.message}`);
  }
}

async function loadTransactions() {
  state.transactions = await request('/api/transactions');
  renderTransactions();
}

function renderTransactions() {
  const receiptQuery = refs.transactionSearch.value.trim().toLowerCase();
  const fromDate = refs.transactionFrom.value ? new Date(`${refs.transactionFrom.value}T00:00:00`) : null;
  const toDate = refs.transactionTo.value ? new Date(`${refs.transactionTo.value}T23:59:59.999`) : null;
  if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
    alert('Rentang tanggal riwayat tidak valid.');
    return;
  }
  if (fromDate && toDate && fromDate > toDate) {
    alert('Tanggal awal tidak boleh melewati tanggal akhir.');
    return;
  }

  const transactions = state.transactions.filter((item) => {
    const createdAt = new Date(item.created_at).getTime();
    return item.receipt_number.toLowerCase().includes(receiptQuery)
      && (!fromDate || createdAt >= fromDate.getTime())
      && (!toDate || createdAt <= toDate.getTime());
  });

  refs.transactionList.innerHTML = `
    <table>
      <thead>
        <tr><th>Nomor</th><th>Waktu</th><th>Total</th><th>Status</th><th>Aksi</th></tr>
      </thead>
      <tbody>
        ${transactions.map((item) => `
          <tr>
            <td>${escapeHtml(item.receipt_number)}</td>
            <td>${new Date(item.created_at).toLocaleString('id-ID')}</td>
            <td>${currency(item.subtotal)}</td>
            <td>${item.status}</td>
            <td>
              <button class="secondary" data-print-transaction="${item.id}">Cetak struk</button>
              ${state.user?.role === 'owner' && item.status === 'completed' ? `<button class="danger" data-cancel-transaction="${item.id}">Batalkan</button>` : ''}
            </td>
          </tr>
        `).join('') || '<tr><td colspan="5">Transaksi tidak ditemukan.</td></tr>'}
      </tbody>
    </table>
  `;

  refs.transactionList.querySelectorAll('[data-print-transaction]').forEach((button) => {
    button.addEventListener('click', () => printReceipt(button.dataset.printTransaction));
  });
  refs.transactionList.querySelectorAll('[data-cancel-transaction]').forEach((button) => {
    button.addEventListener('click', () => cancelTransaction(button.dataset.cancelTransaction));
  });
}

async function loadReports() {
  const fromDate = new Date(`${refs.reportFrom.value}T00:00:00`);
  const toDate = new Date(`${refs.reportTo.value}T23:59:59.999`);
  if (!refs.reportFrom.value || !refs.reportTo.value || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    alert('Pilih rentang tanggal laporan yang valid.');
    return;
  }
  if (fromDate > toDate) {
    alert('Tanggal awal tidak boleh melewati tanggal akhir.');
    return;
  }

  const from = fromDate.toISOString();
  const to = toDate.toISOString();
  const summary = await request(`/api/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const filteredTransactions = state.transactions.filter((item) => {
    const createdAt = new Date(item.created_at).getTime();
    return createdAt >= fromDate.getTime() && createdAt <= toDate.getTime();
  });

  refs.reportSummary.innerHTML = `
    <div class="summary-card"><strong>Order selesai</strong><div>${summary.completed_orders || 0}</div></div>
    <div class="summary-card"><strong>Penjualan bersih</strong><div>${currency(summary.total_sales || 0)}</div></div>
    <div class="summary-card"><strong>Total diterima</strong><div>${currency(summary.total_received || 0)}</div></div>
    <div class="summary-card"><strong>Total kembalian</strong><div>${currency(summary.total_change || 0)}</div></div>
    <div class="summary-card"><strong>Transaksi dibatalkan</strong><div>${summary.cancelled_orders || 0}</div></div>
  `;

  refs.reportTable.innerHTML = `
    <table>
      <thead><tr><th>Nomor</th><th>Waktu</th><th>Total</th><th>Status</th><th>Catatan</th></tr></thead>
      <tbody>
        ${filteredTransactions.map((item) => `
          <tr>
            <td>${escapeHtml(item.receipt_number)}</td>
            <td>${new Date(item.created_at).toLocaleString('id-ID')}</td>
            <td>${currency(item.subtotal)}</td>
            <td>${item.status}</td>
            <td>${item.note ? escapeHtml(item.note) : '-'}</td>
          </tr>
        `).join('') || '<tr><td colspan="5">Tidak ada transaksi pada rentang ini.</td></tr>'}
      </tbody>
    </table>
  `;
}

async function cancelTransaction(transactionId) {
  const note = window.prompt('Masukkan alasan pembatalan transaksi:');
  if (note === null) return;
  if (!note.trim()) {
    alert('Alasan pembatalan wajib diisi.');
    return;
  }
  if (!window.confirm('Transaksi yang dibatalkan tidak dihitung sebagai penjualan. Lanjutkan?')) return;

  try {
    await request(`/api/transactions/${encodeURIComponent(transactionId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ note: note.trim() }),
    });
    await loadTransactions();
    await loadReports();
    alert('Transaksi berhasil dibatalkan.');
  } catch (error) {
    alert(error.message);
  }
}

async function loadUsers() {
  state.users = await request('/api/users');
  refs.userList.innerHTML = `
    <table>
      <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${state.users.map((user) => `
          <tr>
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.full_name)}</td>
            <td>${escapeHtml(user.role)}</td>
            <td>${user.is_active ? 'Aktif' : 'Nonaktif'}</td>
            <td>
              <button class="secondary" data-toggle-user="${escapeHtml(user.id)}">${user.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              <button class="secondary" data-user-role="${escapeHtml(user.id)}">Ubah role</button>
              <button class="secondary" data-user-pin="${escapeHtml(user.id)}">Atur PIN</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  refs.userList.querySelectorAll('[data-toggle-user]').forEach((button) => {
    button.addEventListener('click', () => toggleUser(button.dataset.toggleUser));
  });
  refs.userList.querySelectorAll('[data-user-role]').forEach((button) => {
    button.addEventListener('click', () => updateUserRole(button.dataset.userRole));
  });
  refs.userList.querySelectorAll('[data-user-pin]').forEach((button) => {
    button.addEventListener('click', () => resetUserPin(button.dataset.userPin));
  });
}

async function updateUser(userId, updates) {
  await request(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  if (userId === state.user.id && (updates.role !== undefined || updates.pin !== undefined)) {
    clearLocalSession();
    alert('Perubahan akun diterapkan. Silakan login kembali.');
    return;
  }
  await loadUsers();
}

async function toggleUser(userId) {
  const user = state.users.find((entry) => entry.id === userId);
  if (!user) return;
  if (user.is_active && !window.confirm(`Nonaktifkan akun ${user.username}?`)) return;
  try {
    await updateUser(userId, { is_active: !user.is_active });
  } catch (error) {
    alert(error.message);
  }
}

async function updateUserRole(userId) {
  const user = state.users.find((entry) => entry.id === userId);
  if (!user) return;
  const role = window.prompt('Masukkan role: owner, supervisor, atau cashier', user.role);
  if (role === null) return;
  try {
    await updateUser(userId, { role: role.trim() });
  } catch (error) {
    alert(error.message);
  }
}

async function resetUserPin(userId) {
  const pin = window.prompt('Masukkan PIN baru (4-6 angka).');
  if (pin === null) return;
  try {
    if (userId === state.user.id) {
      await request(`/api/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify({ pin }) });
      clearLocalSession();
      alert('PIN berhasil diperbarui. Silakan login kembali.');
    } else {
      await updateUser(userId, { pin });
      alert('PIN berhasil diperbarui. Pengguna harus login kembali.');
    }
  } catch (error) {
    alert(error.message);
  }
}

async function createUser() {
  try {
    const payload = {
      username: refs.newUserName.value,
      full_name: refs.newUserFullName.value,
      role: refs.newUserRole.value,
      pin: refs.newUserPin.value,
    };

    await request('/api/users', { method: 'POST', body: JSON.stringify(payload) });
    refs.newUserName.value = '';
    refs.newUserFullName.value = '';
    refs.newUserPin.value = '';
    await loadUsers();
    alert('User berhasil dibuat.');
  } catch (error) {
    alert(error.message);
  }
}

async function loadDevices() {
  const devices = await request('/api/devices');
  const currentDevice = devices.find((device) => device.device_code === deviceCode);
  state.currentDeviceId = currentDevice?.id || null;
  refs.deviceList.innerHTML = `
    <table>
      <thead><tr><th>Nama</th><th>Kode</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${devices.map((device) => `
          <tr>
            <td>${escapeHtml(device.device_name)}</td>
            <td>${escapeHtml(device.device_code)}</td>
            <td>${escapeHtml(device.status)}</td>
            <td><button class="secondary" data-toggle-device="${escapeHtml(device.id)}" data-next-status="${device.status === 'registered' ? 'disabled' : 'registered'}">${device.status === 'registered' ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  refs.deviceList.querySelectorAll('[data-toggle-device]').forEach((button) => {
    button.addEventListener('click', () => setDeviceStatus(button.dataset.toggleDevice, button.dataset.nextStatus));
  });
}

async function registerDevice() {
  try {
    const payload = {
      device_name: refs.deviceName.value.trim() || 'Tablet POS',
      device_code: deviceCode,
    };

    await request('/api/devices/register', { method: 'POST', body: JSON.stringify(payload) });
    refs.deviceName.value = '';
    state.deviceRegistered = true;
    localStorage.setItem('dfixer-device-registered', 'true');
    configureRoleUI();
    await loadRoleData();
    alert('Perangkat berhasil didaftarkan.');
  } catch (error) {
    alert(error.message);
  }
}

async function setDeviceStatus(deviceId, status) {
  try {
    await request(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    if (deviceId === state.currentDeviceId) {
      state.deviceRegistered = status === 'registered';
      localStorage.setItem('dfixer-device-registered', String(state.deviceRegistered));
      configureRoleUI();
      await loadRoleData();
    } else {
      await loadDevices();
    }
  } catch (error) {
    alert(error.message);
  }
}

async function loadCloudStatus() {
  const status = await request('/api/cloud/status');
  refs.cloudEnabled.checked = Boolean(status.enabled);
  refs.cloudApiUrl.value = status.api_url || '';
  const configuredLabel = status.configured ? 'Token server tersedia' : 'Token server belum diatur';
  refs.cloudStatus.textContent = `Status: ${status.last_sync_status || 'idle'} · ${configuredLabel}${status.last_sync_at ? ` · ${new Date(status.last_sync_at).toLocaleString('id-ID')}` : ''}${status.last_error ? ` · ${status.last_error}` : ''}`;
  refs.cloudQueue.textContent = status.queue_count > 0 ? `Ada ${status.queue_count} item menunggu pengakuan server.` : 'Antrean kosong.';
}

async function saveCloudSettings() {
  try {
    const payload = {
      enabled: refs.cloudEnabled.checked,
      api_url: refs.cloudApiUrl.value,
    };
    await request('/api/cloud/settings', { method: 'PUT', body: JSON.stringify(payload) });
    await loadCloudStatus();
    alert('Pengaturan cloud berhasil disimpan.');
  } catch (error) {
    alert(error.message);
  }
}

async function syncNow() {
  try {
    const result = await request('/api/cloud/sync', { method: 'POST' });
    await loadCloudStatus();
    alert(`Sinkronisasi: ${result.synced || 0} item diakui server. Sisa antrean: ${result.queue_count || 0}.`);
  } catch (error) {
    alert(error.message);
  }
}

async function exportBackup() {
  const passphrase = refs.backupPassphrase.value;
  if (passphrase.length < 12 || passphrase.length > 256) {
    alert('Kata sandi cadangan harus terdiri dari 12 sampai 256 karakter.');
    return;
  }

  try {
    const backup = await request('/api/backup/export', {
      method: 'POST',
      body: JSON.stringify({ passphrase }),
    });
    const fileName = `dfixer-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    refs.backupPassphrase.value = '';
    alert('Cadangan data berhasil diekspor.');
  } catch (error) {
    alert(error.message);
  }
}

async function restoreBackup() {
  const file = refs.backupFileInput.files?.[0];
  const passphrase = refs.restorePassphrase.value;
  if (!file) {
    alert('Pilih file cadangan terlebih dahulu.');
    return;
  }
  if (passphrase.length < 12 || passphrase.length > 256) {
    alert('Kata sandi cadangan harus terdiri dari 12 sampai 256 karakter.');
    return;
  }

  try {
    const raw = await file.text();
    const backup = JSON.parse(raw);
    const confirmed = window.confirm('Anda yakin ingin memulihkan cadangan ini? Data dengan ID yang sama akan diperbarui dan data lainnya tetap dipertahankan.');
    if (!confirmed) {
      return;
    }

    await request('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify({ confirm_restore: true, backup, passphrase }),
    });

    refs.backupFileInput.value = '';
    refs.restorePassphrase.value = '';
    clearLocalSession();
    alert('Cadangan berhasil dipulihkan. Silakan login kembali.');
  } catch (error) {
    alert(error.message || 'Gagal memulihkan cadangan.');
  }
}

async function loadSettings() {
  const [settings, systemStatus] = await Promise.all([
    request('/api/settings'),
    request('/api/system/status'),
  ]);
  state.business = settings.business;
  state.receipt = settings.receipt;
  refs.businessName.value = state.business?.name || '';
  refs.businessAddress.value = state.business?.address || '';
  refs.businessPhone.value = state.business?.phone || '';
  refs.receiptFooter.value = state.receipt?.footer || '';
  refs.receiptWidth.value = state.receipt?.paper_width || '58mm';
  document.getElementById('systemStatus').textContent =
    `Versi ${systemStatus.app_version} · Database ${systemStatus.database_status} · ${formatBytes(systemStatus.database_size_bytes)}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'ukuran tidak diketahui';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function saveSettings() {
  const payload = {
    business: {
      name: refs.businessName.value,
      address: refs.businessAddress.value,
      phone: refs.businessPhone.value,
      owner_name: 'Pemilik Usaha',
    },
    receipt: {
      footer: refs.receiptFooter.value,
      paper_width: refs.receiptWidth.value,
      print_enabled: true,
    },
  };

  try {
    await request('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
    await loadSettings();
    alert('Pengaturan berhasil disimpan.');
  } catch (error) {
    alert(error.message);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function createReceiptCanvas(receiptText, paperWidth) {
  const paperWidthDots = paperWidth === '80mm' ? 576 : 384;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Perangkat ini tidak mendukung format grafis untuk mencetak struk.');
  }

  const padding = 16;
  const fontSize = 24;
  const lineHeight = 32;
  const maxTextWidth = paperWidthDots - padding * 2;
  context.font = `${fontSize}px monospace`;
  const lines = receiptText.split('\n').flatMap((sourceLine) => {
    const wrapped = [];
    let remaining = sourceLine;
    while (context.measureText(remaining).width > maxTextWidth) {
      let breakAt = remaining.length;
      while (breakAt > 1 && context.measureText(remaining.slice(0, breakAt)).width > maxTextWidth) {
        breakAt -= 1;
      }
      const spaceAt = remaining.lastIndexOf(' ', breakAt);
      if (spaceAt > 0) breakAt = spaceAt;
      wrapped.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    wrapped.push(remaining);
    return wrapped;
  });

  canvas.width = paperWidthDots;
  canvas.height = padding * 2 + lines.length * lineHeight;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  context.font = `${fontSize}px monospace`;
  context.textBaseline = 'top';
  lines.forEach((line, index) => context.fillText(line, padding, padding + index * lineHeight));
  return canvas;
}

function renderPrintDocument(printWindow, receiptText, paperWidth) {
  const width = paperWidth === '80mm' ? '80mm' : '58mm';
  const receiptImage = createReceiptCanvas(receiptText, paperWidth).toDataURL('image/png');

  printWindow.document.write(`<!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>Struk D'Fixer POS</title>
        <style>
          @page { size: ${width} auto; margin: 0; }
          body { width: ${width}; margin: 0; color: #000; }
          img { display: block; width: ${width}; height: auto; }
          @media screen { body { margin: 12px auto; box-shadow: 0 0 6px #999; } }
        </style>
      </head>
      <body><img alt="Struk D'Fixer POS" src="${receiptImage}" /></body>
    </html>`);
  printWindow.document.close();
  const printWhenReady = () => printWindow.requestAnimationFrame(() => {
    printWindow.focus();
    printWindow.print();
  });
  const image = printWindow.document.querySelector('img');
  if (image.complete) printWhenReady();
  else image.addEventListener('load', printWhenReady, { once: true });
}

async function printReceipt(transactionId) {
  const printWindow = window.open('', '_blank', 'width=420,height=640');
  if (!printWindow) {
    alert('Jendela cetak diblokir. Izinkan pop-up untuk mencetak struk.');
    return;
  }
  try {
    const result = await request('/api/print/receipt', {
      method: 'POST',
      body: JSON.stringify({ transaction_id: transactionId }),
    });
    renderPrintDocument(printWindow, result.receipt, result.printer);
  } catch (error) {
    printWindow.close();
    alert(error.message);
  }
}

function printTest() {
  const printWindow = window.open('', '_blank', 'width=420,height=640');
  if (!printWindow) {
    alert('Jendela cetak diblokir. Izinkan pop-up untuk mencetak struk.');
    return;
  }

  const receiptText = [
    refs.businessName.value || "D'Fixer POS",
    refs.businessAddress.value,
    refs.businessPhone.value,
    '--------------------------------',
    'Cetak contoh struk',
    new Date().toLocaleString('id-ID'),
    '--------------------------------',
    'Kopi Susu',
    `1 x ${currency(18000)}    ${currency(18000)}`,
    '--------------------------------',
    `Total: ${currency(18000)}`,
    `Pembayaran: ${currency(20000)}`,
    `Kembalian: ${currency(2000)}`,
    '--------------------------------',
    refs.receiptFooter.value || 'Terima kasih atas kunjungan Anda',
  ].filter(Boolean).join('\n');
  renderPrintDocument(printWindow, receiptText, refs.receiptWidth.value);
}

async function initializeApp() {
  if (window.__dfixerInitialized) {
    return;
  }

  window.__dfixerInitialized = true;

  try {
    const session = await request('/api/session');
    state.deviceRegistered = session.device_registered;
    localStorage.setItem('dfixer-device-registered', String(session.device_registered));
    refs.deviceCode.value = deviceCode;
    if (!refs.deviceName.value) refs.deviceName.value = 'Tablet POS';
    configureRoleUI();
    await loadRoleData();
    refs.cashAmount.addEventListener('input', updateSubtotal);
    refs.cashAmount.addEventListener('input', () => { state.pendingCheckout = null; });
    refs.productSearch.addEventListener('input', renderProducts);
    refs.applyTransactionFilterBtn.addEventListener('click', renderTransactions);
    refs.applyReportFilterBtn.addEventListener('click', loadReports);
    refs.completeSaleBtn.addEventListener('click', finalizeTransaction);
    refs.clearCartBtn.addEventListener('click', () => {
      state.cart = [];
      state.pendingCheckout = null;
      renderCart();
    });
    refs.saveProductBtn.addEventListener('click', saveProduct);
    refs.cancelProductEditBtn.addEventListener('click', clearProductForm);
    refs.addCategoryBtn.addEventListener('click', addCategory);
    refs.createUserBtn.addEventListener('click', createUser);
    refs.registerDeviceBtn.addEventListener('click', registerDevice);
    refs.saveCloudBtn.addEventListener('click', saveCloudSettings);
    refs.syncNowBtn.addEventListener('click', syncNow);
    refs.exportBackupBtn.addEventListener('click', exportBackup);
    refs.restoreBackupBtn.addEventListener('click', restoreBackup);
    refs.saveSettingsBtn.addEventListener('click', saveSettings);
    refs.printTestBtn.addEventListener('click', printTest);
    refs.logoutBtn.addEventListener('click', () => {
      request('/api/logout', { method: 'POST' }).catch((error) => console.error('Logout request failed', error));
      clearLocalSession();
    });

    document.querySelectorAll('.nav-btn').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.panel').forEach((panel) => {
          panel.classList.add('hidden');
          panel.classList.remove('active');
        });
        button.classList.add('active');
        const target = document.getElementById(button.dataset.target);
        target.classList.remove('hidden');
        target.classList.add('active');
      });
    });
  } catch (error) {
    console.error('Initialization failed', error);
    alert(`Gagal memuat aplikasi: ${error.message}`);
    state.token = '';
    state.user = null;
    localStorage.removeItem('dfixer-token');
    localStorage.removeItem('dfixer-user');
    toggleScreen();
    window.__dfixerInitialized = false;
  }
}

function clearLocalSession() {
  state.token = '';
  state.user = null;
  state.deviceRegistered = false;
  state.cart = [];
  state.pendingCheckout = null;
  window.__dfixerInitialized = false;
  localStorage.removeItem('dfixer-token');
  localStorage.removeItem('dfixer-user');
  localStorage.removeItem('dfixer-device-registered');
  renderCart();
  toggleScreen();
}

async function loadRoleData() {
  if (!state.deviceRegistered) {
    await loadDevices();
    return;
  }

  await loadCategories();
  await loadProducts();
  await loadTransactions();
  if (state.user?.role === 'owner' || state.user?.role === 'supervisor') {
    await loadReports();
  }
  if (state.user?.role === 'owner') {
    await loadUsers();
    await loadDevices();
    await loadCloudStatus();
    await loadSettings();
  }
}

function configureRoleUI() {
  let allowedPanels = {
    owner: ['cashier', 'products', 'transactions', 'reports', 'accounts', 'cloud', 'backup', 'settings'],
    supervisor: ['transactions', 'reports'],
    cashier: ['cashier', 'transactions'],
  }[state.user?.role] || ['cashier'];
  if (state.user?.role === 'owner' && !state.deviceRegistered) {
    allowedPanels = ['accounts'];
  }
  document.querySelector('.account-management')?.classList.toggle('hidden', !state.deviceRegistered);

  document.querySelectorAll('.nav-btn').forEach((button) => button.classList.remove('active'));
  document.querySelectorAll('.nav-btn[data-target]').forEach((button) => {
    button.classList.toggle('hidden', !allowedPanels.includes(button.dataset.target));
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    const allowed = allowedPanels.includes(panel.id);
    panel.classList.toggle('hidden', !allowed);
    panel.classList.toggle('active', false);
  });

  const defaultPanel = !state.deviceRegistered && state.user?.role === 'owner'
    ? 'accounts'
    : state.user?.role === 'supervisor' ? 'reports' : 'cashier';
  const selectedPanel = allowedPanels.includes(defaultPanel) ? defaultPanel : allowedPanels[0];
  document.querySelector(`.nav-btn[data-target="${selectedPanel}"]`)?.classList.add('active');
  document.getElementById(selectedPanel)?.classList.add('active');
}

function setDefaultReportDates() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDateInput = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  refs.reportFrom.value = toDateInput(firstDay);
  refs.reportTo.value = toDateInput(now);
}

refs.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  refs.loginError.classList.add('hidden');
  refs.loginError.textContent = '';

  const username = document.getElementById('username').value;
  const pin = document.getElementById('pin').value;

  try {
    const result = await request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, pin, device_code: deviceCode }),
    });

    state.token = result.token;
    state.user = result.user;
    state.deviceRegistered = result.device_registered;
    localStorage.setItem('dfixer-token', result.token);
    localStorage.setItem('dfixer-user', JSON.stringify(result.user));
    localStorage.setItem('dfixer-device-registered', String(result.device_registered));
    updateUserBadge();
    toggleScreen();
    await initializeApp();
  } catch (error) {
    refs.loginError.textContent = error.message;
    refs.loginError.classList.remove('hidden');
  }
});

function bootstrap() {
  setDefaultReportDates();
  updateUserBadge();
  toggleScreen();
  if (state.user && state.token) {
    initializeApp();
  }
}

bootstrap();
