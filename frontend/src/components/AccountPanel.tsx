import React, { useEffect, useState } from 'react';
import { getApiRoot } from '../lib/api';

type User = { id: number; username: string; csrf: string };
type KeyInfo = { id: number; name: string; gateway_key_prefix: string; created_at: string; revoked_at: string | null };
export const AccountPanel: React.FC<{ children: React.ReactNode; refreshKey: string; onLogout: () => void }> = ({ children, refreshKey, onLogout }) => {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [recovery, setRecovery] = useState('');
  const [savedCode, setSavedCode] = useState('');
  const [claim, setClaim] = useState('');
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);
  async function api(path: string, method = 'GET', body?: object) {
    const response = await fetch(getApiRoot() + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(user ? { 'X-CSRF-Token': user.csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || data.detail || 'Request failed');
    return data;
  }
  const reloadKeys = () => api('/api/credentials').then(setKeys).catch(e => setMessage(e.message));
  useEffect(() => { api('/api/account/session').then(setUser).catch(() => {}); }, []);
  useEffect(() => { if (user) reloadKeys(); }, [user, refreshKey]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const result = await api('/api/account/' + mode, 'POST', { username, password, recovery_code: recovery, password_confirmation: confirmation });
      setPassword(''); setRecovery(''); setConfirmation('');
      if (mode === 'login') { setUser(result); setSavedCode(''); }
      else { setSavedCode(result.recovery_code); setMode('login'); setMessage(result.message); }
    } catch (e: any) { setMessage(e.message); } finally { setBusy(false); }
  }
  const inputClass = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent p-3';
  const buttonClass = 'rounded-lg bg-hkbu-blue-700 text-white px-4 py-2 disabled:opacity-50';
  return <section className="space-y-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
    <h2 className="text-xl font-bold">Your account & API keys</h2>
    <p className="text-sm text-slate-500">Create a local account. Generating an API key still requires your own valid HKBU GenAI key.</p>
    {message && <p role="status" className="text-sm text-amber-600">{message}</p>}
    {savedCode && <div className="rounded-lg border border-amber-400 p-4 space-y-2"><strong>Save this recovery code now</strong><code className="block break-all select-all">{savedCode}</code><p className="text-sm">It is shown once. If you lose both your password and this code, contact the gateway operator for identity verification and a temporary reset code.</p><button type="button" className={buttonClass} onClick={() => { const blob = new Blob([savedCode + '\n'], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'hkbu-gateway-recovery-code.txt'; a.click(); URL.revokeObjectURL(url); }}>Download recovery code</button> <button className={buttonClass} onClick={() => setSavedCode('')}>I have saved it</button></div>}
    {!user ? <form onSubmit={submit} className="space-y-3 max-w-md">
      <div className="flex gap-3">{['login', 'register', 'recover'].map(item => <button type="button" key={item} onClick={() => setMode(item)} className={mode === item ? 'font-bold text-hkbu-blue-600' : 'text-slate-500'}>{item === 'recover' ? 'Recover account' : item === 'register' ? 'Register' : 'Sign in'}</button>)}</div>
      <input aria-label="Username" placeholder="Username" autoComplete="username" className={inputClass} value={username} onChange={e => setUsername(e.target.value)} minLength={3} maxLength={40} required />
      <input aria-label="Password" type="password" placeholder={mode === 'recover' ? 'New password (12+ characters)' : 'Password (12+ characters)'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={inputClass} value={password} onChange={e => setPassword(e.target.value)} minLength={12} maxLength={256} required />
      {mode !== 'login' && <input aria-label="Confirm password" type="password" placeholder="Confirm password" autoComplete="new-password" className={inputClass} value={confirmation} onChange={e => setConfirmation(e.target.value)} required />}
      {mode === 'recover' && <input aria-label="Recovery code" placeholder="Recovery code" className={inputClass} value={recovery} onChange={e => setRecovery(e.target.value)} required />}
      <button disabled={busy} className={buttonClass}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password'}</button>
    </form> : <>
      <div className="flex justify-between items-center"><span>Signed in as <strong>{user.username}</strong></span><button className={buttonClass} onClick={async () => { try { await api('/api/account/logout', 'POST'); setUser(null); setKeys([]); setClaim(''); onLogout(); } catch (e: any) { setMessage(e.message); } }}>Sign out</button></div>
      {children}
      <h3 className="font-bold">Your keys</h3>
      <p className="text-sm text-slate-500">Full keys appear only when created. Revocation immediately disables a key.</p>
      {keys.length === 0 && <p className="text-sm">No keys yet.</p>}
      {keys.map(key => <div key={key.id} className="flex flex-wrap items-center gap-3 border-t border-slate-200 dark:border-slate-700 py-3"><span className="flex-1">{key.name || 'API key'} · {key.gateway_key_prefix}… · {new Date(key.created_at).toLocaleDateString()} · {key.revoked_at ? 'Revoked' : 'Active'}</span>{!key.revoked_at && (confirmRevoke === key.id ? <><button className={buttonClass} onClick={async () => { try { await api('/api/credentials/' + key.id, 'DELETE'); setConfirmRevoke(null); reloadKeys(); } catch (e: any) { setMessage(e.message); } }}>Confirm revoke</button><button onClick={() => setConfirmRevoke(null)}>Cancel</button></> : <button className="text-red-600" onClick={() => setConfirmRevoke(key.id)}>Revoke</button>)}</div>)}
      <form className="flex gap-2" onSubmit={async e => { e.preventDefault(); try { await api('/api/credentials/claim', 'POST', { api_key: claim }); setClaim(''); reloadKeys(); } catch (e: any) { setMessage(e.message); } }}><input type="password" aria-label="Existing gateway key" placeholder="Existing gateway key to claim" className={inputClass} value={claim} onChange={e => setClaim(e.target.value)} required /><button className={buttonClass}>Claim</button></form>
    </>}
  </section>;
};
