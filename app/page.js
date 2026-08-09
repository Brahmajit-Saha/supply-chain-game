'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

const ALLOWED_DOMAIN = 'ibsindia.org';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/home');
      else setCheckingSession(false);
    });
  }, [router]);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.endsWith('@' + ALLOWED_DOMAIN)) {
      setError(`Please use your @${ALLOWED_DOMAIN} email address.`);
      return;
    }

    setLoading(true);
    const creds = { email: cleanEmail, password };

    const { error: signInError } = await supabase.auth.signInWithPassword(creds);

    if (signInError) {
      const { error: signUpError } = await supabase.auth.signUp(creds);
      if (signUpError) {
        const msg = (signUpError.message || '').toLowerCase();
        if (msg.includes('already registered')) {
          setError('That email exists, but the password is incorrect.');
        } else if (msg.includes(ALLOWED_DOMAIN) || msg.includes('allowed')) {
          setError(`Please use your @${ALLOWED_DOMAIN} email address.`);
        } else {
          setError(signUpError.message);
        }
        setLoading(false);
        return;
      }
    }

    router.replace('/home');
  }

  if (checkingSession) return null;

  const labelStyle = { fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div className="eyebrow" style={{ marginBottom: 12, textAlign: 'center' }}>
          OPSPHERE · MBA Event
        </div>
        <h1 style={{ fontSize: 30, margin: '0 0 6px', textAlign: 'center', fontWeight: 700 }}>
          Supply Chain Simulation
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 28px', textAlign: 'center', fontSize: 15 }}>
          Sign in to take your seat.
        </p>

        <form onSubmit={handleLogin}>
          <label style={labelStyle}>Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`you@${ALLOWED_DOMAIN}`}
            autoComplete="email"
            required
          />

          <label style={{ ...labelStyle, marginTop: 16 }}>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Shared event password"
            autoComplete="current-password"
            required
          />

          {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 24 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
