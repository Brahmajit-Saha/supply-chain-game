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
const PHASE_SECS = { strategy: 30, ordering_retailer: 15, ordering_wholesaler: 15, ordering_distributor: 15, ordering_factory: 15 };

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
  const [scores, setScores] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [boardTab, setBoardTab] = useState('teams');
  const [settings, setSettings] = useState(null);
  const [sMsg, setSMsg] = useState('');
  const [sBusy, setSBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
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
    const { data: sc } = await supabase.rpc('get_scores'); setScores(sc || []);
    const { data: oh } = await supabase.rpc('get_order_history'); setOrderHistory(oh || []);
    const { data: st } = await supabase.rpc('get_game_settings'); if (st && st[0]) setSettings(st[0]);
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
  async function downloadExcel() {
    setExporting(true); setExportMsg('Gathering data…');
    try {
      const [led, ord, scr] = await Promise.all([
        supabase.rpc('get_full_ledger'),
        supabase.rpc('get_order_history'),
        supabase.rpc('get_scores'),
      ]);
      if (led.error) throw led.error;
      const ledger = led.data || [], orders = ord.data || [], scores = scr.data || [];
      if (ledger.length === 0 && orders.length === 0) { setExportMsg('No game data yet — play a few rounds first.'); setExporting(false); return; }
      setExportMsg('Building workbook…');
      await buildWorkbook({ ledger, orders, scores, round: control?.current_round || 0 });
      setExportMsg('Downloaded ✓');
    } catch (e) {
      setExportMsg('Error: ' + (e.message || e));
    }
    setExporting(false);
  }

  async function saveSettings(v) {
    setSBusy(true); setSMsg('');
    const { error } = await supabase.rpc('set_game_settings', {
      p_demand_max: v.demand_max, p_max_order: v.max_order_qty,
      p_strategy_sec: v.strategy_timer_sec, p_order_sec: v.order_timer_sec });
    if (error) setSMsg('Error: ' + error.message); else setSMsg('Settings saved — they take effect from the next round.');
    await loadEngine(); setSBusy(false);
  }
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
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 14 }}>
            {exportMsg && <span style={{ fontSize: 13, color: exportMsg.startsWith('Error') ? 'var(--bad)' : 'var(--ink-dim)' }}>{exportMsg}</span>}
            <button className="btn-ghost" onClick={downloadExcel} disabled={exporting}>{exporting ? 'Building…' : '⬇ Download Excel'}</button>
          </div>
          <Leaderboard scores={scores} boardTab={boardTab} setBoardTab={setBoardTab} />
          <BullwhipChart history={orderHistory} />
        </>
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

          {/* Game settings — editable before start or while paused */}
          {(status === 'setup' || paused) && (
            <GameSettings settings={settings} onSave={saveSettings} busy={sBusy} msg={sMsg} />
          )}

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

// ---------- Excel export helpers ----------
const ROLES4 = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
const ROLE_COLORS = { Retailer: '#35d0ff', Wholesaler: '#7c4dff', Distributor: '#3fe08f', Factory: '#ffb23e' };

