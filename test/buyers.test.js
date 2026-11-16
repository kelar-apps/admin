import { describe, expect, it } from 'vitest';
import {
  countByStatus,
  extractEmail,
  filterBuyers,
  formatTanggal,
  mergeBuyer,
  parseProducts,
  productLabel,
  statusLabel,
  upsertMessage,
  validateBuyerForm,
} from '../src/admin/buyers.js';

describe('products', () => {
  it('parseProducts cleans the list and never returns it empty', () => {
    expect(parseProducts('tracker-lamaran, Keuangan ;tracker-lamaran')).toEqual(['tracker-lamaran', 'keuangan']);
    expect(parseProducts('')).toEqual(['tracker-lamaran']);
    expect(parseProducts('semua, <script>')).toEqual(['tracker-lamaran']);
  });

  it('productLabel', () => {
    expect(productLabel('tracker-lamaran')).toBe('Tracker Lamaran');
    expect(productLabel('semua')).toBe('Semua produk');
    expect(productLabel('')).toBe('–');
  });
});

describe('extractEmail', () => {
  it('finds the email inside a pasted order message', () => {
    expect(extractEmail('Pesanan baru #LYNK-77\nPembeli: Budi\nEmail: Budi.S@Gmail.com.\nTotal Rp20.000')).toBe('budi.s@gmail.com');
    expect(extractEmail('tidak ada email di sini')).toBe('');
  });
});

describe('validateBuyerForm', () => {
  it('normalises the email and accepts known products', () => {
    const { errors, value } = validateBuyerForm({ email: ' Rina@Gmail.COM ', product: 'tracker-lamaran', refId: ' L-1 ' });
    expect(errors).toEqual({});
    expect(value).toEqual({ email: 'rina@gmail.com', product: 'tracker-lamaran', refId: 'L-1' });
    expect(validateBuyerForm({ email: 'a@b.co', product: 'semua' }).errors).toEqual({});
  });

  it('explains what is wrong', () => {
    expect(validateBuyerForm({ email: '', product: 'tracker-lamaran' }).errors.email).toBe('Email pembeli belum diisi');
    expect(validateBuyerForm({ email: 'rina@gmail', product: 'tracker-lamaran' }).errors.email).toMatch(/Format email/);
    expect(validateBuyerForm({ email: 'a@b.co', product: 'lain' }).errors.product).toBe('Pilih produk');
    expect(validateBuyerForm({ email: 'a@b.co', product: 'tracker-lamaran', refId: 'x'.repeat(101) }).errors.refId).toBeTruthy();
  });
});

describe('list', () => {
  const buyers = [
    { email: 'lama@gmail.com', produk: 'tracker-lamaran', tanggal: '2026-11-01', ref_id: 'L-1', status: 'aktif' },
    { email: 'baru@gmail.com', produk: 'tracker-lamaran', tanggal: '2026-11-16T02:00:00.000Z', ref_id: '', status: 'aktif' },
    { email: 'refund@gmail.com', produk: 'semua', tanggal: '2026-11-10', ref_id: 'L-3', status: 'nonaktif' },
    { email: 'tanpa-tanggal@gmail.com', produk: 'tracker-lamaran', tanggal: '', ref_id: '', status: 'refund' },
  ];
  const emails = (list) => list.map((b) => b.email.split('@')[0]);

  it('newest first, rows without a date last', () => {
    expect(emails(filterBuyers(buyers))).toEqual(['baru', 'refund', 'lama', 'tanpa-tanggal']);
  });

  it('filters by status (anything not "aktif" counts as nonaktif) and searches', () => {
    expect(emails(filterBuyers(buyers, { status: 'aktif' }))).toEqual(['baru', 'lama']);
    expect(emails(filterBuyers(buyers, { status: 'nonaktif' }))).toEqual(['refund', 'tanpa-tanggal']);
    expect(emails(filterBuyers(buyers, { q: 'L-3' }))).toEqual(['refund']);
    expect(emails(filterBuyers(buyers, { q: '  BARU ' }))).toEqual(['baru']);
  });

  it('countByStatus', () => {
    expect(countByStatus(buyers)).toEqual({ semua: 4, aktif: 2, nonaktif: 2 });
  });

  it('mergeBuyer replaces the same email + product, else adds', () => {
    const updated = mergeBuyer(buyers, { email: 'refund@gmail.com', produk: 'semua', status: 'aktif' });
    expect(updated[2]).toMatchObject({ email: 'refund@gmail.com', status: 'aktif', ref_id: 'L-3' });
    expect(updated).toHaveLength(4);
    expect(mergeBuyer(buyers, { email: 'refund@gmail.com', produk: 'tracker-lamaran', status: 'aktif' })).toHaveLength(5);
    expect(buyers[2].status).toBe('nonaktif'); // input not mutated
  });
});

describe('labels', () => {
  it('formatTanggal', () => {
    expect(formatTanggal('2026-11-16')).toBe('16 Nov 2026');
    expect(formatTanggal(new Date(2026, 0, 5, 12).toISOString())).toBe('5 Jan 2026');
    expect(formatTanggal('')).toBe('');
    expect(formatTanggal('kemarin')).toBe('kemarin');
  });

  it('upsertMessage and statusLabel', () => {
    expect(upsertMessage('added', 'a@b.co')).toBe('Akses a@b.co sudah aktif');
    expect(upsertMessage('reactivated', 'a@b.co')).toBe('Akses a@b.co diaktifkan lagi');
    expect(upsertMessage('already_active', 'a@b.co')).toBe('a@b.co memang sudah aktif');
    expect(statusLabel('refund')).toBe('Refund');
    expect(statusLabel('')).toBe('Tanpa status');
  });
});
