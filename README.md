# Kelar Admin

Aplikasi kecil (PWA) untuk mengelola pembeli aplikasi Kelar dari HP: aktifkan pembeli baru, nonaktifkan (misalnya saat refund), dan aktifkan lagi. Tanpa membuka spreadsheet.

- Link: `https://kelar-apps.github.io/admin/`
- Data tetap di sheet **Pembeli**. Aplikasi ini hanya bicara dengan server lisensi Kelar (Apps Script), tidak menyimpan data pembeli di HP.
- Hanya akun di Script Property `ADMIN_EMAILS` yang bisa memakai. Akun lain ditolak oleh server, jadi aman walaupun link-nya diketahui orang.
- Perubahan langsung berlaku (cache lisensi di server ikut dihapus). Pembeli yang dinonaktifkan akan terkunci di HP-nya paling lambat sekitar 1 hari (aplikasi pembeli mengecek ulang di latar belakang).

## Cara pakai

1. Buka aplikasi, **Masuk dengan Google** pakai akun admin.
2. Ketik email pembeli (atau tempel teks pesanan dari Lynk.id, email-nya diambil otomatis), pilih produk, isi no. pesanan kalau ada, lalu **Aktifkan akses**.
3. Di daftar **Pembeli**: cari, saring Aktif/Nonaktif, dan tombol **Nonaktifkan** / **Aktifkan lagi**.

Kalau email yang sama sudah ada untuk produk yang sama, barisnya diaktifkan ulang, tidak dibuat baris baru.

## Persiapan (sekali saja)

### 1. Update server lisensi

Kode server ada di repo Tracker: `apps-script/Code.gs` (lihat `apps-script/README.md` di sana).

1. Buka project Apps Script **Kelar Lisensi**, ganti seluruh isi `Code.gs` dengan versi terbaru, **Save**.
2. **Project Settings → Script Properties → Add script property**: `ADMIN_EMAILS` = email admin (pisahkan dengan koma kalau lebih dari satu).
3. **Deploy → Manage deployments →** ikon pensil → Version: **New version** → **Deploy**. URL tetap sama.

### 2. Google Cloud

Origin `https://kelar-apps.github.io` sudah terdaftar untuk Tracker, jadi tidak perlu diubah. Untuk mencoba di laptop, origin `http://localhost:5173` juga sudah ada.

### 3. Deploy ke GitHub Pages

1. Buat repo **`admin`** (Public) di akun `kelar-apps`, lalu push isi folder ini.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_GOOGLE_CLIENT_ID` (sama dengan Tracker)
   - `VITE_LICENSE_URL` (sama dengan Tracker)
   - `VITE_PRODUCTS` (opsional, default `tracker-lamaran`; pisahkan dengan koma kalau produk bertambah)
4. **Actions → Deploy ke GitHub Pages → Run workflow**, tunggu hijau.

## Pengembangan

```bash
npm install
npm run dev     # http://localhost:5173 (hentikan dev server Tracker dulu, port-nya sama)
npm test
npm run build
```

Isi `.env` dari `.env.example`. File `.env` tidak ikut di-commit.

## Keamanan

- Access token Google hanya di memori (tidak di localStorage).
- Scope login hanya `openid email profile` (tanpa akses Drive).
- Data pembeli tidak disimpan di perangkat dan tidak di-cache service worker.
- Semua data dari server ditampilkan sebagai teks (tanpa `innerHTML`).
- Server menulis ke sheet sebagai teks biasa (awalan `'`), jadi isian seperti `=RUMUS()` tidak dijalankan.
