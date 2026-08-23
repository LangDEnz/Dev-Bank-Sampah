const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const path       = require('path');
const db         = require('./database/db');

const app    = express();
const PORT   = 3000;
const SECRET = 'banksampah_secret_key_2026';

// =============================================
// MIDDLEWARE
// =============================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token tidak valid' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'Administrator') return res.status(403).json({ error: 'Akses Administrator diperlukan' });
  next();
}

// Generate kode otomatis
function generateKode(prefix, id) {
  return `${prefix}${String(id).padStart(3, '0')}`;
}

// =============================================
// AUTH ROUTES
// =============================================

// POST /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username dan password wajib diisi' });

  db.get('SELECT * FROM users WHERE username = ? AND aktif = 1', [username], async (err, user) => {
    if (err)   return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Username atau password salah' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Username atau password salah' });

    const token = jwt.sign(
      { id: user.id, username: user.username, nama: user.nama, role: user.role },
      SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, nama: user.nama, role: user.role } });
  });
});

// GET /api/me
app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/me
app.put('/api/me', authMiddleware, (req, res) => {
  const { nama, password } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama wajib diisi' });
  if (password !== undefined && password.length > 0 && password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  const updateUser = (hashedPassword) => {
    const sql = hashedPassword
      ? 'UPDATE users SET nama=?, password=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
      : 'UPDATE users SET nama=?, updated_at=CURRENT_TIMESTAMP WHERE id=?';
    const params = hashedPassword ? [nama.trim(), hashedPassword, req.user.id] : [nama.trim(), req.user.id];
    db.run(sql, params, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      const user = { id: req.user.id, username: req.user.username, nama: nama.trim(), role: req.user.role };
      const token = jwt.sign(user, SECRET, { expiresIn: '8h' });
      res.json({ message: 'Akun berhasil diperbarui', token, user });
    });
  };

  if (password && password.length > 0) {
    bcrypt.hash(password, 10).then(updateUser).catch(err => res.status(500).json({ error: err.message }));
  } else {
    updateUser(null);
  }
});

// GET /api/users
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  db.all('SELECT id, username, nama, role, aktif FROM users ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// POST /api/users
app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const { username, nama, password, role = 'Petugas' } = req.body;
  const roles = ['Administrator', 'Petugas', 'Nasabah'];
  if (!username || !nama || !password) return res.status(400).json({ error: 'Username, nama, dan password wajib diisi' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  if (!roles.includes(role)) return res.status(400).json({ error: 'Role tidak valid' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, password, nama, role) VALUES (?, ?, ?, ?)',
      [username.trim(), hashedPassword, nama.trim(), role],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username sudah digunakan' });
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'Pengguna berhasil ditambahkan', id: this.lastID });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id
app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Akun yang sedang digunakan tidak dapat dihapus' });
  }
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    res.json({ message: 'Pengguna berhasil dihapus' });
  });
});

// =============================================
// NASABAH ROUTES
// =============================================

function syncNasabahStatus(callback) {
  db.run(
    `UPDATE nasabah
     SET status = CASE
       WHEN EXISTS (
         SELECT 1 FROM transaksi t
         WHERE t.nasabah_id = nasabah.id
           AND t.status = 'Selesai'
           AND t.tanggal >= date('now', '-1 month')
       ) THEN 'Aktif'
       WHEN created_at < datetime('now', '-1 month') THEN 'Tidak Aktif'
       ELSE status
     END,
     updated_at = CURRENT_TIMESTAMP
     WHERE status IN ('Aktif', 'Tidak Aktif')`,
    callback
  );
}

// GET /api/nasabah
app.get('/api/nasabah', authMiddleware, (req, res) => {
  syncNasabahStatus((syncErr) => {
    if (syncErr) return res.status(500).json({ error: syncErr.message });
    const { q, status } = req.query;
    let sql    = 'SELECT * FROM nasabah WHERE 1=1';
    const params = [];

    if (q) {
      sql += ' AND (nama LIKE ? OR kode LIKE ? OR telepon LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY kode ASC';

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: rows, total: rows.length });
    });
  });
});

// GET /api/nasabah/setoran-minggu-ini
app.get('/api/nasabah/setoran-minggu-ini', authMiddleware, (req, res) => {
  db.all(
    `SELECT nasabah_id, COUNT(*) as total
     FROM transaksi
     WHERE status='Selesai'
       AND tanggal >= date('now', '-' || ((strftime('%w','now') + 6) % 7) || ' days')
     GROUP BY nasabah_id`,
    [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: rows });
    }
  );
});

