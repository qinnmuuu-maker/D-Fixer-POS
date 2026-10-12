const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { hashPin } = require('../src/logic');

function promptForPin() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Jalankan pemulihan ini dari terminal interaktif.'));
  }

  return new Promise((resolve, reject) => {
    let pin = '';
    const restoreTerminal = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (character) => {
      if (character === '\u0003') {
        restoreTerminal();
        reject(new Error('Pemulihan dibatalkan.'));
      } else if (character === '\r' || character === '\n') {
        restoreTerminal();
        resolve(pin);
      } else if (character === '\u007f' || character === '\b') {
        pin = pin.slice(0, -1);
      } else if (/^\d$/.test(character)) {
        pin += character;
      }
    };

    process.stdout.write('PIN baru pemilik (4-6 angka): ');
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function resetOwnerPin() {
  const pin = await promptForPin();
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN harus terdiri dari 4 sampai 6 angka.');
  }

  const databasePath = path.join(__dirname, '..', 'data', 'dfixer-pos.db');
  const database = new sqlite3.Database(databasePath);
  const credentials = hashPin(pin);

  try {
    const owner = await new Promise((resolve, reject) => {
      database.get(
        "SELECT id FROM users WHERE role = 'owner' AND is_active = 1 ORDER BY created_at ASC LIMIT 1",
        (error, row) => error ? reject(error) : resolve(row)
      );
    });
    if (!owner) {
      throw new Error('Tidak ditemukan akun pemilik aktif.');
    }

    const result = await new Promise((resolve, reject) => {
      database.run(
        'UPDATE users SET pin_hash = ?, pin_salt = ?, failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [credentials.hash, credentials.salt, owner.id],
        function onUpdated(error) {
          if (error) reject(error);
          else resolve(this.changes);
        }
      );
    });
    if (result !== 1) {
      throw new Error('Akun pemilik tidak diperbarui.');
    }
    console.log('PIN pemilik berhasil diatur ulang. Login ulang untuk membuat sesi baru.');
  } finally {
    await new Promise((resolve, reject) => {
      database.close((error) => error ? reject(error) : resolve());
    });
  }
}

resetOwnerPin().catch((error) => {
  console.error('Pemulihan PIN gagal:', error.message);
  process.exitCode = 1;
});
