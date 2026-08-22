/* ===================================
   BANK SAMPAH - Main App JS
   =================================== */

// ---- AUTH CHECK ----
function checkAuth() {
  const user = sessionStorage.getItem('bs_user');
  if (!user) {
    window.location.href = '../index.html';
    return null;
  }
  return JSON.parse(user);
}

function logout() {
  sessionStorage.removeItem('bs_user');
  window.location.href = '../index.html';
}

// ---- SET ACTIVE NAV ----
function setActiveNav() {
  const path = window.location.pathname;
  const links = document.querySelectorAll('.nav-item a');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && path.includes(href.replace('../pages/', '').replace('.html', ''))) {
      link.closest('.nav-item').classList.add('active');
    }
  });
}

// ---- SET USER INFO ----
function setUserInfo(user) {
  const nameEl  = document.getElementById('sidebarUserName');
  const roleEl  = document.getElementById('sidebarUserRole');
  const topEl   = document.getElementById('topbarPageTitle');
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = user.role;
}

// ---- TOAST NOTIFICATION ----
function showToast(message, type = 'success', duration = 3000) {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌'}</span> ${message}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ---- MODAL HELPERS ----
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('show');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('show');
}

// ---- FORMAT CURRENCY ----
function formatRupiah(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

// ---- FORMAT DATE ----
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ---- CONFIRM DIALOG ----
function confirmAction(message, onConfirm) {
  if (confirm(message)) onConfirm();
}

// ---- INIT PAGE ----
document.addEventListener('DOMContentLoaded', () => {
  const user = checkAuth();
  if (!user) return;
  setUserInfo(user);
  setActiveNav();

  // Set date on topbar
  const dateEl = document.getElementById('topbarDate');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });
});

// ---- SAMPLE DATA ----
const sampleNasabah = [
  { id: 'NS001', nama: 'Siti Rahayu',    telepon: '081234567890', alamat: 'Jl. Mawar No. 12', saldo: 145000,  poin: 290, status: 'Aktif'    },
  { id: 'NS002', nama: 'Budi Santoso',   telepon: '082345678901', alamat: 'Jl. Melati No. 5',  saldo: 87500,   poin: 175, status: 'Aktif'    },
  { id: 'NS003', nama: 'Dewi Kusuma',    telepon: '083456789012', alamat: 'Jl. Dahlia No. 8',  saldo: 210000,  poin: 420, status: 'Aktif'    },
  { id: 'NS004', nama: 'Ahmad Fauzi',    telepon: '084567890123', alamat: 'Jl. Anggrek No. 3', saldo: 32000,   poin: 64,  status: 'Aktif'    },
  { id: 'NS005', nama: 'Rina Wulandari', telepon: '085678901234', alamat: 'Jl. Kenanga No. 7', saldo: 0,       poin: 0,   status: 'Tidak Aktif' },
  { id: 'NS006', nama: 'Hendra Wijaya',  telepon: '086789012345', alamat: 'Jl. Cempaka No. 1', saldo: 165000,  poin: 330, status: 'Aktif'    },
  { id: 'NS007', nama: 'Maya Sari',      telepon: '087890123456', alamat: 'Jl. Kamboja No. 9', saldo: 54000,   poin: 108, status: 'Aktif'    },
];

const sampleTransaksi = [
  { id: 'TR001', nasabah: 'Siti Rahayu',    jenis: 'Plastik',     berat: 3.5,  harga: 2500, total: 8750,  tanggal: '2026-08-20', status: 'Selesai'  },
  { id: 'TR002', nasabah: 'Budi Santoso',   jenis: 'Kertas',      berat: 5.0,  harga: 1500, total: 7500,  tanggal: '2026-08-19', status: 'Selesai'  },
  { id: 'TR003', nasabah: 'Dewi Kusuma',    jenis: 'Logam',       berat: 2.0,  harga: 8000, total: 16000, tanggal: '2026-08-19', status: 'Selesai'  },
  { id: 'TR004', nasabah: 'Ahmad Fauzi',    jenis: 'Plastik',     berat: 1.5,  harga: 2500, total: 3750,  tanggal: '2026-08-18', status: 'Selesai'  },
  { id: 'TR005', nasabah: 'Hendra Wijaya',  jenis: 'Kertas',      berat: 8.0,  harga: 1500, total: 12000, tanggal: '2026-08-17', status: 'Selesai'  },
  { id: 'TR006', nasabah: 'Maya Sari',      jenis: 'Elektronik',  berat: 1.0,  harga: 15000,total: 15000, tanggal: '2026-08-17', status: 'Pending'  },
  { id: 'TR007', nasabah: 'Siti Rahayu',    jenis: 'Organik',     berat: 10.0, harga: 500,  total: 5000,  tanggal: '2026-08-16', status: 'Selesai'  },
  { id: 'TR008', nasabah: 'Dewi Kusuma',    jenis: 'Kaca',        berat: 4.0,  harga: 1000, total: 4000,  tanggal: '2026-08-15', status: 'Dibatalkan' },
];

const hargaSampah = {
  Plastik:    2500,
  Kertas:     1500,
  Logam:      8000,
  Organik:    500,
  Elektronik: 15000,
  Kaca:       1000,
};