// GET /api/nasabah/stats
app.get('/api/nasabah/stats', authMiddleware, (req, res) => {
  syncNasabahStatus((syncErr) => {
    if (syncErr) return res.status(500).json({ error: syncErr.message });
    db.get(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status='Aktif' THEN 1 ELSE 0 END) as aktif,
              SUM(CASE WHEN created_at >= date('now', 'start of month') THEN 1 ELSE 0 END) as baru_bulan_ini,
              SUM(CASE WHEN status='Tidak Aktif' THEN 1 ELSE 0 END) as tidak_aktif
       FROM nasabah`,
      [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: row || { total: 0, aktif: 0, baru_bulan_ini: 0, tidak_aktif: 0 } });
      }
    );
  });
});

// GET /api/nasabah/:id
app.get('/api/nasabah/:id', authMiddleware, (req, res) => {
  db.get('SELECT * FROM nasabah WHERE id = ?', [req.params.id], (err, row) => {
    if (err)  return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Nasabah tidak ditemukan' });
    res.json({ data: row });
  });
});

// POST /api/nasabah
app.post('/api/nasabah', authMiddleware, (req, res) => {
  const { nama, telepon, alamat, saldo = 0, poin = 0, status = 'Aktif' } = req.body;
  if (!nama) return res.status(400).json({ error: 'Nama wajib diisi' });

  db.get("SELECT COALESCE(MAX(CAST(REPLACE(kode, 'NK.', '') AS INTEGER)), 0) + 1 as next FROM nasabah", [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const kode = `NK.${String(row.next).padStart(3, '0')}`;

    db.run(
      `INSERT INTO nasabah (kode, nama, telepon, alamat, saldo, poin, status) VALUES (?,?,?,?,?,?,?)`,
      [kode, nama, telepon, alamat, saldo, poin, status],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Nasabah berhasil ditambahkan', id: this.lastID, kode });
      }
    );
  });
});

// PUT /api/nasabah/:id
app.put('/api/nasabah/:id', authMiddleware, (req, res) => {
  const { nama, telepon, alamat, saldo, poin, status } = req.body;
  db.run(
    `UPDATE nasabah SET nama=?, telepon=?, alamat=?, saldo=?, poin=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [nama, telepon, alamat, saldo, poin, status, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Nasabah tidak ditemukan' });
      res.json({ message: 'Nasabah berhasil diperbarui' });
    }
  );
});

// DELETE /api/nasabah/:id
app.delete('/api/nasabah/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM nasabah WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Nasabah tidak ditemukan' });
    res.json({ message: 'Nasabah berhasil dihapus' });
  });
});

// =============================================
// JENIS SAMPAH / HARGA ROUTES
// =============================================

