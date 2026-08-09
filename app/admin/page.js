'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

const EMPTY_TEAMS = [{ name: '' }, { name: '' }, { name: '' }, { name: '' }];

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

  const loadTables = useCallback(async () => {
    const { data: gt } = await supabase
      .from('game_table')
      .select('id, number, ta_email, table_admin_id')
      .order('number');
    const rows = gt || [];
    const adminIds = rows.filter((t) => t.table_admin_id).map((t) => t.table_admin_id);
    let byId = {};
    if (adminIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', adminIds);
      (profs || []).forEach((p) => { byId[p.id] = p; });
    }
    setTables(rows.map((t) => ({ ...t, admin: t.table_admin_id ? byId[t.table_admin_id] : null })));
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

      await loadTables();
      setLoading(false);
    }
    init();
  }, [router, loadTables]);

  // ---- Teams ----
  function setTeamName(i, val) {
    setTeams((prev) => prev.map((t, idx) => (idx === i ? { ...t, name: val } : t)));
  }
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
          if (error) throw error;
          updated[i].id = data.id;
        }
      }
      setTeams(updated); setTeamMsg('Teams saved.');
    } catch (e) { setTeamMsg('Error: ' + e.message); }
    setSavingTeams(false);
  }

  // ---- Table Admins ----
  function setTaEmail(i, val) {
    setTables((prev) => prev.map((t, idx) => (idx === i ? { ...t, ta_email: val } : t)));
  }
  async function saveTAs() {
    setSavingTAs(true); setTaMsg('');
    try {
      for (const row of tables) {
        const email = (row.ta_email || '').trim().toLowerCase() || null;
        const { error } = await supabase.from('game_table').update({ ta_email: email }).eq('id', row.id);
        if (error) {
          if (error.code === '23505') {
            throw new Error(`"${email}" is already assigned to another table.`);
          }
          throw error;
        }
      }
      await loadTables();
      setTaMsg('Table Admins saved.');
    } catch (e) { setTaMsg('Error: ' + e.message); }
    setSavingTAs(false);
  }
  async function refreshStatus() {
    setRefreshing(true); setTaMsg('');
    await loadTables();
    setRefreshing(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (loading) {
    return <main style={wrap}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></main>;
  }

  return (
    <main style={wrap}>
      <div style={{ width: '100%', maxWidth: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div className="eyebrow">Master Admin</div>
            <h1 style={{ fontSize: 26, margin: '4px 0 0', fontWeight: 700 }}>Event setup</h1>
          </div>
          <button className="btn-ghost" onClick={logout}>Sign out</button>
        </div>

        {/* Teams */}
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
            <button className="btn btn-primary" onClick={saveTeams} disabled={savingTeams} style={{ minWidth: 140 }}>
              {savingTeams ? 'Saving…' : 'Save teams'}
            </button>
            {teamMsg && <span style={msgStyle(teamMsg)}>{teamMsg}</span>}
          </div>
        </div>

        {/* Table Admins */}
        <div className="card" style={{ padding: 22, marginTop: 16 }}>
          <h2 style={cardTitle}>Table Admins</h2>
          <p style={cardSub}>
            Assign a TA email to each table. They sign in with the shared password like everyone
            else and are promoted automatically. Change an email anytime — the previous person
            reverts to a player.
          </p>

          {tables.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 62, color: 'var(--text-muted)', fontSize: 14 }}>Table {t.number}</div>
              <input
                className="input"
                style={{ flex: 1 }}
                value={t.ta_email || ''}
                onChange={(e) => setTaEmail(i, e.target.value)}
                placeholder="ta@ibsindia.org"
              />
              <div style={{ width: 150, textAlign: 'right' }}>{statusBadge(t)}</div>
            </div>
          ))}

          <div style={actionRow}>
            <button className="btn btn-primary" onClick={saveTAs} disabled={savingTAs} style={{ minWidth: 160 }}>
              {savingTAs ? 'Saving…' : 'Save Table Admins'}
            </button>
            <button className="btn-ghost" onClick={refreshStatus} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh status'}
            </button>
            {taMsg && <span style={msgStyle(taMsg)}>{taMsg}</span>}
          </div>
        </div>
      </div>
    </main>
  );
}

function statusBadge(t) {
  if (!t.ta_email) return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>;
  if (t.admin) {
    return (
      <span style={{ color: 'var(--success)', fontSize: 13 }}>
        ✓ logged in{t.admin.name ? ` · ${t.admin.name}` : ''}
      </span>
    );
  }
  return <span style={{ color: '#d29922', fontSize: 13 }}>waiting for login</span>;
}

const wrap = { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '92px 24px 64px' };
const cardTitle = { fontSize: 17, margin: '0 0 4px', fontWeight: 600 };
const cardSub = { color: 'var(--text-muted)', fontSize: 14, margin: '0 0 18px' };
const fieldLabel = { fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 };
const actionRow = { display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' };
const msgStyle = (m) => ({ fontSize: 14, color: m.startsWith('Error') ? 'var(--danger)' : 'var(--success)' });
