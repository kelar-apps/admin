// Kelar Admin: sign in with Google, add / re-activate buyers, and switch access
// on or off. All data lives in the "Pembeli" sheet behind the license server.
// Buyer data is kept in memory only (never stored on the device).
import { confirmDialog, h, mount, openSheet, toast } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { ensureToken, invalidateToken, signOut } from '../core/auth.js';
import { canPromptInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../core/pwa.js';
import { APP_VERSION, LICENSE_URL, PRODUCTS } from '../../config.js';
import { callAdmin, errorMessage } from './api.js';
import {
  ALL_PRODUCTS,
  countByStatus,
  extractEmail,
  filterBuyers,
  formatTanggal,
  isActive,
  mergeBuyer,
  productLabel,
  statusLabel,
  upsertMessage,
  validateBuyerForm,
} from './buyers.js';

const HINT_KEY = 'kelar.admin.email'; // last admin email, only to preselect the Google account
const PAGE = 50;
const FILTERS = [
  { id: 'semua', label: 'Semua' },
  { id: 'aktif', label: 'Aktif' },
  { id: 'nonaktif', label: 'Nonaktif' },
];

const state = {
  admin: '', // signed-in admin email ('' = show the login screen)
  buyers: [],
  signingIn: false,
  loginError: null, // { code, email }
  loading: false,
  listError: null,
  q: '',
  status: 'semua',
  limit: PAGE,
  busy: new Set(), // "email|produk" rows being saved
  online: navigator.onLine,
};

let screen; // <main>
let banner; // offline banner
let refs = null; // elements of the main screen that are updated in place

// ---------- Startup ----------

export function startAdmin(root) {
  banner = h(
    'div',
    { class: 'offline-banner', role: 'status', hidden: state.online },
    icon('cloudOff', { size: 18 }),
    'Kamu sedang offline. Perubahan butuh internet.',
  );
  screen = h('main', { class: 'app-shell app-shell--bare', id: 'screen', tabindex: '-1' });
  mount(root, banner, screen);
  document.body.setAttribute('data-bare', '');

  const onConnection = () => {
    state.online = navigator.onLine;
    banner.hidden = state.online;
    if (state.admin) updateWriteButtons();
    else render();
  };
  window.addEventListener('online', onConnection);
  window.addEventListener('offline', onConnection);
  onInstallChange(() => refs && renderInstallButton());
  render();
}

function render() {
  refs = null;
  if (state.admin) renderMain();
  else renderLogin();
}

// ---------- Server calls ----------

/** `tokenPromise` must come from ensureToken() called synchronously inside the tap. */
async function request(tokenPromise, action, payload) {
  const accessToken = await tokenPromise;
  try {
    return await callAdmin({ url: LICENSE_URL, accessToken, action, payload });
  } catch (err) {
    if (err.code === 'invalid_token') invalidateToken();
    throw err;
  }
}

const getToken = () => ensureToken({ hint: state.admin || readHint() });

/** Errors after login: lost admin rights go back to the login screen, the rest is a toast. */
function handleError(err) {
  const code = err?.code || 'failed';
  if (code === 'forbidden' || code === 'admin_not_configured') {
    signOut();
    state.admin = '';
    state.buyers = [];
    state.loginError = { code, email: err.email };
    render();
    return;
  }
  toast(errorMessage(code, { email: err?.email }), { duration: 5000 });
}

// ---------- Login ----------

function signIn({ selectAccount = false } = {}) {
  const tokenPromise = selectAccount ? ensureToken({ selectAccount: true }) : getToken(); // inside the tap
  state.signingIn = true;
  state.loginError = null;
  render();
  request(tokenPromise, 'admin.list')
    .then((data) => {
      state.admin = String(data.admin || '');
      state.buyers = Array.isArray(data.buyers) ? data.buyers : [];
      saveHint(state.admin);
    })
    .catch((err) => {
      if (err.code === 'forbidden') signOut();
      state.loginError = { code: err.code || 'failed', email: err.email };
    })
    .finally(() => {
      state.signingIn = false;
      render();
      if (state.admin) refs?.email.focus();
    });
}

function renderLogin() {
  const err = state.loginError;
  const offline = !state.online;
  const signInBtn = h(
    'button',
    { type: 'button', class: 'btn btn-primary btn-block', disabled: state.signingIn || offline, onClick: () => signIn() },
    state.signingIn ? 'Memeriksa akun…' : 'Masuk dengan Google',
  );
  const switchBtn =
    err?.code === 'forbidden' &&
    h(
      'button',
      { type: 'button', class: 'btn btn-secondary btn-block', disabled: state.signingIn || offline, onClick: () => signIn({ selectAccount: true }) },
      'Ganti akun Google',
    );
  let note = null;
  if (offline) note = 'Kamu sedang offline. Sambungkan internet untuk masuk.';
  else if (err && err.code !== 'popup_closed') note = errorMessage(err.code, { email: err.email });

  mount(
    screen,
    h(
      'section',
      { class: 'onboarding admin-login' },
      h(
        'div',
        { class: 'onboarding__hero admin-hero' },
        h('h1', { class: 'logo' }, h('img', { src: `${import.meta.env.BASE_URL}brand/kelar-logo-putih.svg`, alt: 'Kelar Apps', width: 146, height: 60 })),
        h('p', { class: 'onboarding__tagline' }, 'Kelar Admin'),
        h('p', { class: 'onboarding__subtitle' }, 'Kelola akses pembeli'),
      ),
      h(
        'ul',
        { class: 'onboarding__benefits' },
        [
          'Aktifkan pembeli dalam hitungan detik',
          'Langsung berlaku, tanpa buka spreadsheet',
          'Cabut akses kapan saja, misalnya saat refund',
        ].map((text) => h('li', {}, h('span', { class: 'tick' }, icon('check', { size: 16 })), h('span', {}, text))),
      ),
      h(
        'div',
        { class: 'onboarding__actions' },
        signInBtn,
        switchBtn,
        note && h('p', { class: 'onboarding__error', role: 'alert' }, note),
        h('p', { class: 'onboarding__fineprint' }, 'Khusus admin Kelar. Akun lain akan ditolak oleh server.'),
      ),
    ),
  );
  document.title = 'Kelar Admin';
}

function logout() {
  confirmDialog({
    title: 'Keluar dari Kelar Admin?',
    message: 'Kamu perlu masuk dengan Google lagi untuk mengelola pembeli.',
    confirmLabel: 'Keluar',
    onConfirm: () => {
      signOut();
      state.admin = '';
      state.buyers = [];
      state.loginError = null;
      render();
    },
  });
}

// ---------- Main screen ----------

function renderMain() {
  const productOptions = [...PRODUCTS, ALL_PRODUCTS].map((p) => h('option', { value: p }, productLabel(p)));
  const email = h('input', {
    id: 'buyer-email',
    class: 'input',
    type: 'email',
    inputmode: 'email',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    placeholder: 'nama@gmail.com',
    'aria-describedby': 'buyer-email-hint',
    onPaste: onEmailPaste,
    onInput: () => setFieldError(emailError, email, ''),
  });
  const emailError = h('p', { class: 'field-error', id: 'buyer-email-error', role: 'alert', hidden: true });
  const product = h('select', { id: 'buyer-product', class: 'select' }, productOptions);
  const refId = h('input', {
    id: 'buyer-ref',
    class: 'input',
    type: 'text',
    maxlength: 100,
    autocomplete: 'off',
    placeholder: 'Contoh: LYNK-12345',
  });
  const submit = h(
    'button',
    { type: 'submit', class: 'btn btn-primary btn-block', dataset: { write: '' } },
    icon('check', { size: 20 }),
    'Aktifkan akses',
  );

  const form = h(
    'form',
    { class: 'card admin-form', novalidate: true, 'aria-labelledby': 'form-title', onSubmit: (e) => onSubmit(e) },
    h('h2', { id: 'form-title' }, 'Aktifkan pembeli'),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'buyer-email' }, 'Email Google pembeli'),
      email,
      h('p', { class: 'field-hint', id: 'buyer-email-hint' }, 'Bisa juga tempel teks pesanan dari Lynk.id, email-nya diambil otomatis.'),
      emailError,
    ),
    h(
      'div',
      { class: 'admin-form__row' },
      h('div', { class: 'field' }, h('label', { for: 'buyer-product' }, 'Produk'), product),
      h('div', { class: 'field' }, h('label', { for: 'buyer-ref' }, 'No. pesanan ', h('span', { class: 'muted small' }, '(opsional)')), refId),
    ),
    submit,
  );

  const search = h('input', {
    class: 'input search__input',
    type: 'search',
    placeholder: 'Cari email atau no. pesanan',
    'aria-label': 'Cari pembeli',
    value: state.q,
    onInput: (e) => {
      state.q = e.target.value;
      state.limit = PAGE;
      renderList();
    },
  });
  const chips = FILTERS.map((f) =>
    h('button', {
      type: 'button',
      class: 'chip chip--toggle',
      dataset: { filter: f.id },
      onClick: () => {
        state.status = f.id;
        state.limit = PAGE;
        renderList();
      },
    }),
  );
  const refreshBtn = h(
    'button',
    { type: 'button', class: 'icon-btn', 'aria-label': 'Muat ulang daftar pembeli', onClick: () => refresh() },
    icon('refresh'),
  );
  const installSlot = h('span', { class: 'install-slot' });
  const summary = h('p', { class: 'small muted', 'aria-live': 'polite' });
  const list = h('ul', { class: 'card-list', 'aria-label': 'Daftar pembeli' });
  const more = h('div', { class: 'list-more' });

  refs = { email, emailError, product, refId, submit, chips, summary, list, more, refreshBtn, installSlot };

  mount(
    screen,
    h(
      'header',
      { class: 'screen-header screen-header--brand admin-header' },
      h(
        'div',
        { class: 'screen-header__row' },
        h('div', { class: 'screen-header__title' }, h('h1', {}, 'Kelar Admin')),
        h(
          'div',
          { class: 'screen-header__actions' },
          installSlot,
          refreshBtn,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Keluar', onClick: logout }, icon('logout')),
        ),
      ),
      h('p', { class: 'screen-header__subtitle admin-header__who' }, 'Masuk sebagai ', h('strong', {}, state.admin)),
    ),
    h(
      'div',
      { class: 'screen-body' },
      form,
      h(
        'section',
        { class: 'stack admin-list', 'aria-labelledby': 'list-title' },
        h('div', { class: 'section-head' }, h('h2', { id: 'list-title' }, 'Pembeli'), summary),
        h('div', { class: 'search' }, h('span', { class: 'search__icon' }, icon('search', { size: 20 })), search),
        h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Saring status' }, chips),
        list,
        more,
      ),
      h('p', { class: 'center small muted admin-version' }, `Kelar Admin v${APP_VERSION}`),
    ),
  );
  document.title = 'Pembeli — Kelar Admin';
  renderInstallButton();
  renderList();
  updateWriteButtons();
}

