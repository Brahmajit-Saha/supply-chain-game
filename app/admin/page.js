'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

const EMPTY = [{ name: '' }, { name: '' }, { name: '' }, { name: '' }];

export default function Admin() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    async function init() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace('/');
        return;
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('system_role')
        .eq('id', sess.session.user.id)
        .single();
      if (!prof || prof.system_role !== 'MA') {
        router.replace('/home');
        return;
      }
      const { data: existing } = await supabase.from('team').select('id, name').order('id');
      const slots = EMPTY.map((s) => ({ ...s }));
      (existing || []).slice(0, 4).forEach((t, i) => {
        slots[i] = { id: t.id, name: t.name };
      });
      setTeams(slots);
      setLoading(false);
    }
    init();
  }, [router]);

  function setName(i, val) {
    setTeams((prev) => prev.map((t, idx) => (idx === i ? { ...t, name: val } : t)));
  }

  async function saveTeams() {
    setSaving(true);
    setMsg('');
    try {
      const updated = teams.map((t) => ({ ...t }));
      for (let i = 0; i < updated.length; i++) {
        const name = (updated[i].name || '').trim();
        if (!name) continue;
        if (updated[i].id) {
          const { error } = await supabase.from('team').update({ name }).eq('id', updated[i].id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('team')
            .insert({ name })
            .select('id')
            .single();
          if (error) throw error;
          updated[i].id = data.id;
        }
      }
      setTeams(updated);
      setMsg('Teams saved.');
    } catch (e) {
      setMsg('Error: ' + e.message);
    }
    setSaving(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (loading) {
    return (
      <main style={wrap}>
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div>
            <div className="eyebrow">Master Admin</div>
            <h1 style={{ fontSize: 26, margin: '4px 0 0', fontWeight: 700 }}>Event setup</h1>
          </div>
          <button className="btn-ghost" onClick={logout}>Sign out</button>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 4px', fontWeight: 600 }}>Teams</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 18px' }}>
            Name the four teams. Players will pick from these when they sign in.
          </p>

          {teams.map((t, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Team {i + 1}
              </label>
              <input
                className="input"
                value={t.name}
                onChange={(e) => setName(i, e.target.value)}
                placeholder={`e.g. Team ${i + 1}`}
              />
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
            <button
              className="btn btn-primary"
              onClick={saveTeams}
              disabled={saving}
              style={{ minWidth: 140 }}
            >
              {saving ? 'Saving…' : 'Save teams'}
            </button>
            {msg && (
              <span style={{ fontSize: 14, color: msg.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>
                {msg}
              </span>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 22, marginTop: 16, color: 'var(--text-muted)', fontSize: 14 }}>
          Next: assigning your four Table Admins. Coming in the next step.
        </div>
      </div>
    </main>
  );
}

const wrap = {
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  padding: '92px 24px 64px',
};
