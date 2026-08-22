const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const SHEET_ID = '170o3wJv9tYK3k2I0a3367rUT40q0iYEv4nk323MpMhs';
const WEEKLY_GID = '1033350435';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${WEEKLY_GID}`;
const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'banksampah.db'));

const types = {
  GP: { name: 'Gelas Plastik', price: 1500, points: 1 },
  BP: { name: 'Botol Plastik', price: 1500, points: 1 },
  KD: { name: 'Kardus', price: 1300, points: 1 },
  KL: { name: 'Kaleng', price: 500, points: 1 },
  GB: { name: 'Gebrus', price: 500, points: 1 },
  BE1: { name: 'Besi 1', price: 2500, points: 1 },
  BE2: { name: 'Besi 2', price: 2000, points: 1 },
  DP: { name: 'Duplek', price: 450, points: 1 },
  HVS: { name: 'Kertas HVS', price: 1100, points: 1 },
  KB: { name: 'Kertas Buram', price: 500, points: 1 },
  BU: { name: 'Buku', price: 1000, points: 1 },
  PK: { name: 'Plastik Keras', price: 800, points: 1 },
  AL: { name: 'Aluminium', price: 20000, points: 1 }
};
const typeColumns = Object.keys(types);
const monthNumbers = { Januari: 1, Februari: 2, Maret: 3, April: 4, Mei: 5, Juni: 6, Juli: 7, Agustus: 8, September: 9, Oktober: 10, November: 11, Desember: 12 };

function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"' && quoted) { value += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(value.trim()); value = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value.trim()); value = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseNumber(value) {
  const match = String(value || '').replace(/\s/g, '').match(/[\d.,]+/);
  if (!match) return 0;
  const number = match[0].includes(',') ? match[0].replace(/\./g, '').replace(',', '.') : match[0].replace(/,/g, '');
  return Number(number) || 0;
}

function parseDate(value, year = 2026) {
  const match = String(value || '').match(/(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/i);
  if (!match || !monthNumbers[match[2]]) return null;
  return `${match[3] || year}-${String(monthNumbers[match[2]]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
}

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\b(ibu|bu|pak|bunda|mamah|mama|abah|teh|mang)\b/g, '').replace(/\s+/g, ' ').trim();
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this); }));
}

async function getOrCreateType(code) {
  const type = types[code];
  let rows = await query('SELECT id FROM jenis_sampah WHERE nama = ?', [type.name]);
  if (!rows.length) {
    const result = await run('INSERT INTO jenis_sampah (nama, ikon, kategori, harga_kg, poin_kg) VALUES (?, ?, ?, ?, ?)', [type.name, '♻️', 'Anorganik', type.price, type.points]);
    return result.lastID;
  }
  return rows[0].id;
}

async function getOrCreateNasabah(card, name, names) {
  if (names.has(card)) return names.get(card);
  const normalized = normalizeName(name);
  let rows = await query('SELECT id, nama FROM nasabah');
  let found = rows.find(row => normalizeName(row.nama) === normalized || (normalized === 'gilang n' && normalizeName(row.nama) === 'gilang'));
  if (!found) {
    const next = await query('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM nasabah');
    const kode = `NS${String(next[0].id).padStart(3, '0')}`;
    const result = await run('INSERT INTO nasabah (kode, nama, status) VALUES (?, ?, ?)', [kode, name, 'Aktif']);
    found = { id: result.lastID, nama: name };
  }
  names.set(card, found.id);
  return found.id;
}

async function main() {
  const response = await fetch(CSV_URL);
  if (!response.ok) throw new Error(`Gagal mengunduh spreadsheet: HTTP ${response.status}`);
  const rows = parseCsv(await response.text());
  const names = new Map();
  let currentDate = null;
  let importedTransactions = 0;
  let skippedRows = 0;

  await run('BEGIN TRANSACTION');
  try {
    for (const row of rows) {
      const possibleDate = parseDate(row[0]);
      if (possibleDate) currentDate = possibleDate;
      const card = row[1];
      const name = row[2];
      if (!currentDate || !card || !name || !/^\d+$/.test(card.replace(/\D/g, ''))) continue;
      const nasabahId = await getOrCreateNasabah(card.replace(/\D/g, ''), name, names);
      for (let index = 0; index < typeColumns.length; index++) {
        const value = row[3 + index];
        const weight = parseNumber(value);
        if (!weight) continue;
        const code = typeColumns[index];
        const typeId = await getOrCreateType(code);
        const total = weight * types[code].price;
        const transactionCode = `IMP-${currentDate.replace(/-/g, '')}-${card.replace(/\D/g, '')}-${code}`;
        const result = await run(`INSERT OR IGNORE INTO transaksi (kode, nasabah_id, jenis_id, berat_kg, harga_kg, total, poin_dapat, catatan, tanggal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [transactionCode, nasabahId, typeId, weight, types[code].price, total, Math.floor(weight * types[code].points), 'Migrasi spreadsheet Mingguan', currentDate]);
        if (result.changes) {
          await run('UPDATE nasabah SET saldo = saldo + ?, poin = poin + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [total, Math.floor(weight * types[code].points), nasabahId]);
          importedTransactions++;
        }
      }
      if (row[16] && parseNumber(row[17])) {
        const otherName = row[16];
        const otherWeight = parseNumber(row[17]);
        const otherTotal = parseNumber(row[18]);
        const otherKey = otherName.replace(/\s+/g, ' ').trim();
        let other = await query('SELECT id FROM jenis_sampah WHERE nama = ?', [otherKey]);
        const otherId = other.length ? other[0].id : (await run('INSERT INTO jenis_sampah (nama, ikon, kategori, harga_kg, poin_kg) VALUES (?, ?, ?, ?, ?)', [otherKey, '♻️', 'Lainnya', otherTotal / otherWeight, 1])).lastID;
        const transactionCode = `IMP-${currentDate.replace(/-/g, '')}-${card.replace(/\D/g, '')}-OTHER-${otherKey.replace(/\W/g, '')}`;
        const result = await run('INSERT OR IGNORE INTO transaksi (kode, nasabah_id, jenis_id, berat_kg, harga_kg, total, poin_dapat, catatan, tanggal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [transactionCode, nasabahId, otherId, otherWeight, otherTotal / otherWeight, otherTotal, Math.floor(otherWeight), 'Migrasi spreadsheet Mingguan', currentDate]);
        if (result.changes) {
          await run('UPDATE nasabah SET saldo = saldo + ?, poin = poin + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [otherTotal, Math.floor(otherWeight), nasabahId]);
          importedTransactions++;
        }
      }
    }
    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
  console.log(`Migrasi selesai: ${importedTransactions} transaksi baru, ${names.size} warga dipetakan.`);
  console.log(`Sumber: tab Mingguan (${rows.length} baris CSV).`);
}

main().catch(error => { console.error('Migrasi gagal:', error.message); process.exitCode = 1; }).finally(() => db.close());