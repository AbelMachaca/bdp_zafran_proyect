import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAuth } from './auth.js';
import { createMemorySessionStore } from './auth-sessions.js';

const origin = 'https://panel.example.com';
const password = 'test-only-password-32-characters!';
async function setup(t: { after: (fn: () => Promise<void>) => void }, overrides = {}) {
  let time = 1_000_000;
  const auth = createAuth({ username: 'operator', password, origin, production: true, now: () => time, sessions: createMemorySessionStore(), ...overrides });
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/auth', auth.router);
  app.use('/api', auth.requireSession);
  app.all('/api/private', (_req, res) => { res.json({ private: true }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, init?: RequestInit) => fetch(`${base}/api${path}`, init);
  const login = (body = { username: 'operator', password }, headers = {}) => request('/auth/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { request, login, advance: (ms: number) => { time += ms; } };
}

test('protege la API y crea una cookie segura; logout revoca la sesión en el servidor', async (t) => {
  const { request, login } = await setup(t);
  assert.equal((await request('/private')).status, 401);
  assert.deepEqual(await (await request('/health')).json(), { ok: true });
  const response = await login();
  assert.equal(response.status, 200);
  const header = response.headers.get('set-cookie')!;
  for (const flag of ['__Host-zafran_session=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(header.includes(flag));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const cookie = header.split(';')[0]!;
  assert.equal((await request('/private', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await request('/private', { headers: { Cookie: `${cookie}tampered` } })).status, 401);
  assert.equal((await request('/private', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example.com' } })).status, 403);
  assert.equal((await request('/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin } })).status, 200);
  assert.equal((await request('/private', { headers: { Cookie: cookie } })).status, 401);
});

test('bloquea tras 10 fallos aunque cambien usuario o IP y permite volver tras 15 minutos', async (t) => {
  const { login, advance } = await setup(t);
  for (let i = 0; i < 10; i++) {
    const response = await login({ username: `invalid-${i}`, password: 'wrong' }, { 'X-Forwarded-For': `192.0.2.${i}` });
    assert.equal(response.status, i === 9 ? 429 : 401);
    if (i === 9) assert.equal(response.headers.get('retry-after'), '900');
  }
  assert.equal((await login()).status, 429);
  advance(15 * 60_000);
  assert.equal((await login()).status, 200);
});

test('rechaza CSRF, credenciales incorrectas y configuración ausente o insegura', async (t) => {
  const { request, login } = await setup(t);
  assert.equal((await login(undefined, { Origin: 'https://evil.example.com' })).status, 403);
  assert.equal((await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'operator', password }) })).status, 403);
  const wrongUser = await login({ username: 'wrong', password });
  const wrongPassword = await login({ username: 'operator', password: 'wrong' });
  assert.deepEqual(await wrongUser.json(), await wrongPassword.json());
  for (const overrides of [{ username: '' }, { password: '' }, { password: 'short' }, { sessions: undefined }, { origin: 'http://panel.example.com' }]) {
    const server = await setup(t, overrides);
    assert.equal((await server.request('/private')).status, 503);
    assert.equal((await (await server.request('/auth/session')).json()).configured, false);
  }
});

test('conserva la sesión durante 90 días sin actividad y no extiende su vencimiento', async (t) => {
  const { request, login, advance } = await setup(t);
  const response = await login();
  assert.match(response.headers.get('set-cookie')!, /Max-Age=7776000/);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  advance(89 * 24 * 60 * 60_000);
  const beforeExpiry = await request('/private', { headers: { Cookie: cookie } });
  assert.equal(beforeExpiry.status, 200);
  assert.equal(beforeExpiry.headers.get('set-cookie'), null);
  advance(24 * 60 * 60_000);
  assert.equal((await request('/private', { headers: { Cookie: cookie } })).status, 401);
});

test('conserva sesiones entre instancias con el mismo almacén y revoca al salir o cambiar credenciales', async (t) => {
  const sessions = createMemorySessionStore();
  const first = await setup(t, { sessions });
  const cookie = (await first.login()).headers.get('set-cookie')!.split(';')[0]!;
  const restarted = await setup(t, { sessions });
  assert.equal((await restarted.request('/private', { headers: { Cookie: cookie } })).status, 200);
  for (const credentials of [{ username: 'new-user' }, { password: 'new-password-with-32-characters!' }]) {
    const changed = await setup(t, { sessions, ...credentials });
    assert.equal((await changed.request('/private', { headers: { Cookie: cookie } })).status, 401);
  }
  await restarted.request('/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin } });
  assert.equal((await first.request('/private', { headers: { Cookie: cookie } })).status, 401);
});