function setFieldError(errorEl, input, message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  input.setAttribute('aria-describedby', message ? 'buyer-email-hint buyer-email-error' : 'buyer-email-hint');
}

/** Pasting a whole order message keeps only the email address in it. */
function onEmailPaste(e) {
  const text = e.clipboardData?.getData('text') || '';
  const found = extractEmail(text);
  if (!found || text.trim().toLowerCase() === found) return; // plain email: let the browser paste it
  e.preventDefault();
  refs.email.value = found;
  setFieldError(refs.emailError, refs.email, '');
  toast(`Email diambil dari teks: ${found}`);
}

function onSubmit(e) {
  e.preventDefault();
  const { email, emailError, product, refId, submit } = refs;
  const { errors, value } = validateBuyerForm({ email: email.value, product: product.value, refId: refId.value }, PRODUCTS);
  setFieldError(emailError, email, errors.email || '');
  if (errors.email) {
    email.focus();
    return;
  }
  if (errors.product || errors.refId) {
    toast(errors.product || `No. pesanan: ${errors.refId}`);
    return;
  }
  if (!state.online || submit.dataset.busy) return;

  const tokenPromise = getToken(); // inside the tap
  submit.dataset.busy = '1';
  submit.disabled = true;
  submit.lastChild.textContent = 'Menyimpan…';
  request(tokenPromise, 'admin.upsert', { email: value.email, product: value.product, refId: value.refId })
    .then((res) => {
      state.buyers = mergeBuyer(state.buyers, res.buyer);
      email.value = '';
      refId.value = '';
      toast(upsertMessage(res.result, res.buyer.email));
      renderList();
      email.focus();
    })
    .catch(handleError)
    .finally(() => {
      if (!refs) return; // signed out meanwhile
      delete submit.dataset.busy;
      submit.lastChild.textContent = 'Aktifkan akses';
      updateWriteButtons();
    });
}

