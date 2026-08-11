'use client';

import { useState } from 'react';

// ▼▼▼ Names — edit only the text inside the quotes ▼▼▼
const CLUB_NAME = 'OPSPHERE';
const GAME_NAME = 'SUPPLY CHAIN SIMULATOR';
// ▲▲▲

export default function Header() {
  const [showLogo, setShowLogo] = useState(true);
  const [showIbs, setShowIbs] = useState(true);

  return (
    <header
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 72, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '0 22px',
        background: 'rgba(10, 7, 20, 0.82)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {/* left — club logo + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {showLogo && (
          <img src="/logo.png" alt="OPSPHERE" onError={() => setShowLogo(false)}
            style={{ height: 48, width: 'auto', display: 'block' }} />
        )}
        <span className="display" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--ink)' }}>{CLUB_NAME}</span>
      </div>

      {/* center — game name */}
      <div className="display hdr-center" style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.16em', color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>
        {GAME_NAME}
      </div>

      {/* right — IBS Bangalore logo on a light chip so it reads on the dark bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
        {showIbs && (
          <div style={{ background: '#fff', borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center' }}>
            <img src="/ibs-logo.png" alt="IBS Bangalore" onError={() => setShowIbs(false)}
              style={{ height: 34, width: 'auto', display: 'block' }} />
          </div>
        )}
      </div>
    </header>
  );
}
