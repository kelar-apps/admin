// Pure helpers for the buyer list and form (no DOM, easy to test).

export const DEFAULT_PRODUCT = 'tracker-lamaran';
/** Product id that unlocks every Kelar app. */
export const ALL_PRODUCTS = 'semua';
const PRODUCT_RE = /^[a-z0-9-]{1,64}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_IN_TEXT_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** "tracker-lamaran, keuangan" → ['tracker-lamaran', 'keuangan']. Never empty. */
export function parseProducts(raw) {
  const list = String(raw || '')
    .split(/[,;\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => PRODUCT_RE.test(p) && p !== ALL_PRODUCTS);
  const unique = [...new Set(list)];
  return unique.length ? unique : [DEFAULT_PRODUCT];
}

/** "tracker-lamaran" → "Tracker Lamaran", "semua" → "Semua produk". */
export function productLabel(id) {
  if (id === ALL_PRODUCTS) return 'Semua produk';
  const text = String(id || '').replace(/-/g, ' ').trim();
  return text ? text.replace(/\b\w/g, (c) => c.toUpperCase()) : '–';
}

export function normalizeEmail(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}

export function isValidEmail(email) {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/**
 * The first email address inside a longer text (e.g. a pasted order notification),
 * or '' when there is none.
 */
export function extractEmail(text) {
  const match = String(text ?? '').match(EMAIL_IN_TEXT_RE);
  return match ? match[0].toLowerCase().replace(/\.+$/, '') : '';
}

/**
 * Check the "Aktifkan" form.
 * @returns {{ errors: Record<string,string>, value: { email: string, product: string, refId: string } }}
 */
export function validateBuyerForm({ email, product, refId } = {}, products = [DEFAULT_PRODUCT]) {
  const errors = {};
  const value = {
    email: normalizeEmail(email),
    product: String(product || '').trim().toLowerCase(),
    refId: String(refId ?? '').trim(),
  };
  if (!value.email) errors.email = 'Email pembeli belum diisi';
  else if (!isValidEmail(value.email)) errors.email = 'Format email belum benar, contoh: nama@gmail.com';
  if (![...products, ALL_PRODUCTS].includes(value.product)) errors.product = 'Pilih produk';
  if (value.refId.length > 100) errors.refId = 'Maksimal 100 karakter';
  return { errors, value };
}

/** Timestamp for sorting; rows without a readable date sort last. */
function timeOf(value) {
  if (!value) return -Infinity;
  const t = Date.parse(value);
  return Number.isNaN(t) ? -Infinity : t;
}

export const isActive = (buyer) => buyer.status === 'aktif';

/**
 * Filter and sort for the list: newest first; rows with the same (or no) date keep
 * "added later = higher" order from the sheet.
 * @param {Array} buyers  rows in sheet order
 * @param {{ q?: string, status?: 'semua'|'aktif'|'nonaktif' }} options
 */
export function filterBuyers(buyers, { q = '', status = 'semua' } = {}) {
  const query = q.trim().toLowerCase();
  return buyers
    .map((buyer, index) => ({ buyer, index }))
    .filter(({ buyer }) => {
      if (status === 'aktif' && !isActive(buyer)) return false;
      if (status === 'nonaktif' && isActive(buyer)) return false;
      if (!query) return true;
      return [buyer.email, buyer.ref_id, buyer.produk].some((v) => String(v || '').toLowerCase().includes(query));
    })
    .sort((a, b) => timeOf(b.buyer.tanggal) - timeOf(a.buyer.tanggal) || b.index - a.index)
    .map(({ buyer }) => buyer);
}

export function countByStatus(buyers) {
  const aktif = buyers.filter(isActive).length;
  return { semua: buyers.length, aktif, nonaktif: buyers.length - aktif };
}

/** Put a buyer returned by the server into the list (replace same email + product, else add). */
export function mergeBuyer(buyers, buyer) {
  const i = buyers.findIndex((b) => b.email === buyer.email && b.produk === buyer.produk);
  if (i === -1) return [...buyers, buyer];
  return buyers.map((b, j) => (j === i ? { ...b, ...buyer } : b));
}

/** "2026-11-16T02:00:00.000Z" or "2026-11-16" → "16 Nov 2026" (local time). */
export function formatTanggal(value) {
  if (!value) return '';
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Toast text after "Aktifkan". */
export function upsertMessage(result, email) {
  if (result === 'added') return `Akses ${email} sudah aktif`;
  if (result === 'reactivated') return `Akses ${email} diaktifkan lagi`;
  if (result === 'already_active') return `${email} memang sudah aktif`;
  return 'Tersimpan';
}

export function statusLabel(status) {
  if (status === 'aktif') return 'Aktif';
  if (status === 'nonaktif') return 'Nonaktif';
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Tanpa status';
}