function refresh() {
  if (state.loading || !state.online) return;
  const tokenPromise = getToken(); // inside the tap
  state.loading = true;
  state.listError = null;
  renderList();
  request(tokenPromise, 'admin.list')
    .then((data) => {
      state.buyers = Array.isArray(data.buyers) ? data.buyers : [];
      toast('Daftar pembeli diperbarui');
    })
    .catch((err) => {
      state.listError = err.code;
      handleError(err);
    })
    .finally(() => {
      state.loading = false;
      if (refs) renderList();
    });
}

const rowKey = (b) => `${b.email}|${b.produk}`;

function setStatus(buyer, status) {
  const key = rowKey(buyer);
  if (state.busy.has(key) || !state.online) return;
  const tokenPromise = getToken(); // inside the tap
  state.busy.add(key);
  renderList();
  request(tokenPromise, 'admin.setStatus', { email: buyer.email, product: buyer.produk, status })
    .then((res) => {
      state.buyers = mergeBuyer(state.buyers, res.buyer);
      toast(status === 'aktif' ? `Akses ${buyer.email} diaktifkan lagi` : `Akses ${buyer.email} dinonaktifkan`);
    })
    .catch(handleError)
    .finally(() => {
      state.busy.delete(key);
      if (refs) renderList();
    });
}

