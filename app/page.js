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

  // If already logged in, skip the form.
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

    // First try to sign in as an existing user.
    const { error: signInError } = await supabase.auth.signInWithPassword(creds);

    if (signInError) {
      // Not an existing user (or wrong password) — try to create the account.
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

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#7d8590',
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          Operations Club · MBA Event
        </div>
        <h1 style={{ fontSize: 30, margin: '0 0 6px', textAlign: 'center', fontWeight: 700 }}>
          Supply Chain Simulation
        </h1>
        <p style={{ color: '#9198a1', margin: '0 0 28px', textAlign: 'center', fontSize: 15 }}>
          Sign in to take your seat.
        </p>

        <form onSubmit={handleLogin}>
          <label style={{ fontSize: 13, color: '#9198a1', display: 'block', marginBottom: 6 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`you@${ALLOWED_DOMAIN}`}
            autoComplete="email"
            required
            style={inputStyle}
          />

          <label
            style={{ fontSize: 13, color: '#9198a1', display: 'block', margin: '16px 0 6px' }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Shared event password"
            autoComplete="current-password"
            required
            style={inputStyle}
          />

          {error && (
            <div
              style={{
                marginTop: 16,
                color: '#f85149',
                background: 'rgba(248,81,73,0.1)',
                border: '1px solid rgba(248,81,73,0.3)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={buttonStyle(loading)}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  borderRadius: 8,
  border: '1px solid #30363d',
  background: '#0d1117',
  color: '#e6edf3',
  fontSize: 15,
  outline: 'none',
};

function buttonStyle(loading) {
  return {
    width: '100%',
    marginTop: 24,
    padding: '12px',
    borderRadius: 8,
    border: 'none',
    background: loading ? '#1f6feb88' : '#1f6feb',
    color: 'white',
    fontSize: 15,
    fontWeight: 600,
    cursor: loading ? 'default' : 'pointer',
  };
}