function bullwhipPNG(orders, table, maxR) {
  const W = 760, H = 380, pl = 52, pr = 20, pt = 34, pb = 46;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0f0a1f'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f0edff'; g.font = 'bold 15px sans-serif';
  g.fillText(`Bullwhip — Table ${table}  (order quantity vs. customer demand)`, pl, 20);

  const demand = {}; orders.forEach((o) => { if (o.customer_demand != null) demand[o.round_number] = o.customer_demand; });
  const series = ROLES4.map((role) => {
    const pts = [];
    for (let r = 1; r <= maxR; r++) { const o = orders.find((x) => x.table_number === table && x.role === role && x.round_number === r); if (o) pts.push([r, o.quantity]); }
    return { label: role, color: ROLE_COLORS[role], pts };
  });
  const dpts = []; for (let r = 1; r <= maxR; r++) if (demand[r] != null) dpts.push([r, demand[r]]);
  const maxY = Math.max(10, ...series.flatMap((s) => s.pts.map((p) => p[1])), ...dpts.map((p) => p[1]));
  const X = (r) => (maxR > 1 ? pl + ((r - 1) / (maxR - 1)) * (W - pl - pr) : pl);
  const Y = (v) => pt + (1 - v / maxY) * (H - pt - pb);

  g.strokeStyle = '#2b2350'; g.lineWidth = 1; g.fillStyle = '#9a91c4'; g.font = '11px monospace';
  for (let i = 0; i <= 4; i++) { const v = Math.round((maxY * i) / 4); const y = Y(v); g.beginPath(); g.moveTo(pl, y); g.lineTo(W - pr, y); g.stroke(); g.fillText(String(v), 10, y + 4); }
  for (let r = 1; r <= maxR; r++) if (r === 1 || r === maxR || r % 5 === 0) g.fillText(String(r), X(r) - 5, H - 22);

  const line = (pts, color, dash) => { g.setLineDash(dash || []); g.strokeStyle = color; g.lineWidth = dash ? 2 : 2.5; g.beginPath(); pts.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); };
  line(dpts, '#cfc9ef', [5, 4]);
  series.forEach((s) => line(s.pts, s.color));

  let lx = pl; g.font = '11px sans-serif';
  [...series, { label: 'Customer demand', color: '#cfc9ef' }].forEach((s) => { g.fillStyle = s.color; g.fillRect(lx, H - 12, 14, 3); g.fillStyle = '#cfc9ef'; g.fillText(s.label, lx + 18, H - 8); lx += g.measureText(s.label).width + 34; });
  return c.toDataURL('image/png').split(',')[1];
}