function confirmDeactivate(buyer) {
  confirmDialog({
    title: 'Nonaktifkan akses?',
    message: `${buyer.email} tidak bisa lagi membuka ${productLabel(buyer.produk)}. Aplikasi di HP-nya akan terkunci paling lambat sekitar 1 hari. Kamu bisa mengaktifkannya lagi kapan saja.`,
    confirmLabel: 'Nonaktifkan',
    danger: true,
    onConfirm: () => setStatus(buyer, 'nonaktif'),
  });
}

// ---------- List ----------

function renderList() {
  if (!refs) return;
  const { chips, summary, list, more, refreshBtn } = refs;
  const counts = countByStatus(state.buyers);

  for (const chip of chips) {
    const f = FILTERS.find((x) => x.id === chip.dataset.filter);
    chip.setAttribute('aria-pressed', String(state.status === f.id));
    chip.textContent = `${f.label} (${counts[f.id]})`;
  }
  refreshBtn.classList.toggle('is-spinning', state.loading);
  refreshBtn.disabled = state.loading || !state.online;

  if (state.loading && state.buyers.length === 0) {
    summary.textContent = 'Memuat…';
    mount(list, [0, 1, 2].map(() => h('li', { class: 'skeleton skeleton--buyer', 'aria-hidden': 'true' })));
    mount(more);
    return;
  }

  const rows = filterBuyers(state.buyers, { q: state.q, status: state.status });
  summary.textContent = state.buyers.length ? `${counts.aktif} aktif dari ${counts.semua}` : '';

  if (rows.length === 0) {
    const filtered = state.q.trim() || state.status !== 'semua';
    mount(
      list,
      h(
        'li',
        { class: 'empty-state' },
        icon(filtered ? 'search' : 'mail', { size: 40 }),
        h('p', { class: 'small' }, filtered ? 'Tidak ada pembeli yang cocok.' : 'Belum ada pembeli. Aktifkan pembeli pertamamu lewat form di atas.'),
      ),
    );
    mount(more);
    return;
  }

  mount(list, rows.slice(0, state.limit).map(buyerCard));
  mount(
    more,
    rows.length > state.limit &&
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary btn-block',
          onClick: () => {
            state.limit += PAGE;
            renderList();
          },
        },
        `Tampilkan lebih banyak (${rows.length - state.limit} lagi)`,
      ),
  );
  updateWriteButtons();
}

