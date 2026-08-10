'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import EventBanners from '../components/EventBanners';

const ROLE_ORDER = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
const UPSTREAM = { Retailer: 'Wholesaler', Wholesaler: 'Distributor', Distributor: 'Factory', Factory: 'the supplier' };
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [scoresShown, setScoresShown] = useState(false);

  const [takeover, setTakeover] = useState(false);         // in takeover mode
  const [controlled, setControlled] = useState([]);        // roles being controlled
  const [tkStates, setTkStates] = useState({});            // role -> state
  const [tkQty, setTkQty] = useState({});
  const [tkMsg, setTkMsg] = useState('');
  const pollRef = useRef(null);
  const controlledRef = useRef(controlled);
  controlledRef.current = controlled;

  const load = useCallback(async () => {
    const { data: ctrl } = await supabase.rpc('get_control');
    setControl(ctrl && ctrl.length ? ctrl[0] : null);
    const { data: b } = await supabase.rpc('get_ta_board');
    setBoard(b || []);
    const roles = controlledRef.current;
    if (roles.length) {
      const next = {};
      for (const role of roles) {
        const { data } = await supabase.rpc('get_takeover_state', { p_role: role });
        next[role] = data && data.length ? data[0] : {};
      }
      setTkStates(next);
    }
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

  useEffect(() => { pollRef.current = setInterval(load, 2000); return () => clearInterval(pollRef.current); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (control && control.status !== 'paused') {
      setTakeover(false); setControlled([]); setTkStates({}); setTkQty({});
    }
  }, [control?.status]);

  async function logout() { await supabase.auth.signOut(); router.replace('/'); }
  async function pauseGame() { setBusy(true); setMsg(''); const { error } = await supabase.rpc('pause_game'); if (error) setMsg(error.message); await load(); setBusy(false); }
  async function askResume() { setBusy(true); const { error } = await supabase.rpc('request_resume'); setMsg(error ? error.message : 'Request sent to the Master Admin.'); setBusy(false); }
  async function toggleScores() {
    setBusy(true); setMsg(''); const next = !scoresShown;
    const { error } = await supabase.rpc('set_show_costs', { p_show: next });
    if (error) setMsg(error.message); else setScoresShown(next);
    setBusy(false);
  }
  function enterTakeover() { setTakeover(true); setControlled([]); setTkMsg(''); }
  function exitTakeover() { setTakeover(false); setControlled([]); setTkStates({}); setTkQty({}); }
  async function takeRole(role) {
    if (!window.confirm(`Take over the ${role}? You will play this seat and the rest of the board will be hidden.`)) return;
    const next = controlled.includes(role) ? controlled : [...controlled, role];
    setControlled(next);
    const { data } = await supabase.rpc('get_takeover_state', { p_role: role });
    setTkStates((s) => ({ ...s, [role]: data && data.length ? data[0] : {} }));
  }
  async function submitTakeover(role) {
    setTkMsg(''); const q = parseInt(tkQty[role], 10);
    if (isNaN(q) || q < 0) { setTkMsg('Enter a whole number, 0 or more.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('ta_submit_order', { p_role: role, p_quantity: q });
    if (error) setTkMsg(error.message); else { setTkMsg(`Order placed for ${role}.`); setTkQty((s) => ({ ...s, [role]: '' })); }
    await load(); setBusy(false);
  }

  if (loading) return <div className="hud-wrap"><p style={{ color: 'var(--ink-dim)' }}>Loading command board…</p></div>;

  const status = control?.status || 'setup';
  const running = status === 'running';
  const paused = status === 'paused';
  const remaining = control?.phase_ends_at && running ? Math.max(0, Math.ceil((new Date(control.phase_ends_at).getTime() - now) / 1000)) : null;
  const barPct = remaining != null ? Math.max(0, Math.min(100, (remaining / (PHASE_SECS[control?.phase] || 2)) * 100)) : 0;
  const total = board.reduce((s, r) => s + Number(r.cum_cost || 0), 0);
  const byRole = {}; board.forEach((r) => { byRole[r.role] = r; });
  const hideBoard = takeover && paused; // only hide the board during an active (paused) takeover

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
              <div className="mono" style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 6 }}>ROUND {control.current_round} / {control.total_rounds}</div>
            </>
          ) : <div className="phase-pill">Waiting to start</div>}
        </div>
      </div>

      {running && <div className="timebar"><i style={{ width: `${barPct}%` }} /></div>}
      <div style={{ marginTop: 16 }}>
        {control && <EventBanners active={control.notice_active} warning={control.notice_warning} warningIn={control.notice_warning_in} />}
      </div>

      {!hideBoard && (
        <>
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
              return (
                <div key={role} className={`station ${isActive ? 'active' : ''}`}>
                  <div className="role">{role}</div>
                  <div className="who">{r.player_name || '—'}</div>
                  <div className="inv mono">{r.inventory ?? '—'}<small>IN STOCK</small></div>
                  <div className="gauge"><i style={{ width: `${invPct}%`, background: Number(r.inventory) > 0 ? 'var(--good)' : 'var(--ink-dim)' }} /></div>
                  <div style={{ marginBottom: 8 }}>
                    {Number(r.backlog) > 0 ? <span className="pill bad mono">BACKLOG {r.backlog}</span> : <span className="pill ok">no backlog</span>}
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
        </>
      )}

      {/* Controls */}
      <div style={{ marginTop: 22 }}>
        {running && (
          <button className="btn-primary" style={{ padding: '12px 22px', borderRadius: 10, fontWeight: 700 }} onClick={pauseGame} disabled={busy}>⏸ Pause game</button>
        )}

        {paused && !takeover && (
          <div className="card" style={{ padding: 18, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14 }}>
            <div className="display" style={{ letterSpacing: '0.1em', color: 'var(--cyan)', marginBottom: 12, fontWeight: 600 }}>GAME PAUSED — CHOOSE AN ACTION</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn-ghost" onClick={askResume} disabled={busy}>📣 Ask MA to resume</button>
              <button className="btn-ghost" onClick={toggleScores} disabled={busy}>{scoresShown ? '🙈 Hide player scores' : '💰 Show player scores'}</button>
              <button className="btn-ghost" onClick={enterTakeover} disabled={busy}>🎮 Player takeover</button>
            </div>
            {msg && <div style={{ marginTop: 12, color: 'var(--cyan)', fontSize: 13 }}>{msg}</div>}
          </div>
        )}

        {paused && takeover && (
          <div className="card" style={{ padding: 18, background: 'var(--panel)', border: '1px solid var(--cyan)', borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="display" style={{ letterSpacing: '0.1em', color: 'var(--cyan)', fontWeight: 600 }}>PLAYER TAKEOVER</div>
              <button className="btn-ghost" onClick={exitTakeover}>Exit takeover</button>
            </div>

            {controlled.length === 0 ? (
              <>
                <div style={{ color: 'var(--ink-dim)', fontSize: 13, marginBottom: 12 }}>Tap the seat you need to play for. The full board is hidden while you take over.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {ROLE_ORDER.map((role) => (
                    <div key={role} className="station" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><div className="role">{role}</div><div className="who">{byRole[role]?.player_name || '—'}</div></div>
                      <button className="btn-primary" style={{ padding: '8px 14px', borderRadius: 8 }} onClick={() => takeRole(role)}>Take over</button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="chain" style={{ marginTop: 0 }}>
                  {controlled.map((role) => {
                    const st = tkStates[role] || {};
                    const ordered = st.my_order != null;
                    return (
                      <div key={role} className="station active">
                        <div className="role">{role} · takeover</div>
                        <div className="who">{st.player_name || ''}</div>
                        <div className="inv mono">{st.inventory ?? '—'}<small>IN STOCK</small></div>
                        <div style={{ margin: '8px 0' }}>
                          {Number(st.backlog) > 0 ? <span className="pill bad mono">BACKLOG {st.backlog}</span> : <span className="pill ok">no backlog</span>}
                        </div>
                        <div className="metric"><span>demand from below</span><b className="mono">{st.demand_below == null ? '—' : st.demand_below}</b></div>
                        <div className="metric"><span>arriving now</span><b className="mono">{st.incoming_this ?? 0}</b></div>
                        <div style={{ marginTop: 12 }}>
                          {ordered ? (
                            <div style={{ color: 'var(--good)', fontSize: 14 }}>✓ Order placed: {st.my_order}</div>
                          ) : st.is_my_turn ? (
                            <>
                              <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginBottom: 6 }}>Order from {UPSTREAM[role]}</div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <input className="input" type="number" min="0" value={tkQty[role] || ''} onChange={(e) => setTkQty((s) => ({ ...s, [role]: e.target.value }))} placeholder="Qty" />
                                <button className="btn-primary" style={{ padding: '0 16px', borderRadius: 8 }} onClick={() => submitTakeover(role)} disabled={busy}>Place</button>
                              </div>
                            </>
                          ) : (
                            <div style={{ color: 'var(--ink-dim)', fontSize: 12 }}>This seat’s ordering window isn’t open now. Pause during their turn to place an order.</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <button className="btn-ghost" onClick={() => setControlled([])}>+ Take over another</button>
                  <button className="btn-ghost" onClick={askResume} disabled={busy}>📣 Ask MA to resume</button>
                </div>
                {tkMsg && <div style={{ marginTop: 10, color: 'var(--cyan)', fontSize: 13 }}>{tkMsg}</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
