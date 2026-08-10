'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

const EMPTY_TEAMS = [{ name: '' }, { name: '' }, { name: '' }, { name: '' }];
const ROLES = ['Retailer', 'Wholesaler', 'Distributor', 'Factory'];
const PHASE_LABEL = {
  arrivals_resolved: 'Arrivals resolved',
  demand_revealed: 'Demand revealed',
  strategy: 'Strategy (thinking)',
  ordering_retailer: 'Ordering — Retailer',
  ordering_wholesaler: 'Ordering — Wholesaler',
  ordering_distributor: 'Ordering — Distributor',
  ordering_factory: 'Ordering — Factory',
  resolved: 'Round resolved',
};

export default function Admin() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

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
  const pollRef = useRef(null);
  const [now, setNow] = useState(Date.now());

  const loadTables = useCallback(async () => {
    const { data: gt } = await supabase
      .from('game_table').select('id, number, ta_email, table_admin_id').order('number');
    const rows = gt || [];
    const adminIds = rows.filter((t) => t.table_admin_id).map((t) => t.table_admin_id);
    let byId = {};
    if (adminIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', adminIds);
      (profs || []).forEach((p) => { byId[p.id] = p; });
    }
    setTables(rows.map((t) => ({ ...t, admin: t.table_admin_id ? byId[t.table_admin_id] : null })));
  }, []);

  const loadCounts = useCallback(async () => {
    const { data } = await supabase.rpc('get_team_counts');
    setTeamCounts(data || []);
  }, []);

  const loadOverview = useCallback(async () => {
    const { data } = await supabase.rpc('get_seating_overview');
    setOverview(data || []);
  }, []);

  const loadEngine = useCallback(async () => {
    const { data: ctrl } = await supabase.rpc('get_control');
    setControl(ctrl && ctrl.length ? ctrl[0] : null);
    const { data: g } = await supabase.rpc('get_admin_grid');
    setGrid(g || []);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { router.replace('/'); return; }
      const { data: prof } = await supabase
        .from('profiles').select('system_role').eq('id', sess.session.user.id).single();
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

  // Poll the live grid while the game is running.
  useEffect(() => {
    if (control?.status === 'running') {
      pollRef.current = setInterval(() => { loadEngine(); }, 2000);
      return () => clearInterval(pollRef.current);
    }
  }, [control?.status, loadEngine]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- Teams ----
  function setTeamName(i, val) { setTeams((p) => p.map((t, idx) => (idx === i ? { ...t, name: val } : t))); }
  async function saveTeams() {
    setSavingTeams(true); setTeamMsg('');
    try {
      const updated = teams.map((t) => ({ ...t }));
      for (let i = 0; i < updated.length; i++) {
        const name = (updated[i].name || '').trim();
        if (!name) continue;
        if (updated[i].id) {
          const { error } = await supabase.from('team').update({ name }).eq('id', updated[i].id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('team').insert({ name }).select('id').single();
          if (error) throw error; updated[i].id = data.id;
        }
      }
      setTeams(updated); setTeamMsg('Teams saved.'); await loadCounts();
    } catch (e) { setTeamMsg('Error: ' + e.message); }
    setSavingTeams(false);
  }

  // ---- Table Admins ----
  function setTaEmail(i, val) { setTables((p) => p.map((t, idx) => (idx === i ? { ...t, ta_email: val } : t))); }
  async function saveTAs() {
    setSavingTAs(true); setTaMsg('');
    try {
      for (const row of tables) {
        const email = (row.ta_email || '').trim().toLowerCase() || null;
        const { error } = await supabase.from('game_table').update({ ta_email: email }).eq('id', row.id);
        if (error) {
          if (error.code === '23505') throw new Error(`"${email}" is already assigned to another table.`);
          throw error;
        }
      }
      await loadTables(); setTaMsg('Table Admins saved.');
    } catch (e) { setTaMsg('Error: ' + e.message); }
    setSavingTAs(false);
  }
  async function refreshStatus() { setRefreshing(true); setTaMsg(''); await loadTables(); await loadCounts(); setRefreshing(false); }

  // ---- Seating ----
  async function generateSeating() {
    if (overview.length > 0 && !window.confirm('Seating already exists. Re-generating will reshuffle everyone. Continue?')) return;
    setGenerating(true); setSeatMsg('');
    const { error } = await supabase.rpc('generate_seating');
    if (error) { setSeatMsg('Error: ' + error.message); setGenerating(false); return; }
    await loadOverview(); setSeatMsg('Seating generated.'); setGenerating(false);
  }

  // ---- Engine ----
  async function startGame() {
    if (control?.status !== 'setup' && !window.confirm('This will RESTART the game from round 1 and wipe current progress. Continue?')) return;
    setEngineBusy(true); setEngineMsg('');
    const { error } = await supabase.rpc('start_game');
    if (error) setEngineMsg('Error: ' + error.message); else setEngineMsg('Game started.');
    await loadEngine(); setEngineBusy(false);
  }
  async function advancePhase() {
    setEngineBusy(true); setEngineMsg('');
    const { error } = await supabase.rpc('advance_phase');
    if (error) setEngineMsg('Error: ' + error.message);
    await loadEngine(); setEngineBusy(false);
  }
  async function pauseGame() {
    setEngineBusy(true); setEngineMsg('');
    const { error } = await supabase.rpc('pause_game');
    if (error) setEngineMsg('Error: ' + error.message);
    await loadEngine(); setEngineBusy(false);
  }
  async function resumeGame() {
    setEngineBusy(true); setEngineMsg('');
    const { error } = await supabase.rpc('resume_game');
    if (error) setEngineMsg('Error: ' + error.message);
    await loadEngine(); setEngineBusy(false);
  }

  async function logout() { await supabase.auth.signOut(); router.replace('/'); }

  if (loading) return <main style={wrap}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></main>;

  const totalPlayers = teamCounts.reduce((s, t) => s + Number(t.member_count), 0);
  const fourFullTeams = teamCounts.length === 4 && teamCounts.every((t) => Number(t.member_count) === 4);
  const tasLoggedIn = tables.filter((t) => t.table_admin_id).length;
  const ready = fourFullTeams && tasLoggedIn === 4;
  const seated = overview.length > 0;

  const seatGrid = {};
  overview.forEach((r) => { seatGrid[`${r.role}|${r.table_number}`] = r; });
  const liveGrid = {};
  grid.forEach((r) => { liveGrid[`${r.role}|${r.table_number}`] = r; });

  const status = control?.status || 'setup';
  const maRemaining = control?.phase_ends_at
    ? Math.max(0, Math.ceil((new Date(control.phase_ends_at).getTime() - now) / 1000))
    : null;

  return (
    <main style={wrap}>
      <div style={{ width: '100%', maxWidth: 760 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div className="eyebrow">Master Admin</div>
            <h1 style={{ fontSize: 26, margin: '4px 0 0', fontWeight: 700 }}>Event control</h1>
          </div>
          <button className="btn-ghost" onClick={logout}>Sign out</button>
        </div>

        {/* Live game */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={cardTitle}>Live game</h2>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {status === 'running' ? `Round ${control.current_round} / ${control.total_rounds}` : status === 'complete' ? 'Complete' : 'Not started'}
            </span>
          </div>

          {status !== 'setup' && (
            <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', margin: '6px 0 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {PHASE_LABEL[control.phase] || control.phase || '—'}
                {maRemaining != null && status === 'running' && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginLeft: 10 }}>{maRemaining}s</span>
                )}
                {status === 'paused' && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#d29922', marginLeft: 10 }}>Paused</span>
                )}
              </div>
              {control.current_demand != null && (
                <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Customer demand: <strong style={{ color: 'var(--text)' }}>{control.current_demand}</strong></div>
              )}
            </div>
          )}

          <div style={actionRow}>
            {status === 'setup' ? (
              <button className="btn btn-primary" onClick={startGame} disabled={engineBusy || !seated} style={{ minWidth: 150, opacity: seated ? 1 : 0.5 }}>
                {engineBusy ? 'Starting…' : 'Start game'}
              </button>
            ) : (
              <>
                {status === 'running' && (
                  <button className="btn-ghost" onClick={pauseGame} disabled={engineBusy}>Pause</button>
                )}
                {status === 'paused' && (
                  <button className="btn btn-primary" onClick={resumeGame} disabled={engineBusy} style={{ minWidth: 120 }}>
                    {engineBusy ? 'Working…' : 'Resume'}
                  </button>
                )}
                <button className="btn-ghost" onClick={advancePhase} disabled={engineBusy || status !== 'running'}>Force-advance</button>
                <button className="btn-ghost" onClick={startGame} disabled={engineBusy}>Restart game</button>
              </>
            )}
            <button className="btn-ghost" onClick={loadEngine}>Refresh</button>
            {engineMsg && <span style={msgStyle(engineMsg)}>{engineMsg}</span>}
          </div>
          {!seated && status === 'setup' && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>Generate seating below before starting.</p>
          )}

          {status !== 'setup' && grid.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 18 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                <thead>
                  <tr><th style={th}></th>{[1, 2, 3, 4].map((n) => <th key={n} style={th}>Table {n}</th>)}</tr>
                </thead>
                <tbody>
                  {ROLES.map((role) => (
                    <tr key={role}>
                      <td style={{ ...td, color: 'var(--text-muted)', fontWeight: 600 }}>{role}</td>
                      {[1, 2, 3, 4].map((n) => {
                        const c = liveGrid[`${role}|${n}`];
                        return (
                          <td key={n} style={td}>
                            {c ? (
                              <div style={{ lineHeight: 1.5 }}>
                                <span>Inv <strong>{c.inventory}</strong></span>{'  '}
                                <span style={{ color: c.backlog > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>Back {c.backlog}</span>
                                <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                  order {c.last_order == null ? '—' : c.last_order}
                                </div>
                              </div>
                            ) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Teams */}
        <div className="card" style={{ padding: 22, marginTop: 16 }}>
          <h2 style={cardTitle}>Teams</h2>
          <p style={cardSub}>Name the four teams. Players pick from these when they sign in.</p>
          {teams.map((t, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <label style={fieldLabel}>Team {i + 1}</label>
              <input className="input" value={t.name} onChange={(e) => setTeamName(i, e.target.value)} placeholder={`e.g. Team ${i + 1}`} />
            </div>
          ))}
          <div style={actionRow}>
            <button className="btn btn-primary" onClick={saveTeams} disabled={savingTeams} style={{ minWidth: 140 }}>
              {savingTeams ? 'Saving…' : 'Save teams'}
            </button>
            {teamMsg && <span style={msgStyle(teamMsg)}>{teamMsg}</span>}
          </div>
        </div>

        {/* Table Admins */}
        <div className="card" style={{ padding: 22, marginTop: 16 }}>
          <h2 style={cardTitle}>Table Admins</h2>
          <p style={cardSub}>Assign a TA email to each table. Change an email anytime — the previous person reverts to a player.</p>
          {tables.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 62, color: 'var(--text-muted)', fontSize: 14 }}>Table {t.number}</div>
              <input className="input" style={{ flex: 1 }} value={t.ta_email || ''} onChange={(e) => setTaEmail(i, e.target.value)} placeholder="ta@ibsindia.org" />
              <div style={{ width: 160, textAlign: 'right' }}>{statusBadge(t)}</div>
            </div>
          ))}
          <div style={actionRow}>
            <button className="btn btn-primary" onClick={saveTAs} disabled={savingTAs} style={{ minWidth: 160 }}>
              {savingTAs ? 'Saving…' : 'Save Table Admins'}
            </button>
            <button className="btn-ghost" onClick={refreshStatus} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh status'}</button>
            {taMsg && <span style={msgStyle(taMsg)}>{taMsg}</span>}
          </div>
        </div>

        {/* Seating */}
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
                      <td style={{ ...td, color: 'var(--text-muted)', fontWeight: 600 }}>{role}</td>
                      {[1, 2, 3, 4].map((n) => {
                        const cell = seatGrid[`${role}|${n}`];
                        return <td key={n} style={td}>{cell ? (<><div>{cell.player_name}</div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{cell.team_name}</div></>) : '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Check({ ok, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
      <span style={{ color: ok ? 'var(--success)' : '#d29922' }}>{ok ? '✓' : '○'}</span>
      <span style={{ color: ok ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}
function statusBadge(t) {
  if (!t.ta_email) return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>;
  if (t.admin) return <span style={{ color: 'var(--success)', fontSize: 13 }}>✓ logged in{t.admin.name ? ` · ${t.admin.name}` : ''}</span>;
  return <span style={{ color: '#d29922', fontSize: 13 }}>waiting for login</span>;
}

const wrap = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '92px 24px 64px' };
const cardTitle = { fontSize: 17, margin: '0 0 4px', fontWeight: 600 };
const cardSub = { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 18px' };
const fieldLabel = { fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 };
const actionRow = { display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' };
const msgStyle = (m) => ({ fontSize: 14, color: m.startsWith('Error') ? 'var(--danger)' : 'var(--success)' });
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 };
const td = { padding: '8px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