function buyerCard(buyer) {
  const active = isActive(buyer);
  const busy = state.busy.has(rowKey(buyer));
  const meta = [productLabel(buyer.produk), formatTanggal(buyer.tanggal), buyer.ref_id].filter(Boolean).join(' · ');
  const action = active
    ? h(
        'button',
        { type: 'button', class: 'btn btn-secondary btn-sm', dataset: { write: '' }, disabled: busy, onClick: () => confirmDeactivate(buyer) },
        busy ? 'Menyimpan…' : 'Nonaktifkan',
      )
    : h(
        'button',
        { type: 'button', class: 'btn btn-primary btn-sm', dataset: { write: '' }, disabled: busy, onClick: () => setStatus(buyer, 'aktif') },
        busy ? 'Menyimpan…' : 'Aktifkan lagi',
      );
  if (busy) action.dataset.busy = '1';

  return h(
    'li',
    { class: active ? 'card buyer-card' : 'card buyer-card buyer-card--off' },
    h(
      'div',
      { class: 'buyer-card__top' },
      h('p', { class: 'buyer-card__email' }, emailWithBreak(buyer.email)),
      h('span', { class: active ? 'status-pill status-pill--on' : 'status-pill' }, statusLabel(buyer.status)),
    ),
    h('div', { class: 'buyer-card__bottom' }, h('p', { class: 'small muted' }, meta), action),
  );
}

/** Long emails wrap before the "@" instead of in the middle of a word. */
function emailWithBreak(email) {
  const at = email.indexOf('@');
  return at > 0 ? [email.slice(0, at), h('wbr'), email.slice(at)] : email;
}

/** Buttons that change data need internet and must not be pressed twice. */
function updateWriteButtons() {
  for (const btn of screen.querySelectorAll('[data-write]')) btn.disabled = !state.online || Boolean(btn.dataset.busy);
}

// ---------- Install ----------

function renderInstallButton() {
  if (!refs) return;
  const show = !isStandalone() && (canPromptInstall() || isIos());
  mount(
    refs.installSlot,
    show &&
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Pasang di HP', onClick: install }, icon('download')),
  );
}

function install() {
  if (canPromptInstall()) {
    promptInstall();
    return;
  }
  openSheet({
    title: 'Pasang di iPhone',
    body: h(
      'ol',
      { class: 'install-steps' },
      h('li', {}, 'Buka halaman ini di Safari.'),
      h('li', {}, 'Ketuk tombol Share (kotak dengan panah ke atas) di bawah layar.'),
      h('li', {}, 'Pilih "Add to Home Screen", lalu "Add".'),
    ),
  });
}

// ---------- Helpers ----------

function readHint() {
  try {
    return localStorage.getItem(HINT_KEY) || '';
  } catch {
    return '';
  }
}

function saveHint(email) {
  try {
    localStorage.setItem(HINT_KEY, email);
  } catch {
    /* storage blocked: the account chooser simply shows all accounts */
  }
}
