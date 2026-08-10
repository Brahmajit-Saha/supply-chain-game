'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

const PHASE_LABEL = {
  arrivals_resolved: 'Shipments arriving',
  demand_revealed: 'Demand revealed',
  strategy: 'Strategy — think',
  ordering_retailer: "Retailer's turn to order",
  ordering_wholesaler: "Wholesaler's turn to order",
  ordering_distributor: "Distributor's turn to order",
  ordering_factory: "Factory's turn to order",
  resolved: 'Round resolved',
};
const UPSTREAM = { Retailer: 'Wholesaler', Wholesaler: 'Distributor', Distributor: 'Factory', Factory: 'your supplier' };

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

  const loadTeams = useCallback(async () => {
    const { data } = await supabase.rpc('get_team_counts'); setTeams(data || []); return data || [];
  }, []);
  const loadProfile = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { router.replace('/'); return null; }
    const { data } = await supabase.from('profiles').select('id, name, system_role, team_id').eq('id', sess.session.user.id).single();
    return data;
  }, [router]);
  const loadSeat = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_seat');
    const s = data && data.length ? data[0] : null; setSeat(s); return s;
  }, []);
  const loadPlay = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_play_state');
    setPlay(data && data.length ? data[0] : null);
  }, []);

  useEffect(() => {
    async function init() {
      const p = await loadProfile();
      if (!p) return;
      if (p.system_role === 'MA') { router.replace('/admin'); return; }
      if (p.system_role === 'TableAdmin') { router.replace('/table'); return; }
      setProfile(p);
      if (p.name) setName(p.name);
      const ts = await loadTeams();
      if (p.team_id) {
        const t = ts.find((x) => x.id === p.team_id); setTeamName(t ? t.name : '');
        await loadSeat(); await loadPlay();
      }
      setLoading(false);
    }
    init();
  }, [router, loadProfile, loadTeams, loadSeat, loadPlay]);

  // Poll seat (pre-game) and play-state (in-game) while joined.
  useEffect(() => {
    if (profile?.team_id && !picking) {
      pollRef.current = setInterval(() => { loadSeat(); loadPlay(); }, 2500);
      return () => clearInterval(pollRef.current);
    }
  }, [profile?.team_id, picking, loadSeat, loadPlay]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function submit() {
    setError('');
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!selected) { setError('Please choose a team.'); return; }
    setSubmitting(true);
    const { error } = await supabase.rpc('join_team', { p_team_id: selected, p_name: name.trim() });
    if (error) { setError(error.message); setSubmitting(false); return; }
    const p = await loadProfile(); const ts = await loadTeams();
    setProfile(p); const t = ts.find((x) => x.id === p.team_id); setTeamName(t ? t.name : '');
    setPicking(false); setSubmitting(false);
  }

  async function placeOrder() {
    setOrderMsg('');
    const q = parseInt(orderQty, 10);
    if (isNaN(q) || q < 0) { setOrderMsg('Enter a whole number, 0 or more.'); return; }
    setOrdering(true);
    const { error } = await supabase.rpc('submit_order', { p_quantity: q });
    if (error) setOrderMsg(error.message); else { setOrderMsg(''); setOrderQty(''); }
    await loadPlay(); setOrdering(false);
  }

  async function logout() { await supabase.auth.signOut(); router.replace('/'); }

  if (loading) return <main style={center}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></main>;

  // ===== In-game dashboard =====
  if (seat && play && (play.status === 'running' || play.status === 'paused')) {
    const paused = play.status === 'paused';
    const myTurn = play.is_my_turn;
    const ordered = play.my_order != null;
    const remaining = play.phase_ends_at
      ? Math.max(0, Math.ceil((new Date(play.phase_ends_at).getTime() - now) / 1000))
      : null;
    return (
      <main style={{ ...center, alignItems: 'flex-start' }}>
        <div style={{ maxWidth: 560, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <div className="eyebrow">Table {play.my_table} · Team {teamName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Round {play.current_round} / {play.total_rounds}</div>
          </div>
          <h1 style={{ fontSize: 28, margin: '0 0 2px', fontWeight: 700 }}>{play.my_role}</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 18 }}>
            {PHASE_LABEL[play.phase] || play.phase}
            {!paused && remaining != null && <span style={{ color: 'var(--accent)', fontWeight: 600, marginLeft: 8 }}>· {remaining}s</span>}
            {paused && <span style={{ color: '#d29922', fontWeight: 600, marginLeft: 8 }}>· Paused</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <Stat label="On-hand inventory" value={play.inventory} />
            <Stat label="Backlog owed" value={play.backlog} danger={play.backlog > 0} />
            <Stat label="Arriving this round" value={play.incoming_this} />
            <Stat label="Arriving next round" value={play.incoming_next} />
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {play.my_role === 'Retailer' ? 'Customer demand this round' : 'Order from your customer (below you)'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{play.demand_below == null ? '—' : play.demand_below}</div>
          </div>

          {/* reserved demand-sharing slot */}
          <div className="card" style={{ padding: '10px 16px', marginBottom: 16, color: 'var(--text-muted)', fontSize: 13 }}>
            {play.demand_sharing
              ? <>Shared customer demand: <strong style={{ color: 'var(--text)' }}>{play.shared_demand}</strong></>
              : 'Shared customer demand — off'}
          </div>

          {/* order box */}
          <div className="card" style={{ padding: 18 }}>
            {paused ? (
              <div style={{ color: '#d29922', fontSize: 14 }}>Game paused by the host. Ordering is frozen until it resumes.</div>
            ) : ordered ? (
              <div style={{ color: 'var(--success)', fontSize: 15 }}>✓ Order placed: <strong>{play.my_order}</strong> units</div>
            ) : myTurn ? (
              <>
                <div style={{ fontSize: 14, marginBottom: 8 }}>
                  Your turn{remaining != null ? ` — ${remaining}s left` : ''} — how many units do you order from the <strong>{UPSTREAM[play.my_role]}</strong>?
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input className="input" type="number" min="0" value={orderQty}
                    onChange={(e) => setOrderQty(e.target.value)} placeholder="Quantity" style={{ flex: 1 }} autoFocus />
                  <button className="btn btn-primary" onClick={placeOrder} disabled={ordering} style={{ minWidth: 120 }}>
                    {ordering ? 'Placing…' : 'Place order'}
                  </button>
                </div>
                {orderMsg && <div className="error-box" style={{ marginTop: 10 }}>{orderMsg}</div>}
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                Waiting — {PHASE_LABEL[play.phase] || play.phase}. Your order box unlocks on your turn.
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button className="btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </main>
    );
  }

  // ===== Seated, game not started yet: reveal =====
  if (seat) {
    return (
      <main style={center}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>You&apos;re seated</div>
          <h1 style={{ fontSize: 30, margin: '0 0 4px', fontWeight: 700 }}>{seat.role}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 24px', fontSize: 16 }}>Team {teamName}</p>
          <div className="card" style={{ padding: '20px 22px', marginBottom: 24 }}>
            <div style={{ fontSize: 15, marginBottom: 6 }}>Please go to <strong>Table {seat.table_number}</strong>.</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Your Table Admin is <strong style={{ color: 'var(--text)' }}>{seat.ta_name || seat.ta_email}</strong>. Sit with them and wait for the game to begin.
            </div>
          </div>
          <button className="btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </main>
    );
  }

  const joined = profile?.team_id && !picking;

  // ===== Joined, waiting for seating =====
  if (joined) {
    return (
      <main style={center}>
        <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>You&apos;re in</div>
          <h1 style={{ fontSize: 26, margin: '0 0 8px', fontWeight: 700 }}>Team {teamName}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 24px' }}>Thanks{profile.name ? `, ${profile.name}` : ''} — you&apos;re on Team {teamName}.</p>
          <div className="card" style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
            Please wait — the host is setting up the tables. Your role and table will appear here automatically.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn-ghost" onClick={() => { setPicking(true); setSelected(profile.team_id); }}>Change team</button>
            <button className="btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </main>
    );
  }

  // ===== Pick name + team =====
  return (
    <main style={center}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        <div className="eyebrow" style={{ marginBottom: 12, textAlign: 'center' }}>Join the game</div>
        <h1 style={{ fontSize: 26, margin: '0 0 6px', textAlign: 'center', fontWeight: 700 }}>Your name &amp; team</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 24px', textAlign: 'center', fontSize: 15 }}>Enter your name and pick a team.</p>
        <label style={fieldLabel}>Your name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" />
        <label style={{ ...fieldLabel, marginTop: 18 }}>Choose a team</label>
        <div style={{ display: 'grid', gap: 10 }}>
          {teams.map((t) => {
            const full = Number(t.member_count) >= 4 && t.id !== profile?.team_id;
            const isSel = selected === t.id;
            return (
              <button key={t.id} type="button" disabled={full} onClick={() => setSelected(t.id)} style={teamOption(isSel, full)}>
                <span>{t.name}</span>
                <span style={{ fontSize: 13, color: full ? 'var(--danger)' : 'var(--text-muted)' }}>{full ? 'Full' : `${t.member_count}/4`}</span>
              </button>
            );
          })}
        </div>
        {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}
        <button className="btn btn-primary" onClick={submit} disabled={submitting} style={{ width: '100%', marginTop: 22 }}>
          {submitting ? 'Joining…' : 'Join team'}
        </button>
        {profile?.team_id && <button className="btn-ghost" onClick={() => setPicking(false)} style={{ width: '100%', marginTop: 10 }}>Cancel</button>}
      </div>
    </main>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: danger ? 'var(--danger)' : 'var(--text)' }}>{value == null ? '—' : value}</div>
    </div>
  );
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '92px 24px 64px' };
const fieldLabel = { fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 };
function teamOption(sel, full) {
  return {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderRadius: 8,
    border: `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`, background: sel ? 'var(--surface-2)' : 'var(--surface)',
    color: full ? 'var(--text-muted)' : 'var(--text)', fontSize: 15, cursor: full ? 'not-allowed' : 'pointer',
    opacity: full ? 0.5 : 1, width: '100%', textAlign: 'left',
  };
}
