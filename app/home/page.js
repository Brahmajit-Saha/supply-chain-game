'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

const ROLE_LABEL = {
  MA: 'Master Admin',
  TableAdmin: 'Table Admin',
  Player: 'Player',
  Unassigned: 'Player — not yet on a team',
};

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace('/');
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('email, system_role')
        .eq('id', sess.session.user.id)
        .single();
      if (error) setError(error.message);
      else setProfile(data);
      setLoading(false);
    }
    load();
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

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
      <div style={{ width: '100%', maxWidth: 460, textAlign: 'center' }}>
        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

        {!loading && error && (
          <p style={{ color: 'var(--danger)' }}>Couldn’t load your profile: {error}</p>
        )}

        {!loading && profile && (
          <>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Signed in</div>
            <h1 style={{ fontSize: 28, margin: '0 0 6px', fontWeight: 700 }}>
              {ROLE_LABEL[profile.system_role] || profile.system_role}
            </h1>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 28px' }}>{profile.email}</p>

            <div
              className="card"
              style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}
            >
              Your dashboard is being built next. This screen confirms that login,
              your role, and the database security rules are all working.
            </div>

            <button className="btn-ghost" onClick={logout}>Sign out</button>
          </>
        )}
      </div>
    </main>
  );
}
