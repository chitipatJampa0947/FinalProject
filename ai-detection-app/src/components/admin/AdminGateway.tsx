import { useEffect, useState, type FormEvent } from 'react';
import { getAdminClient } from '../../lib/supabaseClient';
import { requireAdministrator } from '../../security/adminAuthorization';
import { AdminDashboard } from './AdminDashboard';
export function AdminGateway({ onExit }: { onExit: () => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [authorized, setAuthorized] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false; let unsubscribe: (() => void) | undefined;
    void getAdminClient().then(client => {
      if (disposed) return;
      const { data } = client.auth.onAuthStateChange((_event, session) => { if (!session) setAuthorized(false); });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => { if (!disposed) setError('Secure backend is not configured.'); });
    return () => { disposed = true; unsubscribe?.(); };
  }, []);
  const login = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setAuthorized(false);
    try {
      const client = await getAdminClient();
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error) throw new Error('Sign-in failed. Check your credentials.');
      await requireAdministrator(client); setAuthorized(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Administrator access unavailable.');
      try { const client = await getAdminClient(); await client.auth.signOut({ scope: 'local' }); } catch { /* Already signed out. */ }
    } finally { setPassword(''); setBusy(false); }
  };
  const logout = async () => {
    setAuthorized(false);
    try {
      const client = await getAdminClient(); const result = await client.auth.signOut({ scope: 'global' });
      if (result.error) throw result.error;
      onExit();
    } catch { setError('Server sign-out could not be confirmed. Close this tab and revoke the session through your administrator.'); }
  };
  if (authorized) return <AdminDashboard onExit={() => void logout()} />;
  return <main className="max-w-lg mx-auto p-8 space-y-4">
    <h1>Administrator sign-in</h1><p>Access requires a server-managed administrator account. Sessions stay in this tab's memory.</p>
    <form onSubmit={event => void login(event)} className="space-y-4">
      <label className="block">Email<input className="block border p-2 w-full" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label className="block">Password<input className="block border p-2 w-full" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button className="border p-2" disabled={busy} type="submit">{busy ? 'Checking…' : 'Sign in'}</button>
    </form>{error && <p role="alert">{error}</p>}<button className="border p-2" onClick={onExit}>Return to inference</button>
  </main>;
}