// GET /api/jenis-sampah
app.get('/api/jenis-sampah', authMiddleware, (req, res) => {
  db.all('SELECT * FROM jenis_sampah ORDER BY nama', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// PUT /api/jenis-sampah/:id
app.put('/api/jenis-sampah/:id', authMiddleware, (req, res) => {
  const { harga_kg, poin_kg, aktif } = req.body;
  db.run(
    `UPDATE jenis_sampah SET harga_kg=?, poin_kg=?, aktif=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [harga_kg, poin_kg, aktif, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Harga berhasil diperbarui' });
    }
  );
});

// POST /api/jenis-sampah
app.post('/api/jenis-sampah', authMiddleware, (req, res) => {
  const { nama, ikon = '♻️', kategori = 'Anorganik', harga_kg, poin_kg = 1 } = req.body;
  if (!nama || !harga_kg) return res.status(400).json({ error: 'Nama dan harga wajib diisi' });

  db.run(
    `INSERT INTO jenis_sampah (nama, ikon, kategori, harga_kg, poin_kg) VALUES (?,?,?,?,?)`,
    [nama, ikon, kategori, harga_kg, poin_kg],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Jenis sampah berhasil ditambahkan', id: this.lastID });
    }
  );
});

// =============================================
// TRANSAKSI ROUTES
// =============================================

// GET /api/transaksi
app.get('/api/transaksi', authMiddleware, (req, res) => {
  const { q, jenis, status, dari, sampai } = req.query;
  let sql = `
    SELECT t.*, n.nama as nasabah_nama, n.kode as nasabah_kode,
           j.nama as jenis_nama, j.ikon as jenis_ikon
    FROM transaksi t
    JOIN nasabah n ON t.nasabah_id = n.id
    JOIN jenis_sampah j ON t.jenis_id = j.id
    WHERE 1=1
  `;
  const params = [];

  if (q) {
    sql += ' AND (n.nama LIKE ? OR t.kode LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (jenis) {
    sql += ' AND j.nama = ?';
    params.push(jenis);
  }
  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  if (dari) {
    sql += ' AND t.tanggal >= ?';
    params.push(dari);
  }
  if (sampai) {
    sql += ' AND t.tanggal <= ?';
    params.push(sampai);
  }
  sql += ' ORDER BY t.id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows, total: rows.length });
  });
});

// GET /api/transaksi/:id
app.get('/api/transaksi/:id', authMiddleware, (req, res) => {
  const sql = `
    SELECT t.*, n.nama as nasabah_nama, n.kode as nasabah_kode,
           j.nama as jenis_nama, j.ikon as jenis_ikon
    FROM transaksi t
    JOIN nasabah n ON t.nasabah_id = n.id
    JOIN jenis_sampah j ON t.jenis_id = j.id
    WHERE t.id = ?
  `;
  db.get(sql, [req.params.id], (err, row) => {
    if (err)  return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    res.json({ data: row });
  });
});

// POST /api/transaksi
app.post('/api/transaksi', authMiddleware, (req, res) => {
  const { nasabah_id, jenis_id, berat_kg, catatan, tanggal } = req.body;
  if (!nasabah_id || !jenis_id || !berat_kg || !tanggal)
    return res.status(400).json({ error: 'Data tidak lengkap' });

  // Ambil harga jenis sampah
  db.get('SELECT * FROM jenis_sampah WHERE id = ? AND aktif = 1', [jenis_id], (err, jenis) => {
    if (err || !jenis) return res.status(400).json({ error: 'Jenis sampah tidak valid' });

    const harga_kg   = jenis.harga_kg;
    const total      = harga_kg * berat_kg;
    const poin_dapat = Math.floor(jenis.poin_kg * berat_kg);

    db.get("SELECT COALESCE(MAX(CAST(REPLACE(kode, 'TR', '') AS INTEGER)), 0) + 1 as next FROM transaksi", [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const kode = generateKode('TR', row.next);

      db.run(
        `INSERT INTO transaksi (kode, nasabah_id, jenis_id, berat_kg, harga_kg, total, poin_dapat, catatan, tanggal)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [kode, nasabah_id, jenis_id, berat_kg, harga_kg, total, poin_dapat, catatan, tanggal],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });

          // Update saldo & poin nasabah
          db.run(
            `UPDATE nasabah SET saldo = saldo + ?, poin = poin + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [total, poin_dapat, nasabah_id]
          );

          db.run(`UPDATE nasabah SET status='Aktif', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [nasabah_id]);

          res.status(201).json({ message: 'Transaksi berhasil disimpan', id: this.lastID, kode, total, poin_dapat });
        }
      );
    });
  });
});

