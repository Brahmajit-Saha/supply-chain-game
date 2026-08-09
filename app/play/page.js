'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

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
  const pollRef = useRef(null);

  const loadTeams = useCallback(async () => {
    const { data } = await supabase.rpc('get_team_counts');
    setTeams(data || []);
    return data || [];
  }, []);

  const loadProfile = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { router.replace('/'); return null; }
    const { data } = await supabase
      .from('profiles').select('id, name, system_role, team_id')
      .eq('id', sess.session.user.id).single();
    return data;
  }, [router]);

  const loadSeat = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_seat');
    const s = data && data.length ? data[0] : null;
    setSeat(s);
    return s;
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
        const t = ts.find((x) => x.id === p.team_id);
        setTeamName(t ? t.name : '');
        await loadSeat();
      }
      setLoading(false);
    }
    init();
  }, [router, loadProfile, loadTeams, loadSeat]);

  // While joined but not yet seated, poll for the seat reveal.
  useEffect(() => {
    const shouldPoll = profile?.team_id && !seat && !picking;
    if (shouldPoll) {
      pollRef.current = setInterval(() => { loadSeat(); }, 5000);
      return () => clearInterval(pollRef.current);
    }
  }, [profile?.team_id, seat, picking, loadSeat]);

  async function submit() {
    setError('');
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!selected) { setError('Please choose a team.'); return; }
    setSubmitting(true);
    const { error } = await supabase.rpc('join_team', { p_team_id: selected, p_name: name.trim() });
    if (error) { setError(error.message); setSubmitting(false); return; }
    const p = await loadProfile();
    const ts = await loadTeams();
    setProfile(p);
    const t = ts.find((x) => x.id === p.team_id);
    setTeamName(t ? t.name : '');
    setPicking(false);
    setSubmitting(false);
  }

  async function logout() { await supabase.auth.signOut(); router.replace('/'); }

  if (loading) return <main style={center}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></main>;

  // 1) Seated — reveal role, table, TA.
  if (seat) {
    return (
      <main style={center}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>You&apos;re seated</div>
          <h1 style={{ fontSize: 30, margin: '0 0 4px', fontWeight: 700 }}>{seat.role}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 24px', fontSize: 16 }}>
            Team {teamName}
          </p>
          <div className="card" style={{ padding: '20px 22px', marginBottom: 24 }}>
            <div style={{ fontSize: 15, marginBottom: 6 }}>
              Please go to <strong>Table {seat.table_number}</strong>.
            </div>
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

  // 2) Joined, waiting for seating.
  if (joined) {
    return (
      <main style={center}>
        <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>You&apos;re in</div>
          <h1 style={{ fontSize: 26, margin: '0 0 8px', fontWeight: 700 }}>Team {teamName}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 24px' }}>
            Thanks{profile.name ? `, ${profile.name}` : ''} — you&apos;re on Team {teamName}.
          </p>
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

  // 3) Pick name + team.
  return (
    <main style={center}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        <div className="eyebrow" style={{ marginBottom: 12, textAlign: 'center' }}>Join the game</div>
        <h1 style={{ fontSize: 26, margin: '0 0 6px', textAlign: 'center', fontWeight: 700 }}>Your name &amp; team</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 24px', textAlign: 'center', fontSize: 15 }}>
          Enter your name and pick a team.
        </p>

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
                <span style={{ fontSize: 13, color: full ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {full ? 'Full' : `${t.member_count}/4`}
                </span>
              </button>
            );
          })}
        </div>

        {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}

        <button className="btn btn-primary" onClick={submit} disabled={submitting} style={{ width: '100%', marginTop: 22 }}>
          {submitting ? 'Joining…' : 'Join team'}
        </button>
        {profile?.team_id && (
          <button className="btn-ghost" onClick={() => setPicking(false)} style={{ width: '100%', marginTop: 10 }}>Cancel</button>
        )}
      </div>
    </main>
  );
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '92px 24px 64px' };
const fieldLabel = { fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 };
function teamOption(sel, full) {
  return {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '13px 16px', borderRadius: 8,
    border: `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
    background: sel ? 'var(--surface-2)' : 'var(--surface)',
    color: full ? 'var(--text-muted)' : 'var(--text)',
    fontSize: 15, cursor: full ? 'not-allowed' : 'pointer',
    opacity: full ? 0.5 : 1, width: '100%', textAlign: 'left',
  };
}
