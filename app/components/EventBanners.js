'use client';

// Edit this flavor text freely — it's the only place the messages live.
const ACTIVE_MSG = {
  surge1: '🍺🔥 Looks like the party is lit — let the Kings of Good Times roll! 👑🎸',
  surge2: '🏏🍻 It\u2019s FINALS night — the whole city\u2019s watching and thirsty. Demand\u2019s through the roof! 📈🔥',
  slump1: '📉😴 Post-party hangover... wallets are empty and the shelves are quiet. Demand\u2019s tanked. 🪫',
  slump2: '📉😴 Post-party hangover... wallets are empty and the shelves are quiet. Demand\u2019s tanked. 🪫',
  shutdown: '⛔🏭 FACTORY SHUTDOWN this week — no new production is possible! 😱',
};
const WARN_MSG = {
  surge1: (n) => `🎉📣 Word on the street — a huge party week is coming in ${n} week${n === 1 ? '' : 's'}. Stock up while you can! 📦🍻`,
  surge2: (n) => `🏏📣 The big match is ${n} week${n === 1 ? '' : 's'} away — every shop is about to run dry. Load up! 📦`,
  shutdown: () => '🤔💭 Hmmm.... something doesn\u2019t smell right......',
};

function colorFor(key) {
  if (!key) return '#d29922';
  if (key.startsWith('surge')) return '#d29922';
  if (key.startsWith('slump')) return '#B9A6FF';
  return '#f85149'; // shutdown
}
function banner(color) {
  return {
    border: `1px solid ${color}`, background: 'rgba(255,255,255,0.03)', color,
    borderRadius: 8, padding: '10px 14px', fontSize: 14, fontWeight: 600, marginBottom: 10,
  };
}

export default function EventBanners({ active, warning, warningIn }) {
  const warnFn = warning && WARN_MSG[warning];
  const activeText = active && ACTIVE_MSG[active];
  if (!warnFn && !activeText) return null;
  return (
    <div>
      {warnFn && <div style={banner(colorFor(warning))}>{warnFn(warningIn)}</div>}
      {activeText && <div style={banner(colorFor(active))}>{activeText}</div>}
    </div>
  );
}