// POST /api/transaksi/batch
app.post('/api/transaksi/batch', authMiddleware, async (req, res) => {
  const { nasabah_id, tanggal, catatan, items = [], lainnya } = req.body;
  if (!nasabah_id || !tanggal || (!items.length && !(lainnya && lainnya.berat_kg))) {
    return res.status(400).json({ error: 'Nasabah, tanggal, dan minimal satu berat wajib diisi' });
  }

  try {
    const jenisRows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM jenis_sampah WHERE aktif = 1', [], (err, rows) => err ? reject(err) : resolve(rows));
    });
    const validItems = items
      .map(item => ({ jenis: jenisRows.find(row => row.id === Number(item.jenis_id)), berat: Number(item.berat_kg) }))
      .filter(item => item.jenis && item.berat > 0);

    if (lainnya && Number(lainnya.berat_kg) > 0 && lainnya.jenis &&
        ((Number(lainnya.total) || 0) > 0 || (Number(lainnya.harga_kg) || 0) > 0)) {
      const beratLainnya = Number(lainnya.berat_kg);
      const totalManual  = Number(lainnya.total) || 0;
      const hargaPerKg   = Number(lainnya.harga_kg) || 0;
      // Harga/kg acuan utk catatan jenis: pakai harga_kg bila ada, kalau hanya total -> rata-rata
      const hargaAcuan   = hargaPerKg > 0 ? hargaPerKg : totalManual / beratLainnya;

      let lainnyaJenis = jenisRows.find(row => row.nama === lainnya.jenis);
      if (!lainnyaJenis) {
        lainnyaJenis = await new Promise((resolve, reject) => db.get(
          'SELECT * FROM jenis_sampah WHERE nama = ?', [lainnya.jenis], (err, row) => err ? reject(err) : resolve(row)
        ));
      }
      if (!lainnyaJenis) {
        const result = await new Promise((resolve, reject) => db.run(
          `INSERT INTO jenis_sampah (nama, ikon, kategori, harga_kg, poin_kg, aktif) VALUES (?, '♻️', 'Lainnya', ?, 1, 1)`,
          [lainnya.jenis, hargaAcuan],
          function(err) { err ? reject(err) : resolve({ id: this.lastID }); }
        ));
        lainnyaJenis = { id: result.id, nama: lainnya.jenis, harga_kg: hargaAcuan, poin_kg: 1 };
      } else {
        await new Promise((resolve, reject) => db.run(
          `UPDATE jenis_sampah SET harga_kg=?, aktif=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [hargaAcuan, lainnyaJenis.id], err => err ? reject(err) : resolve()
        ));
        lainnyaJenis.harga_kg = hargaAcuan;
      }
      validItems.push({
        jenis: lainnyaJenis,
        berat: beratLainnya, lainnya: true,
        totalOverride: totalManual > 0 ? totalManual : null
      });
    }
    if (!validItems.length) return res.status(400).json({ error: 'Minimal satu berat harus lebih dari 0' });

    const nextId = await new Promise((resolve, reject) => {
      db.get("SELECT COALESCE(MAX(CAST(REPLACE(kode, 'TR', '') AS INTEGER)), 0) as maks FROM transaksi", [], (err, row) => err ? reject(err) : resolve(row.maks));
    });
    const nasabah = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM nasabah WHERE id = ?', [nasabah_id], (err, row) => err ? reject(err) : resolve(row));
    });
    if (!nasabah) return res.status(404).json({ error: 'Nasabah tidak ditemukan' });

    await new Promise((resolve, reject) => db.run('BEGIN TRANSACTION', err => err ? reject(err) : resolve()));
    let sequence = nextId;
    let totalSaldo = 0;
    for (const item of validItems) {
      const total = item.totalOverride != null ? item.totalOverride : item.berat * item.jenis.harga_kg;
      const kode = generateKode('TR', ++sequence);
      await new Promise((resolve, reject) => db.run(
        `INSERT INTO transaksi (kode, nasabah_id, jenis_id, berat_kg, harga_kg, total, poin_dapat, catatan, tanggal)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [kode, nasabah_id, item.jenis.id, item.berat, item.jenis.harga_kg, total,
          Math.floor(item.jenis.poin_kg * item.berat), catatan, tanggal],
        err => err ? reject(err) : resolve()
      ));
      totalSaldo += total;
    }
    await new Promise((resolve, reject) => db.run('UPDATE nasabah SET saldo = saldo + ?, status = \'Aktif\', updated_at=CURRENT_TIMESTAMP WHERE id=?', [totalSaldo, nasabah_id], err => err ? reject(err) : resolve()));
    await new Promise((resolve, reject) => db.run('COMMIT', err => err ? reject(err) : resolve()));
    res.status(201).json({ message: 'Setoran berhasil disimpan', total: totalSaldo, jumlah: validItems.length });
  } catch (err) {
    db.run('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/transaksi/:id/status
app.put('/api/transaksi/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  db.run(
    `UPDATE transaksi SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [status, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
      res.json({ message: 'Status transaksi diperbarui' });
    }
  );
});

// DELETE /api/transaksi/batch
app.delete('/api/transaksi/batch', authMiddleware, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Transaksi tidak dipilih' });
  const placeholders = ids.map(() => '?').join(',');

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.all(`SELECT nasabah_id, SUM(total) as total FROM transaksi WHERE id IN (${placeholders}) GROUP BY nasabah_id`, ids, (err, rows) => {
      if (err) return db.run('ROLLBACK', () => res.status(500).json({ error: err.message }));
      db.run(`DELETE FROM transaksi WHERE id IN (${placeholders})`, ids, function(deleteErr) {
        if (deleteErr) return db.run('ROLLBACK', () => res.status(500).json({ error: deleteErr.message }));
        const deletedCount = this.changes;
        rows.forEach(row => db.run('UPDATE nasabah SET saldo = MAX(0, saldo - ?), updated_at=CURRENT_TIMESTAMP WHERE id=?', [row.total, row.nasabah_id]));
        db.run('COMMIT', commitErr => {
          if (commitErr) return res.status(500).json({ error: commitErr.message });
          res.json({ message: `${deletedCount} setoran dihapus`, deletedCount });
        });
      });
    });
  });
});

// DELETE /api/transaksi/:id
app.delete('/api/transaksi/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM transaksi WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    res.json({ message: 'Transaksi dihapus' });
  });
});

// =============================================
// PENARIKAN ROUTES
// =============================================

// GET /api/penarikan
app.get('/api/penarikan', authMiddleware, (req, res) => {
  const sql = `
    SELECT p.*, n.nama as nasabah_nama, n.kode as nasabah_kode
    FROM penarikan p
    JOIN nasabah n ON p.nasabah_id = n.id
    ORDER BY p.id DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// POST /api/penarikan
app.post('/api/penarikan', authMiddleware, (req, res) => {
  const { nasabah_id, jumlah, metode = 'Tunai', catatan, tanggal } = req.body;
  if (!nasabah_id || !jumlah || !tanggal)
    return res.status(400).json({ error: 'Data tidak lengkap' });

  // Cek saldo
  db.get('SELECT saldo FROM nasabah WHERE id = ?', [nasabah_id], (err, nasabah) => {
    if (err || !nasabah) return res.status(400).json({ error: 'Nasabah tidak ditemukan' });
    if (nasabah.saldo < jumlah) return res.status(400).json({ error: 'Saldo tidak mencukupi' });

    db.get("SELECT COALESCE(MAX(CAST(REPLACE(kode, 'WD', '') AS INTEGER)), 0) + 1 as next FROM penarikan", [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const kode = generateKode('WD', row.next);

      db.run(
        `INSERT INTO penarikan (kode, nasabah_id, jumlah, metode, catatan, tanggal) VALUES (?,?,?,?,?,?)`,
        [kode, nasabah_id, jumlah, metode, catatan, tanggal],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });

          // Kurangi saldo
          db.run(`UPDATE nasabah SET saldo = saldo - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [jumlah, nasabah_id]);

          res.status(201).json({ message: 'Penarikan berhasil diproses', id: this.lastID, kode });
        }
      );
    });
  });
});

// =============================================
// DASHBOARD STATS
// =============================================
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const stats = {};

  const queries = [
    // Total sampah bulan ini (kg)
    new Promise((resolve) => {
      db.get(
        `SELECT COALESCE(SUM(berat_kg),0) as total FROM transaksi
         WHERE status='Selesai' AND strftime('%Y-%m', tanggal) = strftime('%Y-%m', 'now')`,
        [], (err, row) => { stats.total_sampah_bulan = row?.total || 0; resolve(); }
      );
    }),
    // Total transaksi bulan ini (Rp)
    new Promise((resolve) => {
      db.get(
        `SELECT COALESCE(SUM(total),0) as total FROM transaksi
         WHERE status='Selesai' AND strftime('%Y-%m', tanggal) = strftime('%Y-%m', 'now')`,
        [], (err, row) => { stats.total_nilai_bulan = row?.total || 0; resolve(); }
      );
    }),
    // Total nasabah aktif
    new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as total FROM nasabah WHERE status='Aktif'`,
        [], (err, row) => { stats.total_nasabah = row?.total || 0; resolve(); }
      );
    }),
    // Total sampah sepanjang waktu (kg)
    new Promise((resolve) => {
      db.get(
        `SELECT COALESCE(SUM(berat_kg),0) as total FROM transaksi WHERE status='Selesai'`,
        [], (err, row) => { stats.total_sampah_semua = row?.total || 0; resolve(); }
      );
    }),
    // Total sampah minggu ini (kg), dihitung mulai Senin
    new Promise((resolve) => {
      db.get(
        `SELECT COALESCE(SUM(berat_kg),0) as total FROM transaksi
         WHERE status='Selesai'
           AND tanggal >= date('now', '-' || ((strftime('%w','now') + 6) % 7) || ' days')`,
        [], (err, row) => { stats.total_sampah_minggu_ini = row?.total || 0; resolve(); }
      );
    }),
    // Transaksi minggu ini, dihitung mulai Senin
    new Promise((resolve) => {
      db.get(
        `SELECT COUNT(*) as total FROM transaksi
         WHERE tanggal >= date('now', '-' || ((strftime('%w','now') + 6) % 7) || ' days')`,
        [], (err, row) => { stats.transaksi_minggu_ini = row?.total || 0; resolve(); }
      );
    }),
    // Total saldo semua nasabah
    new Promise((resolve) => {
      db.get(`SELECT COALESCE(SUM(saldo),0) as total FROM nasabah`,
        [], (err, row) => { stats.total_saldo = row?.total || 0; resolve(); }
      );
    }),
    // Grafik bulanan (12 bulan terakhir)
    new Promise((resolve) => {
      db.all(
        `SELECT strftime('%m', tanggal) as bulan, COALESCE(SUM(berat_kg),0) as kg
         FROM transaksi WHERE status='Selesai' AND strftime('%Y', tanggal) = strftime('%Y','now')
         GROUP BY bulan ORDER BY bulan`,
        [], (err, rows) => { stats.grafik_bulanan = rows || []; resolve(); }
      );
    }),
    // Komposisi jenis sampah
    new Promise((resolve) => {
      db.all(
        `SELECT j.nama, j.ikon, COALESCE(SUM(t.berat_kg),0) as kg, COALESCE(SUM(t.total),0) as nilai
         FROM jenis_sampah j
         LEFT JOIN transaksi t ON j.id = t.jenis_id AND t.status='Selesai'
         GROUP BY j.id ORDER BY kg DESC`,
        [], (err, rows) => { stats.komposisi_jenis = rows || []; resolve(); }
      );
    }),
    // Transaksi terbaru 5
    new Promise((resolve) => {
      db.all(
        `SELECT t.*, n.nama as nasabah_nama, j.nama as jenis_nama, j.ikon as jenis_ikon
         FROM transaksi t
         JOIN nasabah n ON t.nasabah_id = n.id
         JOIN jenis_sampah j ON t.jenis_id = j.id
         ORDER BY t.id DESC LIMIT 5`,
        [], (err, rows) => { stats.transaksi_terbaru = rows || []; resolve(); }
      );
    }),
  ];

  Promise.all(queries).then(() => res.json({ data: stats }));
});

// =============================================
// LAPORAN
// =============================================
app.get('/api/laporan', authMiddleware, (req, res) => {
  const { bulan, tahun } = req.query;
  const period = tahun
    ? (bulan ? `${tahun}-${String(bulan).padStart(2,'0')}` : tahun)
    : null;

  let whereClause = "WHERE t.status = 'Selesai'";
  const params = [];
  if (period && bulan) {
    whereClause += " AND strftime('%Y-%m', t.tanggal) = ?";
    params.push(period);
  } else if (period) {
    whereClause += " AND strftime('%Y', t.tanggal) = ?";
    params.push(tahun);
  }

  const laporan = {};

  Promise.all([
    new Promise((resolve) => {
      db.all(
        `SELECT n.nama, n.kode, COUNT(t.id) as jumlah_tr,
                COALESCE(SUM(t.berat_kg),0) as total_kg,
                COALESCE(SUM(t.total),0) as total_nilai
         FROM nasabah n
         LEFT JOIN transaksi t ON n.id = t.nasabah_id ${whereClause}
         GROUP BY n.id ORDER BY total_kg DESC LIMIT 10`,
        params, (err, rows) => { laporan.top_nasabah = rows || []; resolve(); }
      );
    }),
    new Promise((resolve) => {
      db.all(
        `SELECT j.nama, j.ikon,
                COALESCE(SUM(t.berat_kg),0) as kg,
                COALESCE(SUM(t.total),0) as nilai
         FROM jenis_sampah j
         LEFT JOIN transaksi t ON j.id = t.jenis_id ${whereClause}
         GROUP BY j.id ORDER BY kg DESC`,
        params, (err, rows) => { laporan.per_jenis = rows || []; resolve(); }
      );
    }),
    new Promise((resolve) => {
      db.get(
        `SELECT COALESCE(SUM(t.berat_kg),0) as total_kg,
                COALESCE(SUM(t.total),0) as total_nilai,
                COUNT(t.id) as total_transaksi
         FROM transaksi t ${whereClause}`,
        params, (err, row) => { laporan.ringkasan = row || {}; resolve(); }
      );
    }),
  ]).then(() => res.json({ data: laporan }));
});

// =============================================
// SERVE FRONTEND
// =============================================
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
  console.log('');
  console.log('🌱 ================================');
  console.log('   Bank Sampah Hijau Lestari');
  console.log('🌱 ================================');
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
  console.log(`📦 Database: SQLite (banksampah.db)`);
  console.log(`🔑 API tersedia di /api/*`);
  console.log('');
});
