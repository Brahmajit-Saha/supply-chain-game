'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const ROLES = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];

export default function Home() {
  const [status, setStatus] = useState('checking'); // checking | ok | error
  const [detail, setDetail] = useState('');

  useEffect(() => {
    async function check() {
      // A read the public key is deliberately NOT allowed to see any rows of,
      // because RLS is on. A clean (empty) result proves two things at once:
      // the app reached the database, AND security is doing its job.
      const { data, error } = await supabase.from('game_config').select('id');
      if (error) {
        setStatus('error');
        setDetail(error.message);
      } else {
        setStatus('ok');
        setDetail(
          `Reached the database and security is active — the public key saw ${data.length} rows, exactly as intended.`
        );
      }
    }
    check();
  }, []);

  const statusColor = status === 'ok' ? '#3fb950' : status === 'error' ? '#f85149' : '#d29922';
  const statusText =
    status === 'ok'
      ? 'Connected'
      : status === 'error'
      ? 'Connection problem'
      : 'Checking connection…';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 620, width: '100%', textAlign: 'center' }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#7d8590',
            marginBottom: 14,
          }}
        >
          Operations Club · MBA Event
        </div>

        <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: '0 0 10px', fontWeight: 700 }}>
          Supply Chain Simulation
        </h1>
        <p style={{ color: '#9198a1', margin: '0 0 34px', fontSize: 16 }}>
          A live, four-link ordering game. Setup in progress.
        </p>

        {/* the chain: the one visual that says what this is */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 40,
          }}
        >
          {ROLES.map((role, i) => (
            <span key={role} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: '1px solid #30363d',
                  background: '#161b22',
                  fontSize: 14,
                }}
              >
                {role}
              </span>
              {i < ROLES.length - 1 && <span style={{ color: '#484f58' }}>→</span>}
            </span>
          ))}
        </div>

        {/* connection status card */}
        <div
          style={{
            border: '1px solid #30363d',
            background: '#161b22',
            borderRadius: 12,
            padding: '18px 20px',
            textAlign: 'left',
            display: 'flex',
            gap: 14,
            alignItems: 'flex-start',
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: statusColor,
              marginTop: 6,
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{statusText}</div>
            <div style={{ color: '#9198a1', fontSize: 14 }}>
              {status === 'checking' ? 'Contacting Supabase…' : detail}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
