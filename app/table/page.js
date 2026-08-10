'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import EventBanners from '../components/EventBanners';

const PHASE_LABEL = {
  arrivals_resolved: 'Arrivals resolved', demand_revealed: 'Demand revealed', strategy: 'Strategy',
  ordering_retailer: 'Ordering — Retailer', ordering_wholesaler: 'Ordering — Wholesaler',
  ordering_distributor: 'Ordering — Distributor', ordering_factory: 'Ordering — Factory', resolved: 'Round resolved',
};

export default function TableAdminView() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tableNo, setTableNo] = useState(null);
  const [control, setControl] = useState(null);
  const pollRef = useRef(null);

  const loadControl = useCallback(async () => {
    const { data } = await supabase.rpc('get_control');
    setControl(data && data.length ? data[0] : null);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { router.replace('/'); return; }
      const { data: prof } = await supabase.from('profiles').select('system_role, table_id').eq('id', sess.session.user.id).single();
      if (!prof || prof.system_role !== 'TableAdmin') { router.replace('/home'); return; }
      if (prof.table_id) {
        const { data: gt } = await supabase.from('game_table').select('number').eq('id', prof.table_id).single();
        setTableNo(gt?.number ?? null);
      }
      await loadControl();
      setLoading(false);
    }
    init();
  }, [router, loadControl]);

  useEffect(() => {
    pollRef.current = setInterval(() => { loadControl(); }, 2500);
    return () => clearInterval(pollRef.current);
  }, [loadControl]);

  async function logout() { await supabase.auth.signOut(); router.replace('/'); }

  if (loading) return <main style={center}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></main>;

  return (
    <main style={{ ...center, alignItems: 'flex-start' }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <div className="eyebrow">Table Admin</div>
          {control?.status === 'running' && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Round {control.current_round} / {control.total_rounds}</div>}
        </div>
        <h1 style={{ fontSize: 26, margin: '0 0 8px', fontWeight: 700 }}>{tableNo ? `Table ${tableNo}` : 'Your table'}</h1>

        {control && control.status !== 'setup' && (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 14 }}>
            {PHASE_LABEL[control.phase] || control.phase}
            {control.status === 'paused' && <span style={{ color: '#d29922', fontWeight: 600, marginLeft: 8 }}>· Paused</span>}
          </div>
        )}

        {control && (
          <EventBanners active={control.notice_active} warning={control.notice_warning} warningIn={control.notice_warning_in} />
        )}

        <div className="card" style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 14, margin: '10px 0 24px' }}>
          Your full table dashboard (all four roles, live) is being built next. For now this confirms
          you&apos;re the admin for {tableNo ? `Table ${tableNo}` : 'your table'} and shows the game&apos;s current status and events.
        </div>
        <button className="btn-ghost" onClick={logout}>Sign out</button>
      </div>
    </main>
  );
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '92px 24px 64px' };
