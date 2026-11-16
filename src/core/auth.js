// Google Identity Services (GIS) token client for Kelar Admin.
// - Identity only (openid email profile): the admin app never touches Drive.
// - The access token lives in memory only (never localStorage/sessionStorage).
// - requestAccessToken opens a popup, so it MUST run synchronously inside a user
//   gesture (click handler). Call `preloadGis()` at startup so the client is ready.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPES = 'openid email profile';
/** Refresh a little before Google's expiry to avoid failing mid-request. */
const EXPIRY_MARGIN_MS = 60 * 1000;

export class AuthError extends Error {
  /** @param {'popup_closed'|'popup_blocked'|'gis_unavailable'|'failed'} code */
  constructor(code, message) {
    super(message || code);
    this.name = 'AuthError';
    this.code = code;
  }
}

let gisPromise = null;
let tokenClient = null;
let clientId = '';
let token = null; // { value, expiresAt }
let pending = null; // { resolve, reject } for the in-flight request

/** Load the GIS script once. Resolves false (not throws) when offline or blocked. */
export function preloadGis(id) {
  clientId = id;
  if (!gisPromise) {
    gisPromise = new Promise((resolve) => {
      if (window.google?.accounts?.oauth2) return resolve(true);
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        gisPromise = null; // allow a retry later (e.g. when back online)
        resolve(false);
      };
      document.head.append(script);
    }).then((ok) => {
      if (ok) initClient();
      return ok;
    });
  }
  return gisPromise;
}

function initClient() {
  if (tokenClient || !clientId) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (response) => {
      if (response.error) {
        settle(new AuthError(response.error === 'access_denied' ? 'popup_closed' : 'failed', response.error_description));
        return;
      }
      token = { value: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 };
      settle(null, token.value);
    },
    error_callback: (err) => {
      const code =
        err?.type === 'popup_closed' ? 'popup_closed' : err?.type === 'popup_failed_to_open' ? 'popup_blocked' : 'failed';
      settle(new AuthError(code, err?.message));
    },
  });
}

function settle(error, value) {
  const p = pending;
  pending = null;
  if (!p) return;
  if (error) p.reject(error);
  else p.resolve(value);
}

export function isTokenValid(t, now = Date.now()) {
  return Boolean(t && t.value && t.expiresAt - EXPIRY_MARGIN_MS > now);
}

/**
 * Get a valid access token, opening the Google popup if needed.
 * Call this directly from a click handler, before any `await`.
 * @param {{ hint?: string, selectAccount?: boolean }} options
 */
export function ensureToken({ hint, selectAccount = false } = {}) {
  if (isTokenValid(token) && !selectAccount) return Promise.resolve(token.value);
  if (!tokenClient) return Promise.reject(new AuthError('gis_unavailable'));
  if (pending) pending.reject(new AuthError('popup_closed')); // superseded
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken(selectAccount ? { prompt: 'select_account' } : { prompt: '', hint });
  });
}

/** Forget the in-memory token (e.g. after the server said it is invalid). */
export function invalidateToken() {
  token = null;
}

/** Revoke access and forget the token. */
export function signOut() {
  const value = token?.value;
  token = null;
  if (value && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(value, () => {});
}