async function buildWorkbook({ ledger, orders, scores, round }) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  const money = (v) => Math.round(Number(v || 0));
  const cost = (r) => Number(r.holding_cost) + Number(r.backlog_cost) + Number(r.transport_cost);
  const maxR = ledger.reduce((m, r) => Math.max(m, r.round_number), 0);

  // ----- final leaderboards (from scores) -----
  const teamAgg = {}, tableAgg = {};
  scores.forEach((s) => { if (s.team_name) teamAgg[s.team_name] = (teamAgg[s.team_name] || 0) + Number(s.total_cost); tableAgg[s.table_number] = (tableAgg[s.table_number] || 0) + Number(s.total_cost); });
  const teams = Object.entries(teamAgg).map(([name, c]) => ({ name, c })).sort((a, b) => a.c - b.c);
  const tables = Object.entries(tableAgg).map(([n, c]) => ({ name: `Table ${n}`, c })).sort((a, b) => a.c - b.c);
  const players = scores.filter((s) => s.player_name).map((s) => ({ name: s.player_name, sub: `${s.team_name || '—'} · Table ${s.table_number} · ${s.role}`, c: Number(s.total_cost) })).sort((a, b) => a.c - b.c);

  const wsL = wb.addWorksheet('Leaderboards');
  const header = (ws, cells) => { const row = ws.addRow(cells); row.font = { bold: true }; return row; };
  wsL.addRow(['OPSPHERE — Final standings (lowest total cost wins)']).font = { bold: true, size: 14 };
  wsL.addRow([`Through round ${round}`]); wsL.addRow([]);
  header(wsL, ['TEAMS']); header(wsL, ['Rank', 'Team', 'Total cost']);
  teams.forEach((t, i) => wsL.addRow([i + 1, t.name, money(t.c)]));
  wsL.addRow([]);
  header(wsL, ['TABLES']); header(wsL, ['Rank', 'Table', 'Total cost']);
  tables.forEach((t, i) => wsL.addRow([i + 1, t.name, money(t.c)]));
  wsL.addRow([]);
  header(wsL, ['PLAYERS']); header(wsL, ['Rank', 'Player', 'Team · Table · Role', 'Total cost']);
  players.forEach((p, i) => wsL.addRow([i + 1, p.name, p.sub, money(p.c)]));
  wsL.columns.forEach((col) => { col.width = 22; });

  // ----- round-by-round cumulative -----
  const cumMatrix = (keyFn) => {
    const per = {};
    ledger.forEach((r) => { const k = keyFn(r); if (k == null) return; if (!per[k]) per[k] = Array(maxR + 1).fill(0); per[k][r.round_number] += cost(r); });
    const out = {}; Object.entries(per).forEach(([k, arr]) => { let s = 0; const cum = []; for (let i = 1; i <= maxR; i++) { s += arr[i]; cum.push(Math.round(s)); } out[k] = cum; });
    return out;
  };
  const roundSheet = (title, matrix) => {
    const ws = wb.addWorksheet(title);
    header(ws, ['', ...Array.from({ length: maxR }, (_, i) => `R${i + 1}`)]);
    Object.entries(matrix).sort((a, b) => a[1][maxR - 1] - b[1][maxR - 1]).forEach(([k, cum]) => ws.addRow([k, ...cum]));
    ws.getColumn(1).width = 30;
  };
  roundSheet('Teams by round', cumMatrix((r) => r.team_name));
  roundSheet('Tables by round', cumMatrix((r) => `Table ${r.table_number}`));
  roundSheet('Players by round', cumMatrix((r) => (r.player_name ? `${r.player_name} (${r.role}, T${r.table_number})` : null)));

  // ----- bullwhip data -----
  const maxRo = orders.reduce((m, r) => Math.max(m, r.round_number), 0);
  const wsB = wb.addWorksheet('Bullwhip data');
  [1, 2, 3, 4].forEach((t) => {
    wsB.addRow([`Table ${t}`]).font = { bold: true };
    header(wsB, ['Round', 'Customer demand', ...ROLES4]);
    for (let r = 1; r <= maxRo; r++) {
      const dem = orders.find((o) => o.round_number === r)?.customer_demand ?? '';
      const q = (role) => orders.find((o) => o.table_number === t && o.role === role && o.round_number === r)?.quantity ?? '';
      wsB.addRow([r, dem, q('Retailer'), q('Wholesaler'), q('Distributor'), q('Factory')]);
    }
    wsB.addRow([]);
  });
  wsB.columns.forEach((col) => { col.width = 15; });

  // ----- bullwhip charts as images -----
  if (maxRo > 0) {
    const wsC = wb.addWorksheet('Bullwhip charts');
    let anchor = 0;
    for (const t of [1, 2, 3, 4]) {
      const b64 = bullwhipPNG(orders, t, maxRo);
      const id = wb.addImage({ base64: b64, extension: 'png' });
      wsC.addImage(id, { tl: { col: 0, row: anchor }, ext: { width: 760, height: 380 } });
      anchor += 21;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `OPSPHERE-results-R${round}.xlsx`; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

function GameSettings({ settings, onSave, busy, msg }) {
  const [d, setD] = useState(settings || {});
  useEffect(() => { if (settings) setD(settings); }, [settings]);
  if (!settings) return null;
  const num = (v) => (v === '' ? '' : parseInt(v, 10));
  const set = (k) => (e) => setD((p) => ({ ...p, [k]: num(e.target.value) }));
  const Field = ({ k, label, hint, unit }) => (
    <div style={{ flex: '1 1 200px' }}>
      <label style={{ fontSize: 13, color: 'var(--ink-dim)', display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input className="input" type="number" value={d[k] ?? ''} onChange={set(k)} style={{ width: 110 }} />
        {unit && <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{unit}</span>}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--ink-dim)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
  return (
    <div className="card" style={{ marginTop: 12, padding: 20 }}>
      <div className="eyebrow" style={{ color: 'var(--cyan)' }}>Game settings</div>
      <div className="display" style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: '2px 0 4px' }}>Tune the game</div>
      <p style={{ color: 'var(--ink-dim)', fontSize: 13, margin: '0 0 16px' }}>Editable before kickoff and whenever the game is paused. Changes take effect from the next round.</p>

      <div style={{ fontSize: 12, color: 'var(--ink-dim)', letterSpacing: '0.08em', marginBottom: 10 }}>DEMAND &amp; ORDERS</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <Field k="demand_max" label="Peak customer demand" unit="units" hint="Top of the random demand range (0–this)." />
        <Field k="max_order_qty" label="Order ceiling" unit="units" hint="Most a player may order in one round." />
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-dim)', letterSpacing: '0.08em', marginBottom: 10 }}>ROUND TIMERS</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Field k="strategy_timer_sec" label="Strategy time" unit="sec" hint="Thinking window at the top of each round." />
        <Field k="order_timer_sec" label="Decision time (per role)" unit="sec" hint="Seconds each role gets to place its order." />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => onSave(d)} disabled={busy} style={{ minWidth: 140 }}>{busy ? 'Saving…' : 'Save settings'}</button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--bad)' : 'var(--good)' }}>{msg}</span>}
      </div>
    </div>
  );
}

