import './globals.css';
import Header from './components/Header';

// Same typography as the OPS in One Word game: Chakra Petch (headings), JetBrains Mono (numbers), Inter (body).
// Fonts are bundled from npm (@fontsource), so the build never has to download anything from Google.
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';

export const metadata = {
  title: 'OPSPHERE · Supply Chain Simulation',
  description: 'OPSPHERE — Operations Club, IBS',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <footer
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            textAlign: 'center',
            padding: '12px',
            fontSize: '13px',
            letterSpacing: '0.02em',
            color: 'var(--text-muted)',
          }}
        >
          Built by Brahmajit Saha
        </footer>
      </body>
    </html>
  );
}
