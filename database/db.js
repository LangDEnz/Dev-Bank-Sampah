const sqlite3 = require('sqlite3').verbose();
const bcrypt  = require('bcryptjs');
const path    = require('path');

const DB_PATH = path.join(__dirname, 'banksampah.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Gagal membuka database:', err.message);
  } else {
    console.log('✅ Database SQLite terhubung:', DB_PATH);
  }
});

db.serialize(() => {
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // =============================================
  // TABEL USERS (login)
  // =============================================
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      nama       TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'petugas',
      aktif      INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // =============================================
  // TABEL NASABAH
  // =============================================
  db.run(`
    CREATE TABLE IF NOT EXISTS nasabah (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      kode       TEXT    NOT NULL UNIQUE,
      nama       TEXT    NOT NULL,
      telepon    TEXT,
      alamat     TEXT,
      saldo      REAL    NOT NULL DEFAULT 0,
      poin       INTEGER NOT NULL DEFAULT 0,
      status     TEXT    NOT NULL DEFAULT 'Aktif',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // =============================================
  // TABEL JENIS SAMPAH / HARGA
  // =============================================
  db.run(`
    CREATE TABLE IF NOT EXISTS jenis_sampah (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nama       TEXT    NOT NULL UNIQUE,
      ikon       TEXT    NOT NULL DEFAULT '♻️',
      kategori   TEXT    NOT NULL DEFAULT 'Anorganik',
      harga_kg   REAL    NOT NULL DEFAULT 0,
      poin_kg    INTEGER NOT NULL DEFAULT 1,
      aktif      INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // =============================================
  // TABEL TRANSAKSI SETORAN
  // =============================================
  db.run(`
    CREATE TABLE IF NOT EXISTS transaksi (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      kode         TEXT    NOT NULL UNIQUE,
      nasabah_id   INTEGER NOT NULL,
      jenis_id     INTEGER NOT NULL,
      berat_kg     REAL    NOT NULL,
      harga_kg     REAL    NOT NULL,
      total        REAL    NOT NULL,
      poin_dapat   INTEGER NOT NULL DEFAULT 0,
      catatan      TEXT,
      status       TEXT    NOT NULL DEFAULT 'Selesai',
      tanggal      DATE    NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (nasabah_id) REFERENCES nasabah(id),
      FOREIGN KEY (jenis_id)   REFERENCES jenis_sampah(id)
    )
  `);

  // =============================================
  // TABEL PENARIKAN TABUNGAN
  // =============================================
  db.run(`
    CREATE TABLE IF NOT EXISTS penarikan (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      kode       TEXT    NOT NULL UNIQUE,
      nasabah_id INTEGER NOT NULL,
      jumlah     REAL    NOT NULL,
      metode     TEXT    NOT NULL DEFAULT 'Tunai',
      catatan    TEXT,
      status     TEXT    NOT NULL DEFAULT 'Selesai',
      tanggal    DATE    NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (nasabah_id) REFERENCES nasabah(id)
    )
  `);

  // =============================================
  // SEED DATA AWAL
  // =============================================
  seedData();
  syncJenisSampah();
  db.run("UPDATE nasabah SET kode = 'NK.' || substr(kode, 3) WHERE kode GLOB 'NS[0-9]*'");
});

function syncJenisSampah() {
  const jenis = [
    ['Gelas Plastik', '🥤', 'Anorganik', 1500],
    ['Botol Plastik', '🧴', 'Anorganik', 1500],
    ['Kardus', '📦', 'Anorganik', 1300],
    ['Kaleng', '🥫', 'Anorganik', 500],
    ['Gebrus', '♻️', 'Anorganik', 500],
    ['Besi 1', '🔩', 'Logam', 2500],
    ['Besi 2', '🔧', 'Logam', 2000],
    ['Duplek', '<img src="../assets/duplek-box.svg" alt="Duplek" class="trash-icon">', 'Kertas', 450],
    ['Kertas HVS', '📃', 'Kertas', 1100],
    ['Kertas Buram', '📰', 'Kertas', 500],
    ['Buku', '📚', 'Kertas', 1000],
    ['Plastik Keras', '🪣', 'Anorganik', 800],
    ['Aluminium', '<img src="../assets/aluminium-stack.svg" alt="Aluminium" class="trash-icon">', 'Logam', 20000],
  ];

  db.run(`UPDATE jenis_sampah SET aktif = 0 WHERE nama NOT IN (${jenis.map(() => '?').join(',')})`, jenis.map(item => item[0]));
  jenis.forEach(([nama, ikon, kategori, harga]) => {
    db.run(
      `INSERT INTO jenis_sampah (nama, ikon, kategori, harga_kg, poin_kg, aktif)
       VALUES (?, ?, ?, ?, 1, 1)
       ON CONFLICT(nama) DO UPDATE SET ikon=excluded.ikon, kategori=excluded.kategori, harga_kg=excluded.harga_kg, aktif=1, updated_at=CURRENT_TIMESTAMP`,
      [nama, ikon, kategori, harga]
    );
  });
}

async function seedData() {
  // Cek apakah data sudah ada
  db.get('SELECT COUNT(*) as cnt FROM users', [], async (err, row) => {
    if (err || row.cnt > 0) return;

    console.log('🌱 Memasukkan data awal...');

    // Hash passwords
    const hashAdmin    = await bcrypt.hash('admin123', 10);
    const hashPetugas  = await bcrypt.hash('petugas123', 10);
    const hashNasabah  = await bcrypt.hash('nasabah123', 10);

    // Users
    db.run(`INSERT INTO users (username, password, nama, role) VALUES (?, ?, ?, ?)`,
      ['admin', hashAdmin, 'Admin Utama', 'Administrator']);
    db.run(`INSERT INTO users (username, password, nama, role) VALUES (?, ?, ?, ?)`,
      ['petugas', hashPetugas, 'Budi Santoso', 'Petugas']);
    db.run(`INSERT INTO users (username, password, nama, role) VALUES (?, ?, ?, ?)`,
      ['nasabah', hashNasabah, 'Siti Rahayu', 'Nasabah']);

    // Jenis Sampah
    const jenis = [
      ['Gelas Plastik', '🥤', 'Anorganik', 1500, 1], ['Botol Plastik', '🧴', 'Anorganik', 1500, 1],
      ['Kardus', '📦', 'Anorganik', 1300, 1], ['Kaleng', '🥫', 'Anorganik', 500, 1],
      ['Gebrus', '♻️', 'Anorganik', 500, 1], ['Besi 1', '🔩', 'Logam', 2500, 1],
      ['Besi 2', '🔧', 'Logam', 2000, 1], ['Duplek', '<img src="../assets/duplek-box.svg" alt="Duplek" class="trash-icon">', 'Kertas', 450, 1],
      ['Kertas HVS', '📃', 'Kertas', 1100, 1], ['Kertas Buram', '📰', 'Kertas', 500, 1],
      ['Buku', '📚', 'Kertas', 1000, 1], ['Plastik Keras', '🪣', 'Anorganik', 800, 1],
      ['Aluminium', '<img src="../assets/aluminium-stack.svg" alt="Aluminium" class="trash-icon">', 'Logam', 20000, 1],
    ];
    jenis.forEach(([nama, ikon, kategori, harga_kg, poin_kg]) => {
      db.run(`INSERT INTO jenis_sampah (nama, ikon, kategori, harga_kg, poin_kg) VALUES (?,?,?,?,?)`,
        [nama, ikon, kategori, harga_kg, poin_kg]);
    });

    // Nasabah
    const nasabahData = [
      ['NK.001', 'Siti Rahayu',    '081234567890', 'Jl. Mawar No. 12',   145000, 290, 'Aktif'],
      ['NK.002', 'Budi Santoso',   '082345678901', 'Jl. Melati No. 5',   87500,  175, 'Aktif'],
      ['NK.003', 'Dewi Kusuma',    '083456789012', 'Jl. Dahlia No. 8',   210000, 420, 'Aktif'],
      ['NK.004', 'Ahmad Fauzi',    '084567890123', 'Jl. Anggrek No. 3',  32000,  64,  'Aktif'],
      ['NK.005', 'Rina Wulandari', '085678901234', 'Jl. Kenanga No. 7',  0,      0,   'Tidak Aktif'],
      ['NK.006', 'Hendra Wijaya',  '086789012345', 'Jl. Cempaka No. 1',  165000, 330, 'Aktif'],
      ['NK.007', 'Maya Sari',      '087890123456', 'Jl. Kamboja No. 9',  54000,  108, 'Aktif'],
    ];
    nasabahData.forEach(([kode, nama, telepon, alamat, saldo, poin, status]) => {
      db.run(`INSERT INTO nasabah (kode, nama, telepon, alamat, saldo, poin, status) VALUES (?,?,?,?,?,?,?)`,
        [kode, nama, telepon, alamat, saldo, poin, status]);
    });

    // Transaksi
    setTimeout(() => {
      const transaksiData = [
        ['TR001', 1, 1, 3.5,  2500, 8750,  7,  'Selesai',    '2026-08-20'],
        ['TR002', 2, 2, 5.0,  1500, 7500,  5,  'Selesai',    '2026-08-19'],
        ['TR003', 3, 3, 2.0,  8000, 16000, 10, 'Selesai',    '2026-08-19'],
        ['TR004', 4, 1, 1.5,  2500, 3750,  3,  'Selesai',    '2026-08-18'],
        ['TR005', 6, 2, 8.0,  1500, 12000, 8,  'Selesai',    '2026-08-17'],
        ['TR006', 7, 5, 1.0,  15000,15000, 8,  'Pending',    '2026-08-17'],
        ['TR007', 1, 4, 10.0, 500,  5000,  10, 'Selesai',    '2026-08-16'],
        ['TR008', 3, 6, 4.0,  1000, 4000,  4,  'Dibatalkan', '2026-08-15'],
      ];
      transaksiData.forEach(([kode, nasabah_id, jenis_id, berat_kg, harga_kg, total, poin_dapat, status, tanggal]) => {
        db.run(`INSERT INTO transaksi (kode, nasabah_id, jenis_id, berat_kg, harga_kg, total, poin_dapat, status, tanggal)
                VALUES (?,?,?,?,?,?,?,?,?)`,
          [kode, nasabah_id, jenis_id, berat_kg, harga_kg, total, poin_dapat, status, tanggal]);
      });

      // Penarikan
      const penarikanData = [
        ['WD001', 3, 50000,  'Tunai',         'Selesai', '2026-08-19'],
        ['WD002', 6, 100000, 'Transfer Bank', 'Selesai', '2026-08-18'],
        ['WD003', 1, 75000,  'Tunai',         'Pending', '2026-08-15'],
      ];
      penarikanData.forEach(([kode, nasabah_id, jumlah, metode, status, tanggal]) => {
        db.run(`INSERT INTO penarikan (kode, nasabah_id, jumlah, metode, status, tanggal) VALUES (?,?,?,?,?,?)`,
          [kode, nasabah_id, jumlah, metode, status, tanggal]);
      });

      console.log('✅ Data awal berhasil dimasukkan!');
    }, 500);
  });
}

module.exports = db;
