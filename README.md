# ♻️ Bank Sampah Hijau Lestari

Aplikasi manajemen bank sampah berbasis web — mencakup setoran sampah, tabungan nasabah, penarikan, laporan, dan harga sampah.

## 🛠️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | Node.js + Express.js |
| Database | SQLite3 |
| Auth | JWT (JSON Web Token) + bcryptjs |

## 📁 Struktur Proyek

```
bank-sampah/
├── index.html          # Halaman login
├── server.js           # Backend API (Express)
├── package.json
├── .gitignore
├── css/
│   ├── style.css       # CSS global (sidebar, tabel, card)
│   └── login.css       # CSS halaman login
├── js/
│   ├── app.js          # Fungsi global (auth, toast, format)
│   └── api.js          # API client (fetch wrapper)
├── database/
│   └── db.js           # Schema SQLite + seed data
└── pages/
    ├── dashboard.html
    ├── setor.html
    ├── nasabah.html
    ├── transaksi.html
    ├── tabungan.html
    ├── penarikan.html
    ├── laporan.html
    ├── harga.html
    └── pengaturan.html
```

## 🚀 Cara Menjalankan

### 1. Install dependencies
```bash
npm install
```

### 2. Jalankan server
```bash
npm start
# atau
node server.js
```

### 3. Buka di browser
```
http://localhost:3000
```

## 🔑 Akun Demo

| Role | Username | Password |
|------|----------|----------|
| Administrator | `admin` | `admin123` |
| Petugas | `petugas` | `petugas123` |
| Nasabah | `nasabah` | `nasabah123` |

## 🔌 API Endpoints

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| POST | `/api/login` | Login & dapat JWT token |
| GET | `/api/nasabah` | Daftar nasabah |
| POST | `/api/nasabah` | Tambah nasabah |
| PUT | `/api/nasabah/:id` | Edit nasabah |
| DELETE | `/api/nasabah/:id` | Hapus nasabah |
| GET | `/api/transaksi` | Daftar transaksi |
| POST | `/api/transaksi` | Tambah setoran |
| GET | `/api/jenis-sampah` | Daftar & harga sampah |
| POST | `/api/penarikan` | Proses penarikan |
| GET | `/api/dashboard` | Statistik dashboard |
| GET | `/api/laporan` | Data laporan |

## 🗄️ Database

SQLite — file tersimpan di `database/banksampah.db` (tidak di-commit ke Git).

### Tabel
- `users` — akun login
- `nasabah` — data nasabah (saldo, poin)
- `jenis_sampah` — kategori & harga per kg
- `transaksi` — setoran sampah
- `penarikan` — penarikan tabungan
