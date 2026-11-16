// App configuration, read from Vite env variables at build time.
// None of these values are secret: they end up in the public bundle. Who may use
// the admin actions is decided by the license server (ADMIN_EMAILS), not here.
import { parseProducts } from './src/admin/buyers.js';

const env = import.meta.env;
/** Values copied unchanged from .env.example count as not filled in. */
const real = (value) => (value && !/XXXXXXXX/.test(value) ? value : '');

export const CLIENT_ID = real(env.VITE_GOOGLE_CLIENT_ID);
export const LICENSE_URL = real(env.VITE_LICENSE_URL);
/** Products offered in the form, e.g. "tracker-lamaran,keuangan". */
export const PRODUCTS = parseProducts(env.VITE_PRODUCTS);
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** Names of required settings that are still empty, for a setup warning. */
export function missingConfig() {
  return Object.entries({ VITE_GOOGLE_CLIENT_ID: CLIENT_ID, VITE_LICENSE_URL: LICENSE_URL })
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
