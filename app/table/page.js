'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import EventBanners from '../components/EventBanners';

const ROLE_ORDER = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
const PHASE_LABEL = {
  arrivals_resolved: 'Shipments arriving', demand_revealed: 'Demand revealed', strategy: 'Strategy',
  ordering_retailer: 'Retailer ordering', ordering_wholesaler: 'Wholesaler ordering',
  ordering_distributor: 'Distributor ordering', ordering_factory: 'Factory ordering', resolved: 'Round resolved',
};
const PHASE_SECS = { strategy: 30, ordering_retailer: 10, ordering_wholesaler: 10, ordering_distributor: 10, ordering_factory: 10 };
const money = (v) => '$' + Math.round(Number(v || 0)).toLocaleString();

export default function TableAdminView() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tableNo, setTableNo] = useState(null);
  const [control, setControl] = useState(null);
  const [board, setBoard] = useState([]);
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    const { data: ctrl } = await supabase.rpc('get_control');
    setControl(ctrl && ctrl.length ? ctrl[0] : null);
    const { data: b } = await supabase.rpc('get_ta_board');
    setBoard(b || []);
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
      await load();
      setLoading(false);
    }
    init();
  }, [router, load]);

  useEffect(() => {
    pollRef.current = setInterval(load, 2000);
    return () => clearInterval(pollRef.current);
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function logout() { await supabase.auth.signOut(); router.replace('/'); }

  if (loading) return <div className="hud-wrap"><p style={{ color: 'var(--ink-dim)' }}>Loading command board…</p></div>;

  const status = control?.status || 'setup';
  const running = status === 'running';
  const paused = status === 'paused';
  const remaining = control?.phase_ends_at && running
    ? Math.max(0, Math.ceil((new Date(control.phase_ends_at).getTime() - now) / 1000)) : null;
  const dur = PHASE_SECS[control?.phase] || 2;
  const barPct = remaining != null ? Math.max(0, Math.min(100, (remaining / dur) * 100)) : 0;
  const total = board.reduce((s, r) => s + Number(r.cum_cost || 0), 0);
  const byRole = {};
  board.forEach((r) => { byRole[r.role] = r; });

  return (
    <div className="hud-wrap">
      <div className="cmdbar">
        <div>
          <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Table Admin</div>
          <div className="display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.02em' }}>
            TABLE {tableNo ?? '—'} · CONTROL
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {status !== 'setup' ? (
            <>
              <div className={`phase-pill ${running ? 'live' : ''}`}>
                {paused ? '⏸ Paused' : (PHASE_LABEL[control.phase] || control.phase)}
                {remaining != null && <span className="mono" style={{ color: 'var(--cyan)' }}>{remaining}s</span>}
              </div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 6 }}>
                ROUND {control.current_round} / {control.total_rounds}
              </div>
            </>
          ) : (
            <div className="phase-pill">Waiting to start</div>
          )}
        </div>
      </div>

      {running && <div className="timebar"><i style={{ width: `${barPct}%` }} /></div>}

      <div style={{ marginTop: 16 }}>
        {control && <EventBanners active={control.notice_active} warning={control.notice_warning} warningIn={control.notice_warning_in} />}
      </div>

      <div className="flow-legend">
        <span>📦 goods flow down</span><span style={{ color: 'var(--line)' }}>│</span>
        <span>↑ orders flow up</span><span style={{ color: 'var(--line)' }}>│</span>
        <span>Customer ← Retailer ← Wholesaler ← Distributor ← Factory ← Supply</span>
      </div>

      <div className="chain">
        {ROLE_ORDER.map((role) => {
          const r = byRole[role] || {};
          const isActive = control?.phase === `ordering_${role.toLowerCase()}`;
          const invPct = Math.max(4, Math.min(100, (Number(r.inventory || 0) / 60) * 100));
          const invColor = Number(r.inventory) > 0 ? 'var(--good)' : 'var(--ink-dim)';
          return (
            <div key={role} className={`station ${isActive ? 'active' : ''}`}>
              <div className="role">{role}</div>
              <div className="who">{r.player_name || '—'}</div>
              <div className="inv mono">{r.inventory ?? '—'}<small>IN STOCK</small></div>
              <div className="gauge"><i style={{ width: `${invPct}%`, background: invColor }} /></div>
              <div style={{ marginBottom: 8 }}>
                {Number(r.backlog) > 0
                  ? <span className="pill bad mono">BACKLOG {r.backlog}</span>
                  : <span className="pill ok">no backlog</span>}
              </div>
              <div className="metric"><span>ordered this rd</span><b className="mono">{r.last_order == null ? '—' : r.last_order}</b></div>
              <div className="metric"><span>arriving now</span><b className="mono">{r.incoming_this ?? 0}</b></div>
              <div className="metric" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                <span>cost so far</span><b className="mono" style={{ color: 'var(--warn)' }}>{money(r.cum_cost)}</b>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <div className="display" style={{ fontSize: 14, letterSpacing: '0.1em', color: 'var(--ink-dim)' }}>
          TABLE TOTAL COST&nbsp;&nbsp;<span className="mono" style={{ fontSize: 22, color: 'var(--ink)' }}>{money(total)}</span>
        </div>
        <button className="btn-ghost" onClick={logout}>Sign out</button>
      </div>

      <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 20 }}>
        Pause &amp; player-takeover controls arrive next. This board is yours to watch — players never see costs here.
      </p>
    </div>
  );
}
