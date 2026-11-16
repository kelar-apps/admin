// Calls to the admin actions of the Kelar license server (Apps Script web app).
// Sent as text/plain so the browser makes a "simple request" (no CORS preflight,
// which Apps Script cannot answer). The access token proves who the admin is; the
// server checks it against its ADMIN_EMAILS list.

export class ApiError extends Error {
  /**
   * @param {string} code  network | bad_response | not_configured, or a server code:
   *   invalid_token | forbidden | admin_not_configured | invalid_email | invalid_product |
   *   invalid_ref | invalid_status | not_found | unknown_action | bad_request | server
   */
  constructor(code, { email = '' } = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.email = email;
  }
}

/**
 * @param {{ url: string, accessToken: string, action: string, payload?: object, fetchImpl?: typeof fetch }} options
 * @returns {Promise<object>} the server's JSON answer
 */
export async function callAdmin({ url, accessToken, action, payload = {}, fetchImpl = globalThis.fetch }) {
  if (!url) throw new ApiError('not_configured');
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, accessToken }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('network');
  }
  if (!res.ok) throw new ApiError('bad_response');
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('bad_response');
  }
  if (!data || typeof data !== 'object') throw new ApiError('bad_response');
  if (data.error) throw new ApiError(String(data.error), { email: String(data.email || '') });
  return data;
}

/** Friendly Indonesian message for an error code. */
export function errorMessage(code, { email = '' } = {}) {
  switch (code) {
    case 'network':
      return 'Server tidak bisa dihubungi. Cek koneksi internetmu, lalu coba lagi.';
    case 'forbidden':
      return email ? `Akun ${email} bukan admin Kelar.` : 'Akun ini bukan admin Kelar.';
    case 'admin_not_configured':
      return 'Server belum punya daftar admin. Isi Script Property ADMIN_EMAILS di Apps Script.';
    case 'invalid_token':
    case 'expired':
      return 'Sesi login sudah habis. Coba lagi, nanti diminta masuk ulang.';
    case 'invalid_email':
      return 'Format email belum benar.';
    case 'invalid_product':
      return 'Produk tidak dikenal.';
    case 'invalid_ref':
      return 'Nomor pesanan terlalu panjang.';
    case 'not_found':
      return 'Pembeli ini tidak ada lagi di sheet. Muat ulang daftarnya.';
    case 'unknown_action':
      return 'Server lisensi belum diperbarui. Deploy versi terbaru Code.gs dulu.';
    case 'not_configured':
      return 'Alamat server lisensi (VITE_LICENSE_URL) belum diisi.';
    case 'popup_closed':
      return 'Login dibatalkan.';
    case 'popup_blocked':
      return 'Popup login diblokir browser. Izinkan popup, lalu coba lagi.';
    case 'gis_unavailable':
      return 'Login Google belum siap. Cek koneksi, lalu coba lagi.';
    default:
      return 'Terjadi kesalahan di server. Coba lagi sebentar lagi.';
  }
}