function BullwhipChart({ history }) {
  const [mode, setMode] = useState('table');
  const [pick, setPick] = useState('1');
  const rows = history || [];
  const roles = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
  const tables = [1, 2, 3, 4];
  const teamNames = [...new Set(rows.map((r) => r.team_name).filter(Boolean))].sort();
  const maxRound = rows.reduce((m, r) => Math.max(m, r.round_number), 0);

  function changeMode(m) {
    setMode(m);
    setPick(m === 'table' ? '1' : m === 'role' ? 'Retailer' : (teamNames[0] || ''));
  }

  const COLORS = { Retailer: '#35d0ff', Wholesaler: '#7c4dff', Distributor: '#3fe08f', Factory: '#ffb23e' };
  const TCOL = ['#35d0ff', '#7c4dff', '#3fe08f', '#ffb23e'];
  const demand = {};
  rows.forEach((r) => { if (r.customer_demand != null) demand[r.round_number] = r.customer_demand; });

  let series = [];
  if (mode === 'table') {
    const t = parseInt(pick, 10) || 1;
    series = roles.map((role) => ({ label: role, color: COLORS[role],
      points: rows.filter((r) => r.table_number === t && r.role === role).map((r) => ({ x: r.round_number, y: r.quantity })) }));
  } else if (mode === 'role') {
    series = tables.map((t, i) => ({ label: `Table ${t}`, color: TCOL[i],
      points: rows.filter((r) => r.table_number === t && r.role === pick).map((r) => ({ x: r.round_number, y: r.quantity })) }));
  } else {
    const tr = rows.filter((r) => r.team_name === pick);
    series = roles.map((role) => ({ label: role, color: COLORS[role],
      points: tr.filter((r) => r.role === role).map((r) => ({ x: r.round_number, y: r.quantity })) })).filter((s) => s.points.length);
  }
  const dpts = Object.entries(demand).map(([r, v]) => ({ x: +r, y: v })).sort((a, b) => a.x - b.x);
  const all = [...series, { label: 'Customer demand', color: '#cfc9ef', dashed: true, points: dpts }];
  const maxY = Math.max(10, ...all.flatMap((s) => s.points.map((p) => p.y)));

  const W = 720, H = 360, pl = 46, pr = 14, pt = 16, pb = 34;
  const plotW = W - pl - pr, plotH = H - pt - pb;
  const X = (r) => (maxRound > 1 ? pl + ((r - 1) / (maxRound - 1)) * plotW : pl + plotW / 2);
  const Y = (v) => pt + (1 - v / maxY) * plotH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));
  const xTicks = [];
  for (let r = 1; r <= maxRound; r++) if (r === 1 || r === maxRound || r % 5 === 0) xTicks.push(r);
  const opts = mode === 'table' ? tables.map(String) : mode === 'role' ? roles : teamNames;

  return (
    <div className="card" style={{ marginTop: 16, padding: 22, background: 'linear-gradient(180deg, var(--panel-2), var(--panel))', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="display" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--ink)' }}>📈 THE BULLWHIP</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['table', 'By table'], ['role', 'By role'], ['team', 'By team']].map(([k, label]) => (
            <button key={k} onClick={() => changeMode(k)} className="display"
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer',
                border: `1px solid ${mode === k ? 'var(--cyan)' : 'var(--line)'}`, background: mode === k ? 'rgba(53,208,255,0.12)' : 'transparent',
                color: mode === k ? 'var(--cyan)' : 'var(--ink-dim)' }}>{label}</button>
          ))}
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="input" style={{ width: 'auto', padding: '6px 12px' }}>
            {opts.map((o) => <option key={o} value={o}>{mode === 'table' ? `Table ${o}` : o}</option>)}
          </select>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-dim)', margin: '4px 0 10px' }}>Order quantities up the chain vs. real customer demand — watch the swings amplify upstream.</div>

      {maxRound === 0 ? (
        <div style={{ color: 'var(--ink-dim)', padding: '40px 0', textAlign: 'center' }}>Order data appears once rounds have been played.</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={pl} y1={Y(v)} x2={W - pr} y2={Y(v)} stroke="#2b2350" strokeWidth="1" />
                <text x={pl - 8} y={Y(v) + 4} textAnchor="end" fill="#9a91c4" fontSize="11" fontFamily="monospace">{v}</text>
              </g>
            ))}
            {xTicks.map((r) => (<text key={r} x={X(r)} y={H - 12} textAnchor="middle" fill="#9a91c4" fontSize="11" fontFamily="monospace">{r}</text>))}
            {all.map((s, i) => s.points.length > 0 && (
              <polyline key={i} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 2.5}
                strokeDasharray={s.dashed ? '5 4' : undefined} opacity={s.dashed ? 0.85 : 1}
                points={s.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} />
            ))}
          </svg>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
            {all.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-dim)' }}>
                <span style={{ width: 16, height: 3, background: s.color, display: 'inline-block', borderRadius: 2, opacity: s.dashed ? 0.85 : 1 }} />
                {s.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Leaderboard({ scores, boardTab, setBoardTab }) {
  const money = (v) => '$' + Math.round(Number(v || 0)).toLocaleString();
  const rows = scores || [];

  const teamAgg = {};
  rows.forEach((s) => { if (!s.team_name) return; teamAgg[s.team_name] = (teamAgg[s.team_name] || 0) + Number(s.total_cost); });
  const teams = Object.entries(teamAgg).map(([name, cost]) => ({ name, cost })).sort((a, b) => a.cost - b.cost);

  const players = rows.filter((s) => s.player_name)
    .map((s) => ({ name: s.player_name, sub: `${s.team_name || '—'} · Table ${s.table_number} · ${s.role}`, cost: Number(s.total_cost) }))
    .sort((a, b) => a.cost - b.cost);

  const tableAgg = {};
  rows.forEach((s) => { tableAgg[s.table_number] = (tableAgg[s.table_number] || 0) + Number(s.total_cost); });
  const tables = Object.entries(tableAgg).map(([num, cost]) => ({ name: `Table ${num}`, cost })).sort((a, b) => a.cost - b.cost);

  const data = boardTab === 'teams' ? teams : boardTab === 'players' ? players : tables;
  const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);
  const rankColor = (i) => (i === 0 ? 'var(--warn)' : i === 1 ? '#c9d4e3' : i === 2 ? '#e0955b' : 'var(--ink-dim)');

  return (
    <div className="card" style={{ marginTop: 16, padding: 22, background: 'linear-gradient(180deg, var(--panel-2), var(--panel))', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="display" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--ink)' }}>🏆 LEADERBOARD</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['teams', 'Teams'], ['players', 'Players'], ['tables', 'Tables']].map(([k, label]) => (
            <button key={k} onClick={() => setBoardTab(k)} className="display"
              style={{ padding: '6px 16px', borderRadius: 8, fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer',
                border: `1px solid ${boardTab === k ? 'var(--cyan)' : 'var(--line)'}`, background: boardTab === k ? 'rgba(53,208,255,0.12)' : 'transparent',
                color: boardTab === k ? 'var(--cyan)' : 'var(--ink-dim)' }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 4, letterSpacing: '0.04em' }}>LOWEST TOTAL COST WINS</div>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        {data.length === 0 ? (
          <div style={{ color: 'var(--ink-dim)', padding: '30px 0', textAlign: 'center' }}>Scores appear once the game is running.</div>
        ) : data.map((row, i) => (
          <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 12,
            background: i === 0 ? 'rgba(255,178,62,0.08)' : 'var(--panel)', border: `1px solid ${i === 0 ? 'rgba(255,178,62,0.4)' : 'var(--line)'}` }}>
            <div className="display" style={{ fontSize: 22, width: 46, textAlign: 'center', color: rankColor(i) }}>{medal(i)}</div>
            <div style={{ flex: 1 }}>
              <div className="display" style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>{row.name}</div>
              {row.sub && <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{row.sub}</div>}
            </div>
            <div className="mono" style={{ fontSize: 22, color: i === 0 ? 'var(--warn)' : 'var(--ink)' }}>{money(row.cost)}</div>
          </div>
        ))}
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
