import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from './api';

type Session = { authenticated: boolean; configured: boolean };
export function AuthGate({ children }: { children: (logout: () => void) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const check = () => {
    setError('');
    api<Session>('/auth/session').then(setSession).catch(() => setError('No pudimos conectar con el servidor. Intentá nuevamente.'));
  };
  useEffect(() => {
    check();
    const expired = () => { setSession({ authenticated: false, configured: true }); setPassword(''); setError('Tu sesión venció. Ingresá nuevamente.'); };
    window.addEventListener('auth-expired', expired);
    return () => window.removeEventListener('auth-expired', expired);
  }, []);
  const login = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      // Confirm that the browser accepted the HttpOnly cookie before mounting the panel.
      const result = await api<Session>('/auth/session');
      if (!result.authenticated) throw new Error('No se pudo guardar la sesión. Revisá que estés usando HTTPS y permitas cookies.');
      setSession(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos iniciar sesión.'); }
    finally { setPassword(''); setBusy(false); }
  };
  const logout = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api('/auth/logout', { method: 'POST' });
      setSession({ authenticated: false, configured: true }); setPassword('');
    } catch { setError('No pudimos cerrar la sesión. Intentá nuevamente.'); }
    finally { setBusy(false); }
  };
  if (session?.authenticated) return <>{error && <div className="auth-notice" role="alert">{error}</div>}{children(() => { void logout(); })}</>;
  return <div className="login-page"><section className="login-card" aria-labelledby="login-title">
    <div className="login-brand"><span>Z</span><div><strong>Zafrán</strong><small>Commerce intelligence</small></div></div>
    <div className="login-icon"><LockKeyhole size={25} /></div>
    <h1 id="login-title">Ingresá a tu panel</h1>
    <p>Usá tus credenciales para consultar la información de la tienda.</p>
    {error && <div className="login-error" role="alert">{error}</div>}
    {!session ? <div role="status">{error ? <button className="primary" onClick={check}>Reintentar conexión</button> : <span><RefreshCw className="spin" size={16} /> Verificando sesión…</span>}</div>
      : !session.configured ? <div className="login-error" role="alert">El acceso todavía no está configurado. Contactá al administrador del panel.</div>
      : <form onSubmit={(event) => { void login(event); }}>
        <label htmlFor="login-username">Usuario</label>
        <input id="login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={100} disabled={busy} autoFocus />
        <label htmlFor="login-password">Contraseña</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={1024} disabled={busy} />
        <button className="primary" type="submit" disabled={busy}>{busy ? <><RefreshCw className="spin" /> Ingresando…</> : <><LockKeyhole /> Ingresar</>}</button>
      </form>}
    <div className="login-foot"><ShieldCheck size={16} /> Sesión guardada por 90 días en este navegador</div>
  </section></div>;
}
