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

// =============================================
// NASABAH ROUTES
// =============================================

// GET /api/nasabah
app.get('/api/nasabah', authMiddleware, (req, res) => {
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
  sql += ' ORDER BY id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows, total: rows.length });
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

  db.get('SELECT COUNT(*) as cnt FROM nasabah', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const kode = generateKode('NS', row.cnt + 1);

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

  db.get('SELECT * FROM jenis_sampah WHERE id = ? AND aktif = 1', [jenis_id], (err, jenis) => {
    if (err || !jenis) return res.status(400).json({ error: 'Jenis sampah tidak valid' });

    const harga_kg   = jenis.harga_kg;
    const total      = harga_kg * berat_kg;
    const poin_dapat = Math.floor(jenis.poin_kg * berat_kg);

    db.get('SELECT COUNT(*) as cnt FROM transaksi', [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const kode = generateKode('TR', row.cnt + 1);

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

          res.status(201).json({ message: 'Transaksi berhasil disimpan', id: this.lastID, kode, total, poin_dapat });
        }
      );
    });
  });
});

// PUT /api/transaksi/:id/status
app.put('/api/transaksi/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  db.run(
    `UPDATE transaksi SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [status, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Status transaksi diperbarui' });
    }
  );
});

// DELETE /api/transaksi/:id
app.delete('/api/transaksi/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM transaksi WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
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

  db.get('SELECT saldo FROM nasabah WHERE id = ?', [nasabah_id], (err, nasabah) => {
    if (err || !nasabah) return res.status(400).json({ error: 'Nasabah tidak ditemukan' });
    if (nasabah.saldo < jumlah) return res.status(400).json({ error: 'Saldo tidak mencukupi' });

    db.get('SELECT COUNT(*) as cnt FROM penarikan', [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const kode = generateKode('WD', row.cnt + 1);

      db.run(
        `INSERT INTO penarikan (kode, nasabah_id, jumlah, metode, catatan, tanggal) VALUES (?,?,?,?,?,?)`,
        [kode, nasabah_id, jumlah, metode, catatan, tanggal],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
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
    new Promise((resolve) => {
      db.get(
        `SELECT COALESCE(SUM(berat_kg),0) as total FROM transaksi
         WHERE status='Selesai' AND strftime('%Y-%m', tanggal) = strftime('%Y-%m', 'now')`,
        [], (err, row) => { stats.total_sampah_bulan = row?.total || 0; resolve(); }
      );
    }),
    new Promise((resolve) => {
      db.get(
        `SELECT COALESCE(SUM(total),0) as total FROM transaksi
         WHERE status='Selesai' AND strftime('%Y-%m', tanggal) = strftime('%Y-%m', 'now')`,
        [], (err, row) => { stats.total_nilai_bulan = row?.total || 0; resolve(); }
      );
    }),
    new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as total FROM nasabah WHERE status='Aktif'`,
        [], (err, row) => { stats.total_nasabah = row?.total || 0; resolve(); }
      );
    }),
    new Promise((resolve) => {
      db.get(
        `SELECT COUNT(*) as total FROM transaksi WHERE tanggal = date('now')`,
        [], (err, row) => { stats.transaksi_hari_ini = row?.total || 0; resolve(); }
      );
    }),
    new Promise((resolve) => {
      db.get(`SELECT COALESCE(SUM(saldo),0) as total FROM nasabah`,
        [], (err, row) => { stats.total_saldo = row?.total || 0; resolve(); }
      );
    }),
    new Promise((resolve) => {
      db.all(
        `SELECT strftime('%m', tanggal) as bulan, COALESCE(SUM(berat_kg),0) as kg
         FROM transaksi WHERE status='Selesai' AND strftime('%Y', tanggal) = strftime('%Y','now')
         GROUP BY bulan ORDER BY bulan`,
        [], (err, rows) => { stats.grafik_bulanan = rows || []; resolve(); }
      );
    }),
    new Promise((resolve) => {
      db.all(
        `SELECT j.nama, j.ikon, COALESCE(SUM(t.berat_kg),0) as kg, COALESCE(SUM(t.total),0) as nilai
         FROM jenis_sampah j
         LEFT JOIN transaksi t ON j.id = t.jenis_id AND t.status='Selesai'
         GROUP BY j.id ORDER BY kg DESC`,
        [], (err, rows) => { stats.komposisi_jenis = rows || []; resolve(); }
      );
    }),
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
  let whereClause = "WHERE t.status = 'Selesai'";
  const params = [];

  if (tahun && bulan) {
    const period = `${tahun}-${String(bulan).padStart(2,'0')}`;
    whereClause += " AND strftime('%Y-%m', t.tanggal) = ?";
    params.push(period);
  } else if (tahun) {
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
// START SERVER
// =============================================
app.listen(PORT, () => {
  console.log('');
  console.log('🌱 ================================');
  console.log('   Bank Sampah Hijau Lestari');
  console.log('🌱 ================================');
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
  console.log(`📦 Database: SQLite (database/banksampah.db)`);
  console.log(`🔑 API tersedia di /api/*`);
  console.log('');
});
