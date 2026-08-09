'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function TableAdminView() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tableNo, setTableNo] = useState(null);

  useEffect(() => {
    async function init() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { router.replace('/'); return; }
      const { data: prof } = await supabase
        .from('profiles').select('system_role, table_id').eq('id', sess.session.user.id).single();
      if (!prof || prof.system_role !== 'TableAdmin') { router.replace('/home'); return; }
      if (prof.table_id) {
        const { data: gt } = await supabase.from('game_table').select('number').eq('id', prof.table_id).single();
        setTableNo(gt?.number ?? null);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  async function logout() { await supabase.auth.signOut(); router.replace('/'); }

  if (loading) return <main style={center}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></main>;

  return (
    <main style={center}>
      <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Table Admin</div>
        <h1 style={{ fontSize: 26, margin: '0 0 8px', fontWeight: 700 }}>
          {tableNo ? `Table ${tableNo}` : 'Your table'}
        </h1>
        <div className="card" style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
          Your table dashboard is being built. This confirms you&apos;re set up as the admin
          for {tableNo ? `Table ${tableNo}` : 'your table'}.
        </div>
        <button className="btn-ghost" onClick={logout}>Sign out</button>
      </div>
    </main>
  );
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '92px 24px 64px' };
