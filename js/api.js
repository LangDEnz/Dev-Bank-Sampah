/* ===================================
   BANK SAMPAH - API Client
   Menghubungkan frontend ke backend
   =================================== */

const API_BASE = 'http://localhost:3000/api';

// ---- GET TOKEN ----
function getToken() {
  return localStorage.getItem('bs_token');
}

// ---- HEADERS ----
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

// ---- FETCH WRAPPER ----
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: authHeaders()
    });

    if (res.status === 401) {
      // Token expired, redirect ke login
      localStorage.removeItem('bs_token');
      localStorage.removeItem('bs_user');
      window.location.href = '../index.html';
      return null;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
    return data;

  } catch (err) {
    console.error('API Error:', err.message);
    throw err;
  }
}

// =============================================
// AUTH API
// =============================================
const AuthAPI = {
  async login(username, password) {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login gagal');
    return data;
  },

  logout() {
    localStorage.removeItem('bs_token');
    localStorage.removeItem('bs_user');
    window.location.href = '../index.html';
  },

  getUser() {
    const u = localStorage.getItem('bs_user');
    return u ? JSON.parse(u) : null;
  },

  updateProfile(data) {
    return apiFetch('/me', { method: 'PUT', body: JSON.stringify(data) });
  },

  isLoggedIn() {
    return !!getToken();
  }
};

const UsersAPI = {
  getAll() {
    return apiFetch('/users');
  },
  create(data) {
    return apiFetch('/users', { method: 'POST', body: JSON.stringify(data) });
  },
  delete(id) {
    return apiFetch(`/users/${id}`, { method: 'DELETE' });
  }
};

// =============================================
// NASABAH API
// =============================================
const NasabahAPI = {
  getAll(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/nasabah${q ? '?' + q : ''}`);
  },
  getById(id) {
    return apiFetch(`/nasabah/${id}`);
  },
  create(data) {
    return apiFetch('/nasabah', { method: 'POST', body: JSON.stringify(data) });
  },
  update(id, data) {
    return apiFetch(`/nasabah/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  delete(id) {
    return apiFetch(`/nasabah/${id}`, { method: 'DELETE' });
  }
};

// =============================================
// TRANSAKSI API
// =============================================
const TransaksiAPI = {
  getAll(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/transaksi${q ? '?' + q : ''}`);
  },
  getById(id) {
    return apiFetch(`/transaksi/${id}`);
  },
  create(data) {
    return apiFetch('/transaksi', { method: 'POST', body: JSON.stringify(data) });
  },
  updateStatus(id, status) {
    return apiFetch(`/transaksi/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  },
  delete(id) {
    return apiFetch(`/transaksi/${id}`, { method: 'DELETE' });
  }
};

// =============================================
// JENIS SAMPAH API
// =============================================
const JenisAPI = {
  getAll() {
    return apiFetch('/jenis-sampah');
  },
  create(data) {
    return apiFetch('/jenis-sampah', { method: 'POST', body: JSON.stringify(data) });
  },
  update(id, data) {
    return apiFetch(`/jenis-sampah/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
};

// =============================================
// PENARIKAN API
// =============================================
const PenarikanAPI = {
  getAll() {
    return apiFetch('/penarikan');
  },
  create(data) {
    return apiFetch('/penarikan', { method: 'POST', body: JSON.stringify(data) });
  }
};

// =============================================
// DASHBOARD API
// =============================================
const DashboardAPI = {
  getStats() {
    return apiFetch('/dashboard');
  }
};

// =============================================
// LAPORAN API
// =============================================
const LaporanAPI = {
  get(params = {}) {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/laporan${q ? '?' + q : ''}`);
  }
};
