'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    async function route() {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { router.replace('/'); return; }
      const { data } = await supabase
        .from('profiles').select('system_role').eq('id', sess.session.user.id).single();
      const role = data?.system_role;
      if (role === 'MA') router.replace('/admin');
      else if (role === 'TableAdmin') router.replace('/table');
      else router.replace('/play');
    }
    route();
  }, [router]);

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
    </main>
  );
}
