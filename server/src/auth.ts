import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
import { createMemorySessionStore, type SessionStore } from './auth-sessions.js';

type AuthOptions = { username: string; password: string; origin: string; production: boolean; now?: () => number; sessions?: SessionStore };
const digest = (value: string) => createHash('sha256').update(value).digest();
const SESSION_MS = 90 * 24 * 60 * 60_000;
const LOCK_MS = 15 * 60_000;

export function createAuth(options: AuthOptions) {
  const now = options.now || Date.now;
  let origin = '';
  try { origin = new URL(options.origin).origin; } catch { /* Fail closed. */ }
  const secure = origin.startsWith('https://') || options.production;
  const configured = Boolean(origin && options.username.trim() && options.username.length <= 100
    && options.password.length >= 16 && options.password.length <= 1024
    && (!options.production || (origin.startsWith('https://') && options.sessions)));
  const usernameHash = digest(options.username);
  const passwordHash = digest(options.password);
  const cookieName = secure ? '__Host-zafran_session' : 'zafran_session';
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' };
  const sessions = options.sessions || createMemorySessionStore();
  // Bind stored tokens to the configured credentials without storing those credentials.
  // Changing either credential invalidates existing tokens, including after a restart.
  const tokenKey = (token: string) => createHmac('sha256', passwordHash).update(JSON.stringify([options.username, token])).digest('hex');
  let failures = 0; let windowEnd = 0; let blockedUntil = 0;
  const sessionKey = (req: Request) => {
    const token = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    return token && /^[a-f0-9]{64}$/.test(token) ? tokenKey(token) : '';
  };
  const validSession = async (req: Request) => {
    const key = sessionKey(req);
    if (!key) return false;
    const expires = await sessions.get(key);
    if (expires === undefined) return false;
    if (expires <= now()) { await sessions.delete(key); return false; }
    return true;
  };
  const sameOrigin: RequestHandler = (req, res, next) => {
    if (req.get('origin') !== origin || req.get('sec-fetch-site') === 'cross-site') {
      res.status(403).json({ error: 'Origen de la solicitud no permitido.' }); return;
    }
    next();
  };
  const requireSession: RequestHandler = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!configured) { res.status(503).json({ error: 'El acceso al panel todavía no está configurado.' }); return; }
    if (!await validSession(req)) { res.status(401).json({ error: 'Ingresá nuevamente para continuar.', code: 'AUTH_REQUIRED' }); return; }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { sameOrigin(req, res, next); return; }
    next();
  };
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/session', async (req, res) => {
    const authenticated = configured && await validSession(req);
    res.json({ authenticated, configured, ...(authenticated ? { username: options.username } : {}) });
  });
  router.post('/login', sameOrigin, async (req, res) => {
    if (!configured) { res.status(503).json({ error: 'El acceso al panel todavía no está configurado.' }); return; }
    if (blockedUntil > now()) {
      const retryAfter = Math.ceil((blockedUntil - now()) / 1000);
      res.set('Retry-After', String(retryAfter)).status(429).json({ error: 'Demasiados intentos. Probá nuevamente más tarde.', retryAfter }); return;
    }
    if (windowEnd <= now() || blockedUntil) { failures = 0; windowEnd = now() + LOCK_MS; blockedUntil = 0; }
    const { username, password } = req.body || {};
    const validInput = req.is('application/json') && typeof username === 'string' && username.length <= 100
      && typeof password === 'string' && password.length <= 1024;
    // Always compare both fixed-length digests; never reveal which field failed.
    const userMatches = timingSafeEqual(digest(validInput ? username : ''), usernameHash);
    const passwordMatches = timingSafeEqual(digest(validInput ? password : ''), passwordHash);
    if (!validInput || !userMatches || !passwordMatches) {
      failures++;
      if (failures >= 10) {
        blockedUntil = now() + LOCK_MS;
        res.set('Retry-After', '900').status(429).json({ error: 'Se alcanzaron 10 intentos fallidos. El acceso queda bloqueado por 15 minutos.', retryAfter: 900 }); return;
      }
      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' }); return;
    }
    failures = 0; windowEnd = 0;
    await sessions.delete(sessionKey(req));
    await sessions.prune(now());
    const token = randomBytes(32).toString('hex');
    await sessions.set(tokenKey(token), now() + SESSION_MS);
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: SESSION_MS });
    res.json({ authenticated: true, username: options.username });
  });
  router.post('/logout', sameOrigin, async (req, res) => {
    await sessions.delete(sessionKey(req));
    res.clearCookie(cookieName, cookieOptions);
    res.json({ authenticated: false });
  });
  return { router, requireSession };
}
