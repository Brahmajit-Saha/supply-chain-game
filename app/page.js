'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import EventBanners from '../components/EventBanners';

const EMPTY_TEAMS = [{ name: '' }, { name: '' }, { name: '' }, { name: '' }];
const ROLES = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
const PHASE_LABEL = {
  arrivals_resolved: 'Shipments arriving', demand_revealed: 'Demand revealed', strategy: 'Strategy — thinking',
  ordering_retailer: 'Ordering · Retailer', ordering_wholesaler: 'Ordering · Wholesaler',
  ordering_distributor: 'Ordering · Distributor', ordering_factory: 'Ordering · Factory', resolved: 'Round resolved',
};
const PHASE_SECS = { strategy: 30, ordering_retailer: 10, ordering_wholesaler: 10, ordering_distributor: 10, ordering_factory: 10 };

export default function Admin() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('live');
  const [setupOpen, setSetupOpen] = useState(false);

  const [teams, setTeams] = useState(EMPTY_TEAMS);
  const [savingTeams, setSavingTeams] = useState(false);
  const [teamMsg, setTeamMsg] = useState('');
  const [tables, setTables] = useState([]);
  const [savingTAs, setSavingTAs] = useState(false);
  const [taMsg, setTaMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [teamCounts, setTeamCounts] = useState([]);
  const [overview, setOverview] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [seatMsg, setSeatMsg] = useState('');

  const [control, setControl] = useState(null);
  const [grid, setGrid] = useState([]);
  const [engineBusy, setEngineBusy] = useState(false);
  const [engineMsg, setEngineMsg] = useState('');
  const [now, setNow] = useState(Date.now());
  const [showDemand, setShowDemand] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const pollRef = useRef(null);

  const loadTables = useCallback(async () => {
    const { data: gt } = await supabase.from('game_table').select('id, number, ta_email, table_admin_id').order('number');
    const rows = gt || [];
    const adminIds = rows.filter((t) => t.table_admin_id).map((t) => t.table_admin_id);
    let byId = {};
    if (adminIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', adminIds);
      (profs || []).forEach((p) => { byId[p.id] = p; });
    }
    setTables(rows.map((t) => ({ ...t, admin: t.table_admin_id ? byId[t.table_admin_id] : null })));
  }, []);
  const loadCounts = useCallback(async () => { const { data } = await supabase.rpc('get_team_counts'); setTeamCounts(data || []); }, []);
  const loadOverview = useCallback(async () => { const { data } = await supabase.rpc('get_seating_overview'); setOverview(data || []); }, []);
  const loadEngine = useCallback(async () => {
    const { data: ctrl } = await supabase.rpc('get_control'); setControl(ctrl && ctrl.length ? ctrl[0] : null);
    const { data: g } = await supabase.rpc('get_admin_grid'); setGrid(g || []);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { router.replace('/'); return; }
      const { data: prof } = await supabase.from('profiles').select('system_role').eq('id', sess.session.user.id).single();
      if (!prof || prof.system_role !== 'MA') { router.replace('/home'); return; }
      const { data: existing } = await supabase.from('team').select('id, name').order('id');
      const slots = EMPTY_TEAMS.map((s) => ({ ...s }));
      (existing || []).slice(0, 4).forEach((t, i) => { slots[i] = { id: t.id, name: t.name }; });
      setTeams(slots);
      await loadTables(); await loadCounts(); await loadOverview(); await loadEngine();
      setLoading(false);
    }
    init();
  }, [router, loadTables, loadCounts, loadOverview, loadEngine]);

  useEffect(() => {
    if (control?.status === 'running' || control?.status === 'paused') {
      pollRef.current = setInterval(() => { loadEngine(); }, 2000);
      return () => clearInterval(pollRef.current);
    }
  }, [control?.status, loadEngine]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  function setTeamName(i, val) { setTeams((p) => p.map((t, idx) => (idx === i ? { ...t, name: val } : t))); }
  async function saveTeams() {
    setSavingTeams(true); setTeamMsg('');
    try {
      const updated = teams.map((t) => ({ ...t }));
      for (let i = 0; i < updated.length; i++) {
        const name = (updated[i].name || '').trim(); if (!name) continue;
        if (updated[i].id) { const { error } = await supabase.from('team').update({ name }).eq('id', updated[i].id); if (error) throw error; }
        else { const { data, error } = await supabase.from('team').insert({ name }).select('id').single(); if (error) throw error; updated[i].id = data.id; }
      }
      setTeams(updated); setTeamMsg('Teams saved.'); await loadCounts();
    } catch (e) { setTeamMsg('Error: ' + e.message); }
    setSavingTeams(false);
  }
  function setTaEmail(i, val) { setTables((p) => p.map((t, idx) => (idx === i ? { ...t, ta_email: val } : t))); }
  async function saveTAs() {
    setSavingTAs(true); setTaMsg('');
    try {
      for (const row of tables) {
        const email = (row.ta_email || '').trim().toLowerCase() || null;
        const { error } = await supabase.from('game_table').update({ ta_email: email }).eq('id', row.id);
        if (error) { if (error.code === '23505') throw new Error(`"${email}" is already assigned to another table.`); throw error; }
      }
      await loadTables(); setTaMsg('Table Admins saved.');
    } catch (e) { setTaMsg('Error: ' + e.message); }
    setSavingTAs(false);
  }
  async function refreshStatus() { setRefreshing(true); setTaMsg(''); await loadTables(); await loadCounts(); setRefreshing(false); }
  async function generateSeating() {
    if (overview.length > 0 && !window.confirm('Seating already exists. Re-generating will reshuffle everyone. Continue?')) return;
    setGenerating(true); setSeatMsg('');
    const { error } = await supabase.rpc('generate_seating');
    if (error) { setSeatMsg('Error: ' + error.message); setGenerating(false); return; }
    await loadOverview(); setSeatMsg('Seating generated.'); setGenerating(false);
  }
  async function eng(fn, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setEngineBusy(true); setEngineMsg('');
    const { error } = await supabase.rpc(fn);
    if (error) setEngineMsg('Error: ' + error.message);
    await loadEngine(); setEngineBusy(false);
  }
  const startGame = () => eng('start_game', control?.status !== 'setup' ? 'Restart the game from round 1 and wipe current progress?' : null);
  const advancePhase = () => eng('advance_phase');
  const pauseGame = () => eng('pause_game');
  const resumeGame = () => eng('resume_game');
  const redoRound = () => eng('redo_round', 'Redo this round? Everything players did this round is discarded and it restarts with new demand.');
  async function toggleDemandSharing() {
    setEngineBusy(true);
    await supabase.rpc('set_demand_sharing', { p_on: !control?.demand_sharing });
    await loadEngine(); setEngineBusy(false);
  }
  async function dismissRequest() { await supabase.rpc('clear_resume_request'); await loadEngine(); }
  async function logout() { await supabase.auth.signOut(); router.replace('/'); }

  if (loading) return <div className="hud-wrap"><p style={{ color: 'var(--ink-dim)' }}>Loading control room…</p></div>;

  const status = control?.status || 'setup';
  const running = status === 'running', paused = status === 'paused';
  const maRemaining = control?.phase_ends_at && running ? Math.max(0, Math.ceil((new Date(control.phase_ends_at).getTime() - now) / 1000)) : null;
  const barPct = maRemaining != null ? Math.max(0, Math.min(100, (maRemaining / (PHASE_SECS[control?.phase] || 2)) * 100)) : 0;
  const totalPlayers = teamCounts.reduce((s, t) => s + Number(t.member_count), 0);
  const fourFullTeams = teamCounts.length === 4 && teamCounts.every((t) => Number(t.member_count) === 4);
  const tasLoggedIn = tables.filter((t) => t.table_admin_id).length;
  const ready = fourFullTeams && tasLoggedIn === 4;
  const seated = overview.length > 0;
  const seatGrid = {}; overview.forEach((r) => { seatGrid[`${r.role}|${r.table_number}`] = r; });
  const liveGrid = {}; grid.forEach((r) => { liveGrid[`${r.role}|${r.table_number}`] = r; });

  return (
    <div className="hud-wrap" style={{ maxWidth: 1080 }}>
      {control?.resume_request_table && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ padding: 24, maxWidth: 380, background: 'var(--panel)' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Resume requested</div>
            <div style={{ color: 'var(--ink-dim)', marginBottom: 18 }}>Table {control.resume_request_table} Admin requests Game Resuming.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={dismissRequest}>Dismiss</button>
              <button className="btn btn-primary" onClick={resumeGame} style={{ minWidth: 110 }}>Resume game</button>
            </div>
          </div>
        </div>
      )}

      <div className="cmdbar">
        <div>
          <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Master Admin</div>
          <div className="display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.02em' }}>EVENT CONTROL</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {status !== 'setup' ? (
            <>
              <div className={`phase-pill ${running ? 'live' : ''}`}>
                {paused ? '⏸ Paused' : status === 'complete' ? 'Complete' : (PHASE_LABEL[control.phase] || control.phase)}
                {maRemaining != null && <span className="mono" style={{ color: 'var(--cyan)' }}>{maRemaining}s</span>}
              </div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 6 }}>ROUND {control.current_round} / {control.total_rounds}</div>
            </>
          ) : <div className="phase-pill">Setup</div>}
        </div>
      </div>
      {running && <div className="timebar"><i style={{ width: `${barPct}%` }} /></div>}

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {['live', 'scoreboard'].map((v) => (
          <button key={v} onClick={() => setView(v)} className="display"
            style={{ padding: '8px 20px', borderRadius: 10, letterSpacing: '0.1em', fontWeight: 600, cursor: 'pointer', fontSize: 13,
              border: `1px solid ${view === v ? 'var(--cyan)' : 'var(--line)'}`, background: view === v ? 'rgba(53,208,255,0.12)' : 'transparent',
              color: view === v ? 'var(--cyan)' : 'var(--ink-dim)' }}>
            {v === 'live' ? 'LIVE BOARD' : 'SCOREBOARD'}
          </button>
        ))}
      </div>

      {view === 'scoreboard' ? (
        <div className="card" style={{ marginTop: 16, padding: '80px 24px', textAlign: 'center', background: 'linear-gradient(180deg, var(--panel-2), var(--panel))', border: '1px solid var(--line)' }}>
          <div className="display" style={{ fontSize: 44, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ink)' }}>🏆 SCOREBOARD</div>
          <p style={{ color: 'var(--ink-dim)', maxWidth: 460, margin: '14px auto 0' }}>
            The live team leaderboard, top performers, and the bullwhip chart appear here — wired up in the final phase, ready to project at the debrief.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 16 }}>
            {control && status !== 'setup' && <EventBanners active={control.notice_active} warning={control.notice_warning} warningIn={control.notice_warning_in} />}
          </div>

          {/* Controls */}
          <div className="card" style={{ marginTop: 6, padding: 20, background: 'linear-gradient(180deg, var(--panel-2), var(--panel))', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {status === 'setup' ? (
                <button className="btn btn-primary" onClick={startGame} disabled={engineBusy || !seated} style={{ minWidth: 150, opacity: seated ? 1 : 0.5 }}>
                  {engineBusy ? 'Starting…' : '▶ Start game'}
                </button>
              ) : (
                <>
                  {running && <button className="btn-ghost" onClick={pauseGame} disabled={engineBusy}>⏸ Pause</button>}
                  {paused && <button className="btn btn-primary" onClick={resumeGame} disabled={engineBusy} style={{ minWidth: 110 }}>▶ Resume</button>}
                  {paused && <button className="btn-ghost" onClick={redoRound} disabled={engineBusy}>↺ Redo round</button>}
                  <button className="btn-ghost" onClick={advancePhase} disabled={engineBusy || !running}>⏭ Force-advance</button>
                  <button className="btn-ghost" onClick={startGame} disabled={engineBusy}>Restart</button>
                </>
              )}
              {status !== 'setup' && (
                <button className={control?.demand_sharing ? 'btn btn-primary' : 'btn-ghost'} onClick={toggleDemandSharing} disabled={engineBusy}>
                  {control?.demand_sharing ? '📢 Demand sharing: ON' : 'Demand sharing: off'}
                </button>
              )}
              {engineMsg && <span style={{ fontSize: 14, color: engineMsg.startsWith('Error') ? 'var(--bad)' : 'var(--good)' }}>{engineMsg}</span>}
            </div>

            {status !== 'setup' && (
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--ink-dim)', fontSize: 13 }}>Customer demand</span>
                  <span className="mono" style={{ fontSize: 18, color: 'var(--ink)' }}>{showDemand ? control.current_demand : '•••••'}</span>
                  <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setShowDemand((s) => !s)}>{showDemand ? 'Hide' : 'Show'}</button>
                </div>
                <button className="btn-ghost" onClick={() => setShowGrid((s) => !s)}>{showGrid ? 'Hide live board' : 'Show live board'}</button>
                <span style={{ color: 'var(--ink-dim)', fontSize: 12 }}>Both hidden by default — safe to project.</span>
              </div>
            )}
          </div>

          {/* Live 4x4 board (hidden by default) */}
          {status !== 'setup' && showGrid && grid.length > 0 && (
            <div className="card" style={{ marginTop: 12, padding: 16, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                <thead><tr><th style={th}></th>{[1, 2, 3, 4].map((n) => <th key={n} style={th}>Table {n}</th>)}</tr></thead>
                <tbody>
                  {ROLES.map((role) => (
                    <tr key={role}>
                      <td style={{ ...td, color: 'var(--ink-dim)', fontWeight: 600 }}>{role}</td>
                      {[1, 2, 3, 4].map((n) => {
                        const c = liveGrid[`${role}|${n}`];
                        return <td key={n} style={td}>{c ? (
                          <div className="mono" style={{ lineHeight: 1.5 }}>
                            <span>Inv <b>{c.inventory}</b></span>{'  '}
                            <span style={{ color: c.backlog > 0 ? 'var(--bad)' : 'var(--ink-dim)' }}>Bk {c.backlog}</span>
                            <div style={{ color: 'var(--ink-dim)', fontSize: 11 }}>order {c.last_order == null ? '—' : c.last_order}</div>
                          </div>) : '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Setup (collapsible) */}
          <button onClick={() => setSetupOpen((s) => !s)} className="display"
            style={{ marginTop: 18, padding: '10px 16px', borderRadius: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
              background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--ink-dim)', letterSpacing: '0.08em', fontWeight: 600 }}>
            {setupOpen ? '▾' : '▸'} SETUP — teams · table admins · seating
          </button>

          {setupOpen && (
            <div style={{ marginTop: 12 }}>
              <div className="card" style={{ padding: 22 }}>
                <h2 style={cardTitle}>Teams</h2>
                <p style={cardSub}>Name the four teams. Players pick from these when they sign in.</p>
                {teams.map((t, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <label style={fieldLabel}>Team {i + 1}</label>
                    <input className="input" value={t.name} onChange={(e) => setTeamName(i, e.target.value)} placeholder={`e.g. Team ${i + 1}`} />
                  </div>
                ))}
                <div style={actionRow}>
                  <button className="btn btn-primary" onClick={saveTeams} disabled={savingTeams} style={{ minWidth: 140 }}>{savingTeams ? 'Saving…' : 'Save teams'}</button>
                  {teamMsg && <span style={msgStyle(teamMsg)}>{teamMsg}</span>}
                </div>
              </div>

              <div className="card" style={{ padding: 22, marginTop: 16 }}>
                <h2 style={cardTitle}>Table Admins</h2>
                <p style={cardSub}>Assign a TA email to each table. Change an email anytime — the previous person reverts to a player.</p>
                {tables.map((t, i) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 62, color: 'var(--ink-dim)', fontSize: 14 }}>Table {t.number}</div>
                    <input className="input" style={{ flex: 1 }} value={t.ta_email || ''} onChange={(e) => setTaEmail(i, e.target.value)} placeholder="ta@ibsindia.org" />
                    <div style={{ width: 160, textAlign: 'right' }}>{statusBadge(t)}</div>
                  </div>
                ))}
                <div style={actionRow}>
                  <button className="btn btn-primary" onClick={saveTAs} disabled={savingTAs} style={{ minWidth: 160 }}>{savingTAs ? 'Saving…' : 'Save Table Admins'}</button>
                  <button className="btn-ghost" onClick={refreshStatus} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh status'}</button>
                  {taMsg && <span style={msgStyle(taMsg)}>{taMsg}</span>}
                </div>
              </div>

              <div className="card" style={{ padding: 22, marginTop: 16 }}>
                <h2 style={cardTitle}>Seating</h2>
                <p style={cardSub}>When the room is ready, generate seating. Everyone&apos;s role, table, and TA appear on their screen at once.</p>
                <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
                  <Check ok={fourFullTeams} label={`Four teams of four (${totalPlayers}/16 players joined)`} />
                  <Check ok={tasLoggedIn === 4} label={`Table Admins logged in (${tasLoggedIn}/4)`} />
                </div>
                <div style={actionRow}>
                  <button className="btn btn-primary" onClick={generateSeating} disabled={generating || !ready} style={{ minWidth: 170, opacity: ready ? 1 : 0.5 }}>
                    {generating ? 'Generating…' : seated ? 'Re-generate seating' : 'Generate seating'}
                  </button>
                  <button className="btn-ghost" onClick={() => { loadOverview(); loadCounts(); loadTables(); }}>Refresh</button>
                  {seatMsg && <span style={msgStyle(seatMsg)}>{seatMsg}</span>}
                </div>
                {seated && (
                  <div style={{ overflowX: 'auto', marginTop: 18 }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                      <thead><tr><th style={th}></th>{[1, 2, 3, 4].map((n) => <th key={n} style={th}>Table {n}</th>)}</tr></thead>
                      <tbody>
                        {ROLES.map((role) => (
                          <tr key={role}>
                            <td style={{ ...td, color: 'var(--ink-dim)', fontWeight: 600 }}>{role}</td>
                            {[1, 2, 3, 4].map((n) => { const cell = seatGrid[`${role}|${n}`];
                              return <td key={n} style={td}>{cell ? (<><div>{cell.player_name}</div><div style={{ color: 'var(--ink-dim)', fontSize: 11 }}>{cell.team_name}</div></>) : '—'}</td>; })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ textAlign: 'right', marginTop: 22 }}>
        <button className="btn-ghost" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}

function Check({ ok, label }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
    <span style={{ color: ok ? 'var(--good)' : 'var(--warn)' }}>{ok ? '✓' : '○'}</span>
    <span style={{ color: ok ? 'var(--ink)' : 'var(--ink-dim)' }}>{label}</span></div>;
}
function statusBadge(t) {
  if (!t.ta_email) return <span style={{ color: 'var(--ink-dim)', fontSize: 13 }}>—</span>;
  if (t.admin) return <span style={{ color: 'var(--good)', fontSize: 13 }}>✓ logged in{t.admin.name ? ` · ${t.admin.name}` : ''}</span>;
  return <span style={{ color: 'var(--warn)', fontSize: 13 }}>waiting for login</span>;
}
const cardTitle = { fontSize: 17, margin: '0 0 4px', fontWeight: 600, color: 'var(--ink)' };
const cardSub = { color: 'var(--ink-dim)', fontSize: 14, margin: '0 0 18px' };
const fieldLabel = { fontSize: 13, color: 'var(--ink-dim)', display: 'block', marginBottom: 6 };
const actionRow = { display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' };
const msgStyle = (m) => ({ fontSize: 14, color: m.startsWith('Error') ? 'var(--bad)' : 'var(--good)' });
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--line)', color: 'var(--ink-dim)', fontWeight: 600 };
const td = { padding: '8px 10px', borderBottom: '1px solid var(--line)', verticalAlign: 'top' };
