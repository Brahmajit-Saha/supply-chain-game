'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import EventBanners from '../components/EventBanners';

const PHASE_LABEL = {
  arrivals_resolved: 'Shipments arriving', demand_revealed: 'Demand revealed', strategy: 'Strategy — think',
  ordering_retailer: "Retailer's turn", ordering_wholesaler: "Wholesaler's turn",
  ordering_distributor: "Distributor's turn", ordering_factory: "Factory's turn", resolved: 'Round resolved',
};
const PHASE_SECS = { strategy: 30, ordering_retailer: 15, ordering_wholesaler: 15, ordering_distributor: 15, ordering_factory: 15 };
const UPSTREAM = { Retailer: 'Wholesaler', Wholesaler: 'Distributor', Distributor: 'Factory', Factory: 'your supplier' };
const money = (v) => '$' + Math.round(Number(v || 0)).toLocaleString();

export default function Play() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [teams, setTeams] = useState([]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [seat, setSeat] = useState(null);
  const [play, setPlay] = useState(null);
  const [orderQty, setOrderQty] = useState('');
  const [orderMsg, setOrderMsg] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef(null);

  const loadTeams = useCallback(async () => { const { data } = await supabase.rpc('get_team_counts'); setTeams(data || []); return data || []; }, []);
  const loadProfile = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { router.replace('/'); return null; }
    const { data } = await supabase.from('profiles').select('id, name, system_role, team_id').eq('id', sess.session.user.id).single();
    return data;
  }, [router]);
  const loadSeat = useCallback(async () => { const { data } = await supabase.rpc('get_my_seat'); const s = data && data.length ? data[0] : null; setSeat(s); return s; }, []);
  const loadPlay = useCallback(async () => { const { data } = await supabase.rpc('get_my_play_state'); setPlay(data && data.length ? data[0] : null); }, []);

  useEffect(() => {
    async function init() {
      const p = await loadProfile(); if (!p) return;
      if (p.system_role === 'MA') { router.replace('/admin'); return; }
      if (p.system_role === 'TableAdmin') { router.replace('/table'); return; }
      setProfile(p); if (p.name) setName(p.name);
      const ts = await loadTeams();
      if (p.team_id) { const t = ts.find((x) => x.id === p.team_id); setTeamName(t ? t.name : ''); await loadSeat(); await loadPlay(); }
      setLoading(false);
    }
    init();
  }, [router, loadProfile, loadTeams, loadSeat, loadPlay]);

  useEffect(() => {
    if (profile?.team_id && !picking) { pollRef.current = setInterval(() => { loadSeat(); loadPlay(); }, 2000); return () => clearInterval(pollRef.current); }
  }, [profile?.team_id, picking, loadSeat, loadPlay]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function submit() {
    setError('');
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!selected) { setError('Please choose a team.'); return; }
    setSubmitting(true);
    const { error } = await supabase.rpc('join_team', { p_team_id: selected, p_name: name.trim() });
    if (error) { setError(error.message); setSubmitting(false); return; }
    const p = await loadProfile(); const ts = await loadTeams();
    setProfile(p); const t = ts.find((x) => x.id === p.team_id); setTeamName(t ? t.name : ''); setPicking(false); setSubmitting(false);
  }
  async function placeOrder() {
    setOrderMsg(''); const q = parseInt(orderQty, 10);
    if (isNaN(q) || q < 0) { setOrderMsg('Enter a whole number, 0 or more.'); return; }
    setOrdering(true);
    const { error } = await supabase.rpc('submit_order', { p_quantity: q });
    if (error) setOrderMsg(error.message); else { setOrderMsg(''); setOrderQty(''); }
    await loadPlay(); setOrdering(false);
  }
  async function logout() { await supabase.auth.signOut(); router.replace('/'); }

  if (loading) return <div className="hud-wrap"><p style={{ color: 'var(--ink-dim)' }}>Loading…</p></div>;

  // ===== In-game dashboard =====
  if (seat && play && (play.status === 'running' || play.status === 'paused')) {
    const paused = play.status === 'paused';
    const myTurn = play.is_my_turn;
    const ordered = play.my_order != null;
    const remaining = play.phase_ends_at && !paused ? Math.max(0, Math.ceil((new Date(play.phase_ends_at).getTime() - now) / 1000)) : null;
    const barPct = remaining != null ? Math.max(0, Math.min(100, (remaining / (PHASE_SECS[play.phase] || 2)) * 100)) : 0;
    const shutdown = play.notice_active === 'shutdown';

    return (
      <div className="hud-wrap" style={{ maxWidth: 640 }}>
        <div className="cmdbar">
          <div>
            <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Table {play.my_table} · {teamName}</div>
            <div className="display" style={{ fontSize: 30, fontWeight: 700, color: 'var(--ink)' }}>{play.my_role}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={`phase-pill ${!paused ? 'live' : ''}`}>
              {paused ? '⏸ Paused' : (PHASE_LABEL[play.phase] || play.phase)}
              {remaining != null && <span className="mono" style={{ color: 'var(--cyan)' }}>{remaining}s</span>}
            </div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 6 }}>ROUND {play.current_round} / {play.total_rounds}</div>
          </div>
        </div>
        {!paused && <div className="timebar"><i style={{ width: `${barPct}%` }} /></div>}

        <div style={{ marginTop: 14 }}>
          <EventBanners active={play.notice_active} warning={play.notice_warning} warningIn={play.notice_warning_in} />
        </div>

        <div className="chain" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 6 }}>
          <div className="station"><div className="role">In stock</div><div className="inv mono" style={{ fontSize: 34 }}>{play.inventory ?? '—'}</div></div>
          <div className="station"><div className="role">Backlog owed</div><div className="inv mono" style={{ fontSize: 34, color: Number(play.backlog) > 0 ? 'var(--bad)' : 'var(--ink)' }}>{play.backlog ?? '—'}</div></div>
          <div className="station"><div className="role">Arriving next round</div><div className="inv mono" style={{ fontSize: 26 }}>{play.incoming_next ?? 0}</div></div>
          <div className="station"><div className="role">In-Transit{play.intransit_round ? ` · arrives R${play.intransit_round}` : ''}</div><div className="inv mono" style={{ fontSize: 26 }}>{play.intransit_qty ?? 0}</div></div>
        </div>

        <div className="chain" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
          <div className="station">
            <div className="role">{play.my_role === 'Retailer' ? 'Customer demand this round' : 'Order from your customer'}</div>
            <div className="inv mono" style={{ fontSize: 30, color: 'var(--cyan)' }}>{play.demand_below == null ? '—' : play.demand_below}</div>
          </div>
          <div className="station">
            <div className="role">Shared customer demand</div>
            {play.demand_sharing
              ? <div className="inv mono" style={{ fontSize: 30, color: 'var(--cyan)' }}>{play.shared_demand}</div>
              : <div style={{ color: 'var(--ink-dim)', fontSize: 15, marginTop: 10 }}>off</div>}
          </div>
        </div>

        {/* This round's cost — full width */}
        <div className="station" style={{ marginTop: 12, borderColor: 'var(--warn)' }}>
          <div className="role" style={{ color: 'var(--warn)' }}>This round&apos;s cost</div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 4 }}>
            <div className="mono" style={{ fontSize: 30, color: 'var(--ink)' }}>{money(play.round_total)}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
              holding {money(play.round_holding)} · backlog {money(play.round_backlog)} · transport {money(play.round_transport)}
            </div>
          </div>
        </div>

        {/* Static cost-rate reminder */}
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-dim)', letterSpacing: '0.02em', textAlign: 'center' }}>
          💡 Holding <b style={{ color: 'var(--ink)' }}>$5</b>/unit · Backlog <b style={{ color: 'var(--ink)' }}>$10</b>/unit · Transport <b style={{ color: 'var(--ink)' }}>$2</b>/truck (6u, +$1 if last truck &lt; 5)
        </div>

        {/* order box */}
        <div className="station" style={{ marginTop: 12, borderColor: myTurn && !paused && !ordered && !shutdown ? 'var(--cyan)' : 'var(--line)' }}>
          {shutdown ? (
            <div style={{ color: 'var(--bad)', fontSize: 14 }}>⛔ Production is shut down — no order this week.</div>
          ) : paused ? (
            <div style={{ color: 'var(--warn)', fontSize: 14 }}>Game paused by the host. Ordering is frozen until it resumes.</div>
          ) : ordered ? (
            <div style={{ color: 'var(--good)', fontSize: 15 }}>✓ Order placed: <b>{play.my_order}</b> units</div>
          ) : myTurn ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--cyan)', marginBottom: 8 }}>▶ YOUR TURN{remaining != null ? ` · ${remaining}s` : ''} — order from the <b>{UPSTREAM[play.my_role]}</b></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="input" type="number" min="0" max="500" value={orderQty} onChange={(e) => setOrderQty(e.target.value)} placeholder="Quantity (max 500)" style={{ flex: 1 }} autoFocus />
                <button className="btn btn-primary" onClick={placeOrder} disabled={ordering} style={{ minWidth: 120 }}>{ordering ? 'Placing…' : 'Place order'}</button>
              </div>
              {orderMsg && <div className="error-box" style={{ marginTop: 10 }}>{orderMsg}</div>}
            </>
          ) : (
            <div style={{ color: 'var(--ink-dim)', fontSize: 14 }}>Waiting — {PHASE_LABEL[play.phase] || play.phase}. Your order box unlocks on your turn.</div>
          )}
        </div>

        {/* TA-revealed cumulative cost */}
        {play.costs_visible && (
          <div className="station" style={{ marginTop: 12 }}>
            <div className="role">Your running total — shown by your Table Admin</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14, marginTop: 6 }}>
              <span>Holding <b>{money(play.my_holding)}</b></span>
              <span>Backlog <b>{money(play.my_backlog_cost)}</b></span>
              <span>Transport <b>{money(play.my_transport)}</b></span>
              <span style={{ color: 'var(--warn)' }}>Total <b>{money(play.my_total)}</b></span>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20 }}><button className="btn-ghost" onClick={logout}>Sign out</button></div>
      </div>
    );
  }

  // ===== Seated, not started: reveal =====
  if (seat) {
    return (
      <div className="hud-wrap" style={{ maxWidth: 480, textAlign: 'center' }}>
        <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 12 }}>You&apos;re seated</div>
        <div className="display" style={{ fontSize: 34, fontWeight: 700, color: 'var(--ink)' }}>{seat.role}</div>
        <p style={{ color: 'var(--ink-dim)', margin: '4px 0 24px' }}>Team {teamName}</p>
        <div className="station" style={{ padding: '20px 22px', marginBottom: 24, textAlign: 'left' }}>
          <div style={{ fontSize: 15, marginBottom: 6 }}>Please go to <b>Table {seat.table_number}</b>.</div>
          <div style={{ color: 'var(--ink-dim)', fontSize: 14 }}>Your Table Admin is <b style={{ color: 'var(--ink)' }}>{seat.ta_name || seat.ta_email}</b>. Sit with them and wait for the game to begin.</div>
        </div>
        <button className="btn-ghost" onClick={logout}>Sign out</button>
      </div>
    );
  }

  const joined = profile?.team_id && !picking;
  if (joined) {
    return (
      <div className="hud-wrap" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 12 }}>You&apos;re in</div>
        <div className="display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>Team {teamName}</div>
        <p style={{ color: 'var(--ink-dim)', margin: '8px 0 24px' }}>Thanks{profile.name ? `, ${profile.name}` : ''} — you&apos;re on Team {teamName}.</p>
        <div className="station" style={{ padding: '18px 20px', color: 'var(--ink-dim)', fontSize: 14, marginBottom: 24 }}>Please wait — the host is setting up the tables. Your role and table will appear here automatically.</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn-ghost" onClick={() => { setPicking(true); setSelected(profile.team_id); }}>Change team</button>
          <button className="btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="hud-wrap" style={{ maxWidth: 460 }}>
      <div className="eyebrow" style={{ color: 'var(--cyan)', marginBottom: 12, textAlign: 'center' }}>Join the game</div>
      <div className="display" style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', color: 'var(--ink)' }}>Your name &amp; team</div>
      <p style={{ color: 'var(--ink-dim)', margin: '6px 0 24px', textAlign: 'center', fontSize: 15 }}>Enter your name and pick a team.</p>
      <label style={fieldLabel}>Your name</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" />
      <label style={{ ...fieldLabel, marginTop: 18 }}>Choose a team</label>
      <div style={{ display: 'grid', gap: 10 }}>
        {teams.map((t) => {
          const full = Number(t.member_count) >= 4 && t.id !== profile?.team_id; const isSel = selected === t.id;
          return (
            <button key={t.id} type="button" disabled={full} onClick={() => setSelected(t.id)} style={teamOption(isSel, full)}>
              <span>{t.name}</span><span style={{ fontSize: 13, color: full ? 'var(--bad)' : 'var(--ink-dim)' }}>{full ? 'Full' : `${t.member_count}/4`}</span>
            </button>
          );
        })}
      </div>
      {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}
      <button className="btn btn-primary" onClick={submit} disabled={submitting} style={{ width: '100%', marginTop: 22 }}>{submitting ? 'Joining…' : 'Join team'}</button>
      {profile?.team_id && <button className="btn-ghost" onClick={() => setPicking(false)} style={{ width: '100%', marginTop: 10 }}>Cancel</button>}
    </div>
  );
}

const fieldLabel = { fontSize: 13, color: 'var(--ink-dim)', display: 'block', marginBottom: 6 };
function teamOption(sel, full) {
  return { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderRadius: 10,
    border: `1px solid ${sel ? 'var(--cyan)' : 'var(--line)'}`, background: sel ? 'rgba(53,208,255,0.1)' : 'var(--panel)',
    color: full ? 'var(--ink-dim)' : 'var(--ink)', fontSize: 15, cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.5 : 1, width: '100%', textAlign: 'left' };
}
