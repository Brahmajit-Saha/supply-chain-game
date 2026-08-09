'use client';

import { useState } from 'react';

// ▼▼▼ Club name — change only the text inside the quotes ▼▼▼
const CLUB_NAME = 'OPSPHERE';
// ▲▲▲

export default function Header() {
  const [showLogo, setShowLogo] = useState(true);

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 18px',
        zIndex: 10,
      }}
    >
      {showLogo && (
        <img
          src="/logo.png"
          alt="OPSPHERE"
          onError={() => setShowLogo(false)}
          style={{ height: 38, width: 'auto', display: 'block' }}
        />
      )}
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--text)',
        }}
      >
        {CLUB_NAME}
      </span>
    </header>
  );
}
