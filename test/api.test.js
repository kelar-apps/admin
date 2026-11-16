import { describe, expect, it, vi } from 'vitest';
import { ApiError, callAdmin, errorMessage } from '../src/admin/api.js';

const respond = (body, { ok = true } = {}) => vi.fn(async () => ({ ok, json: async () => body }));

describe('callAdmin', () => {
  it('posts text/plain JSON with the action and token', async () => {
    const fetchImpl = respond({ admin: 'a@kelar.id', buyers: [] });
    const data = await callAdmin({ url: 'https://x/exec', accessToken: 'tok', action: 'admin.list', fetchImpl });
    expect(data.admin).toBe('a@kelar.id');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://x/exec');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toMatch(/^text\/plain/);
    expect(JSON.parse(init.body)).toEqual({ action: 'admin.list', accessToken: 'tok' });
  });

  it('payload cannot override the action or token', async () => {
    const fetchImpl = respond({ result: 'added' });
    await callAdmin({ url: 'u', accessToken: 'tok', action: 'admin.upsert', payload: { email: 'a@b.co', action: 'x', accessToken: 'y' }, fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ email: 'a@b.co', action: 'admin.upsert', accessToken: 'tok' });
  });

  it('turns server errors into ApiError with the code (and email for forbidden)', async () => {
    const err = await callAdmin({ url: 'u', accessToken: 't', action: 'admin.list', fetchImpl: respond({ error: 'forbidden', email: 'x@y.co' }) }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('forbidden');
    expect(err.email).toBe('x@y.co');
  });

  it('network, HTTP and JSON failures', async () => {
    const codeOf = (fetchImpl, url = 'u') => callAdmin({ url, accessToken: 't', action: 'admin.list', fetchImpl }).catch((e) => e.code);
    expect(await codeOf(vi.fn(async () => { throw new TypeError('offline'); }))).toBe('network');
    expect(await codeOf(respond({}, { ok: false }))).toBe('bad_response');
    expect(await codeOf(vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError(); } })))).toBe('bad_response');
    expect(await codeOf(respond({}), '')).toBe('not_configured');
  });
});

describe('errorMessage', () => {
  it('is friendly and specific', () => {
    expect(errorMessage('forbidden', { email: 'x@y.co' })).toBe('Akun x@y.co bukan admin Kelar.');
    expect(errorMessage('unknown_action')).toMatch(/Deploy versi terbaru/);
    expect(errorMessage('something-new')).toMatch(/Coba lagi/);
  });
});
